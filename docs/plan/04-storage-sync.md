# 04. 초기화·원격 저장·동기화

상태: 상세화 중. 관련 결정: Q01, Q02, Q06, Q10, Q11, Q12. 근거: [저장소 설계](../spec/project-history-design.md), [쓰기·동기화 CLI](../spec/core-cli-interface.md).

## 목표와 산출물

별도 GitHub 저장소를 히스토리의 기준 저장소로 사용한다. init, flush, entry set-status, sync와 필요한 git 작업·락·실패 복구를 상세화한다. 토큰·자격증명은 저장하지 않는다.

## 초기화 흐름

1. init check: gh 설치·로그인, 사용자, 코드 저장소, 설정 존재 여부를 반환한다.
2. 에이전트가 새 저장소 또는 기존 저장소 사용을 사용자와 정한다.
3. init create: 새 저장소 생성 또는 기존 저장소 write 권한 확인, history.yml의 repos에 현재 코드 저장소 추가.
4. init config: 코드 저장소에 .history.yml을 작성한다.
5. 팀원은 공유된 설정으로 캐시를 clone한다.

기본 저장소 이름은 org/repo-history, 새 저장소는 private이 기존 설계다. 저장소는 history.yml, README, entries/YYYY/MM, templates/entry.md를 포함한다. 재실행·중간 실패·기존 설정 덮어쓰기·기존 저장소 스키마 불일치의 처리 규칙은 미정이다.

## 확정된 저장 트리거

- 결정 인지·보완 시 로컬 초안 생성·갱신. 이 자체로 원격 전송하지 않는다.
- auto_save 기본 true. 코드 PR 생성·push 직전과 세션 시작 시 연결 PR이 open/merged인 미전송 초안을 최소 요건 검증 후 전송한다.
- 세션 시작 시 연결 PR이 없으면 로컬 유지. auto_save: false면 자동 전송을 제안만 한다. 최소 요건을 통과한 로컬 초안이 있다면 게이트에서도 전송 안내 후 gate 값과 관계없이 코드 작업을 허용한다(Q15b).
- 명시적 기록·전송 요청은 PR 존재나 auto_save 값과 관계없이 원격 저장한다.
- 기존 기록의 PR URL·상태 동기화는 유지하고 질문 댓글은 별도 사용자 승인 후 게시한다.
- 네트워크·원격 권한 오류로 전송 실패 시 초안 보존·실패 안내 후 gate 값과 관계없이 코드 작업을 허용하고 다음 자동 저장 시점에 재전송한다(Q15a). 기타 오류는 Q15, 상세 실패 복구는 Q10에서 정한다.

