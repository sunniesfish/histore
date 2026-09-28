# 01. 공통 실행·설정·로컬 기반

상태: 상세화 중. 관련 결정: Q05, Q06, Q08, Q10. 근거: [CLI 공통 규약](../spec/core-cli-interface.md), [제품 설계](../spec/project-history-design.md).

## 목표와 산출물

내부 명령이 같은 방식으로 설정·프로젝트·캐시를 해석하고 결과와 오류를 반환하도록 한다. 공통 실행 계층, 설정 해석, 저장소 식별, 캐시 경로 규약과 그 검증이 필요하다. 소스 파일 분할과 라이브러리는 아직 정하지 않았다.

## 지원 환경 (Q05a/b/c 확정)

v1은 macOS·Linux·Windows를 공식 지원한다. Windows 자체 환경에서 실행되는 경로 탐색, 캐시, 파일 락, 자식 프로세스, 훅 진입점을 구현·검증 범위에 포함한다. WSL2는 Linux 실행 환경으로 추가 지원하고 WSL1은 비공식이다.

공통 계층은 POSIX 전용 경로·셸 문법을 전제로 하지 않는다. 운영체제별 기본 캐시 위치, 경로 구분자·드라이브 문자·UNC 경로·대소문자 처리, 파일 교체와 락의 원자성, 실행 파일 탐색과 인자 전달, LF/CRLF를 명시적인 계약과 테스트 대상으로 둔다.

Node.js는 22 이상을 요구하고 지원 중인 LTS 22·24를 검증한다. git·gh는 임의 최소 버전을 고정하지 않는다. `init check`가 제품이 사용하는 명령, 필요한 JSON 필드, 인증 상태를 실제로 검사하고 부족한 capability를 구체적으로 반환한다. 현재 package.json의 Node >=20은 구현 시 이 계약에 맞춰 수정한다.

## 기존 규약에 따른 작업

- Node ESM 실행 파일 project-history를 유지한다. 사람이 입력을 기다리는 프롬프트는 만들지 않는다.
- 데이터 명령 stdout은 JSON 한 객체, 진단은 stderr로 분리한다.
- show/template/draft show의 기본 출력은 Markdown이며 --json을 지원한다.
- 성공 0, 실행 오류 1, 검증 실패 2를 사용한다. 훅은 별도 출력 규약을 적용한다.
- --cwd, --json, --verbose, 쓰기 명령의 --dry-run을 명령별로 명시한다.
- cwd에서 상위로 .history.yml을 탐색한다.
- origin URL에서 org/repo를 구한다. Git·GitHub 인증은 사용자 git 설정과 gh를 사용한다.
- PROJECT_HISTORY_HOME 환경변수와 기본 캐시 경로를 해석한다.
- config get [key]는 해석된 설정을 JSON으로 반환한다.

## 남은 상세 계약

1. `language`를 init의 필수 입력으로 받을지 자동 감지할지 정한다(Q06d).
2. `watch` glob의 경로 기준·구분자·금지 패턴과 생략 의미를 정한다(Q06e).
3. `--dry-run`에서 허용할 읽기와 금지할 로컬·원격 부작용을 정한다(Q06f).
4. `config get <key>`의 미존재 key, 오류 객체 code와 필드 경로 표현을 고정한다.
5. PROJECT_HISTORY_HOME이 없을 때 macOS·Linux·Windows의 기본 캐시 위치를 정한다(Q08).
6. SSH/HTTPS origin, fork, origin 없음, GitHub Enterprise를 어디까지 지원하는지 정한다.
7. worktree·심볼릭 링크·상위 탐색 경계·브랜치 경로 인코딩과 Windows 드라이브·UNC·경로 대소문자를 정한다(Q08).
8. 알 수 없는 명령·플래그, 상충하는 대상 옵션, 누락한 인자의 오류 형식을 고정한다.

## Q06 확정 설정·오류 계약

| 항목 | 확정 계약 | 후속 미결 |
|---|---|---|
| 스키마 | `history_repo` 필수. `write`, `gate`, `auto_save`, `ask`, `agent_hook`, `language`, `watch`만 허용. `review` 제거 | language 입력 방식 Q06d, watch 문법 Q06e |
| 기본값 | `write: direct`, `gate: block`, `auto_save: true`, `ask: manual`, `agent_hook: false` | language·watch의 생략 동작 Q06d/e |
| 엄격도 | 미지 키·잘못된 타입·미지원 값은 exit 2. 누락한 선택 키는 기본값 적용 | 오류 객체의 code와 경로 표기 세부 |
| 설정 없음 | 도움말·버전, `init check/create/config`, `doctor`만 허용. 나머지는 exit 1 + init 안내 | 없음 |
| 조회 | `config get`은 해석값과 각 값의 출처(default/file)를 JSON으로 반환 | 단일 key의 미존재 응답 형식 |

허용 타입과 값은 다음과 같다.

| 키 | 타입·값 |
|---|---|
| `history_repo` | 필수 문자열, GitHub `owner/repo` 형식 |
| `write` | `direct` 또는 `pr` |
| `gate` | `block` 또는 `warn` |
| `auto_save` | boolean |
| `ask` | v1은 `manual`만 허용 |
| `agent_hook` | boolean |
| `language` | 비어 있지 않은 언어 태그. 입력·기본 규칙은 Q06d |
| `watch` | 문자열 배열. 경로 문법·생략 의미는 Q06e |

## 검증할 시나리오

- 동일한 프로젝트를 하위 디렉터리와 --cwd로 지정했을 때 설정 해석의 일관성.
- 정상 JSON 출력과 stderr 진단의 분리 및 종료 코드.
- 설정 없음·잘못된 YAML·미지원 값·origin 없음의 확정된 오류 계약.
- 공백·한글·슬래시를 포함한 입력의 경로 충돌과 명령 인자 처리.
- 환경변수 지정 시 캐시가 지정한 위치에서 해석되는지 확인.
- macOS·Linux·Windows에서 동일한 입력이 같은 논리 결과와 종료 코드·출력 스키마를 만드는지 확인.
- Windows 경로·공백·드라이브·UNC 입력, LF/CRLF, git·gh 자식 프로세스 인자 전달과 파일 락·원자적 교체를 별도 확인.

테스트의 나머지 기대값은 Q06d/e/f와 Q08 후속 결정 뒤 작성한다. Q06a/b/c로 확정한 스키마 오류와 설정 없는 명령의 기대값은 바로 fixture로 작성할 수 있다.
