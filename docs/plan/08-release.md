# 08. 통합 검증·배포·완료 관리

상태: 상세화 중. 관련 결정: Q04, Q05, Q13, Q16. 근거: [전체 계획](README.md), [제품 설계](../spec/project-history-design.md).

## 현재 기반

core에 build/typecheck/test 스크립트가 있지만 테스트 파일은 없다. README는 프로젝트 제목만 있다. core와 plugin 버전은 0.0.0이다. npm 배포·플러그인 설치·호스트 호환성은 검증되지 않았다.

## 확정된 지원 범위 (Q05a)

v1 공식 지원 운영체제는 macOS·Linux·Windows다. 릴리스 검증은 Windows 자체 환경을 포함하며 세 운영체제 중 하나라도 필수 기능 검증이 빠진 상태를 전체 v1 호환성 완료로 표시하지 않는다. WSL2는 Linux 실행 환경으로 추가 지원하고 WSL1은 비공식이다. Node.js는 22 이상을 요구하며 LTS 22·24를 검증한다. git·gh는 버전 숫자 대신 제품이 사용하는 capability를 검사한다.

## 공식 자료 기준선 (2026-09-23)

| 대상 | 확인된 현재 기준 | 계획에 미치는 영향 |
|---|---|---|
| Node.js | 20은 EOL, 22·24는 LTS | Q05b에 따라 22+ 요구, LTS 22·24 검증. package.json의 >=20은 구현 시 수정 |
| Claude Code | macOS 13+, Windows 10 1809+/Server 2019+, Ubuntu 20.04+, Debian 10+, Alpine 3.19+. Windows 네이티브·WSL 지원 | 공식 최소선 이하를 v1 필수 조합으로 잡지 않음. Windows 네이티브 fixture 필수 |
| Claude Code npm 설치 | Node.js 22+ | core의 Node 22+ 제안과 일치하지만 native 설치는 별도이므로 호스트 설치 방식과 제품 런타임을 구분 |
| Codex 플러그인 | portable 루트 manifest 권장, `.codex-plugin` fallback 지원, 번들 훅 신뢰 필요 | Q05d에 따라 portable manifest 기본, fallback 유지. 훅 신뢰 전 수동 스킬 흐름 검증 |
| Codex 훅 | `PLUGIN_ROOT`·`PLUGIN_DATA`, 호환용 Claude 변수, `commandWindows` 제공 | 루트 변수·Windows 명령·호스트별 fixture를 훅 계약에 포함 |
| GitHub CLI | macOS·Linux·Windows 설치 경로 제공 | Q05b에 따라 명령·JSON 필드·인증 capability를 init check에서 검사 |

근거: [Node.js 릴리스](https://nodejs.org/en/about/previous-releases), [Claude Code 설치 요구사항](https://code.claude.com/docs/en/getting-started), [OpenAI 플러그인 패키징](https://developers.openai.com/plugins/build/plugins), [GitHub CLI](https://cli.github.com/).

## 검증 대상

| 범위 | 확인할 내용 | 확정이 필요한 조건 |
|---|---|---|
| 순수 규약 | 스키마·설정·인덱스·토큰화·출력 | 경계값·허용 범위 |
| 로컬 통합 | 초안·캐시·Git 저장·락·복구 | 실패 기대값·동시 실행 방식 |
| GitHub 연동 | 인증·권한·PR·댓글·원격 저장 | mock과 실환경 범위, 시험 저장소 |
| 호스트 연동 | 스킬 호출·훅 이벤트·출력·미신뢰 흐름 | Claude Code/Codex와 macOS·Linux·Windows의 필수 조합·최소 버전 |
| 제품 흐름 | init부터 기록·검색·질문·동기화 | 단계별 인수 조건 |
| 성능 | 검색·번들·세션 훅 | 데이터 크기·시간 측정·허용 기준 |
| 배포물 | 설치·실행·리소스 동봉·업데이트 | npm·플러그인 배포 경로 및 버전 정책 |

테스트 프레임워크·추가 의존성·자동 검사 구성은 이번 계획에서 임의 확정하지 않는다. 프로젝트 CI와 제품이 사용자 저장소에 CI를 요구하지 않는 원칙은 별개다. 자체 CI 도입 여부도 질문 대상이다.

## 배포·지원 질문

1. OS·Node·도구 capability·WSL2·Codex 패키징은 Q05a/b/c/d로 확정했다. 호스트 버전 고정과 업데이트 정책을 어떻게 운영하는가?
2. 제품 표시 이름 histore와 패키지/실행 이름 project-history를 그대로 유지하는가?
3. npm 및 두 호스트 플러그인의 배포 경로와 릴리스 단위는 무엇인가?
4. npx 호출 버전을 고정하는가? 업데이트와 설정·저장소 스키마 호환을 어떻게 보장하는가?
5. doctor, cache clear, migrate를 v1에 어느 범위까지 포함하는가?
6. 실제 GitHub 통합 시험에 사용할 별도 저장소와 승인 범위는 무엇인가?
7. 릴리스 전 필수 검사와 알려진 제약의 허용 범위는 무엇인가?

운영체제 매트릭스에서는 캐시 기본 위치와 환경변수 재정의, 경로 정규화, 파일 락·원자적 교체, git·gh 실행, init부터 검색·동기화까지의 제품 흐름, 훅 설치·신뢰·실행을 확인한다. 자동 CI와 실제 호스트 검증의 분담은 Q16에서 확정한다.

## 사용 안내에 필요한 내용

설치 전제, 초기화, 팀원 참여, 기록·조회·skip, 질문 승인, 훅 신뢰·활성화, 오프라인·저장 실패 복구, 캐시·초안 보존, 업데이트·제거를 다룬다. 실제 동작을 확정한 뒤 예제를 작성하며 가상의 설치 명령을 확정된 안내로 제공하지 않는다.

## 완료 기록

사용자가 확정한 인수 조건에 대한 증거가 갖춰진 뒤 해당 계획을 완료 처리한다. 구현 내용, 검증 결과, 남은 제한, 관련 커밋/PR을 어떤 형식으로 기록하고 history로 이관할지는 Q16에서 확정한다.

현재는 문서 상세화 중이다. 문서 파일이 생성되었다는 이유로 구현·검증 완료를 표시하지 않는다.