정확한 조건은 [설계의 자동 저장 정책](../spec/project-history-design.md#711-자동-저장-정책-q02-확정)을 따른다. closed인 미전송 초안·여러 PR 연결 등은 추가 결정이 필요하다.

## flush의 기존 처리 순서

검증 → pull --rebase → 엔트리 작성 → 새 결정이 accepted인 경우에만 supersedes 대상 갱신 → commit → direct이면 push, pr이면 엔트리 브랜치 push 및 PR 생성 → 초안 삭제 → 인덱스 재빌드.

입력은 branch 또는 PR, 선택 status·id다. 결과는 flushed 목록과 mode이며 각 항목은 id/status/path/url/commit을 담는다.

## 반드시 구분할 저장 단계

| 단계 | 기존 규약 | 상세화 필요 |
|---|---|---|
| 락 | 저장소별 파일 락 | 대기·만료·프로세스 종료·중첩 sync |
| pull/rebase | push 실패 시 rebase 후 1회 재시도 | 실제 파일 충돌과 네트워크 오류 구분 |
| 파일 작성 | id별 경로 불변 | 동일 id 동시 생성·부분 파일 작성·원자성 |
| commit | history 메시지 규격 | 다중 엔트리 묶음, 변경 없음, 사용자 git 설정 실패 |
| push | 실패 시 로컬 커밋 유지 | 다음 실행의 중복 방지·복구 안내 |
| 초안 삭제 | 원격 반영 뒤 삭제 | PR 모드의 성공 기준, 일부 성공 시 보존 범위 |
| 인덱스 갱신 | 반영 뒤 재빌드 | push 성공·인덱스 실패의 응답과 재실행 |

## 상태 전이

Q12b: 하나 이상의 구현 PR(type: pr, role: implements)이 연결된 경우 모두 머지되어야 자동 accepted로 전이한다. 일부만 머지되고 나머지가 열려 있으면 proposed다. discusses 링크는 판정에서 제외한다. 대상 --pr 하나가 머지됐다는 이유만으로 전체 결정이 적용됐다고 판정하지 않는다.

Q12a: 새 결정이 accepted에 진입할 때만 기존 supersedes 대상을 superseded로 바꾼다. proposed 저장은 대체 의도만 기록하며 이전 결정 상태를 유지한다. flush·sync·entry set-status 모두 같은 규칙을 적용한다.

구현 PR 없음은 기본 proposed이며 코드 없는 결정은 명시적으로 accepted 저장하는 흐름이다. Q12c: 하나 이상의 구현 PR이 모두 머지 없이 닫히면 rejected다. 일부 닫혔지만 열린 PR이 남거나 merged와 미머지 닫힘이 혼재하면 proposed를 유지하고 연결 정리를 안내한다. Q12d: rejected의 연결 구현 PR이 재개방되면 자동 proposed로 복귀한다. accepted/superseded/reverted 복구에는 이 규칙을 적용하지 않는다.

추가 질문: PR 연결 변경·재개방 직후 머지되어 open을 관측하지 못한 경우, 수동 전이 허용표와 자동 판정 우선순위, reverted의 연결 방식, 대체 순환 및 다중 대체, 상태 변경의 실패 복구.

## sync와 PR 모드

sync는 fetch, 인덱스 재빌드, proposed와 재개방 감지가 필요한 rejected의 연결 코드 PR 상태 확인과 전이·push를 수행한다. 전체 과거 PR 스캔은 하지 않으며 이미 기록에 연결된 PR을 대상으로 한다. 상태 변경 뒤 인덱스를 어떻게 최신화할지와 --no-fetch의 원격 쓰기 범위는 결정이 필요하다.

PR 모드는 entry/id 브랜치와 히스토리 PR을 사용한다. 병합 전 엔트리 조회, 수정 시 기존 브랜치 재사용, 히스토리 PR 병합 주체와 auto-merge 미지원 상황, 코드 PR 종료 후 동작을 사용자와 확정한다.

## 확정 상태 전이 검증

| 상태·입력 | 기대 동작 |
|---|---|
| 구현 PR 두 개 중 하나 merged, 다른 하나 open | proposed 유지 |
| 구현 PR 전부 merged, discusses PR open | accepted 전이 가능 |
| 구현 PR 없음 | 전체 머지 조건으로 자동 accepted 처리하지 않음 |
| 새 proposed 기록이 이전 accepted 기록을 supersedes로 참조 | 이전 기록 accepted 유지 |
| 새 기록이 accepted로 전이 | 대체 대상 기록을 superseded로 갱신 |
| 인덱스·show에 아직 proposed인 대체 제안 존재 | 제안만으로 이전 기록을 폐기된 결정으로 안내하지 않음 |
| proposed, 구현 PR 전부 미머지 closed | rejected 전이 |
| proposed, 일부 closed + 나머지 open | proposed 유지·연결 정리 안내 |
| proposed, merged + 미머지 closed | proposed 유지·연결 정리 안내 |
| rejected, 연결 구현 PR 재개방 | proposed 복귀 |
| superseded/reverted, 과거 구현 PR 재개방 | 재개방만으로 자동 복구하지 않음 |

## 검증할 시나리오

새 저장소·기존 저장소·두 번째 팀원 초기화, direct/pr 기록, 같은 입력 재실행, 두 클라이언트의 동시 기록, pull/commit/push/인덱스 각 단계 실패, 다중 초안 일부 실패, PR 상태 변화 및 대체 관계를 검증한다. 복구의 기대 결과는 Q10–Q12 확정 후 명시한다.
