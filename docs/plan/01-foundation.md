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

1. `config get <key>`의 미존재 key, 오류 객체 code와 필드 경로 표현을 고정한다.
2. Q08a 확정: `PROJECT_HISTORY_HOME`이 없으면 단일 루트를 OS 사용자 데이터 디렉터리에 둔다: macOS `~/Library/Application Support/project-history`, Linux·WSL2 `$XDG_DATA_HOME/project-history`(미설정 시 `~/.local/share/project-history`), Windows `%LOCALAPPDATA%\project-history`. 캐시 디렉터리는 정리 도구가 삭제할 수 있어 재생성 불가능한 초안·skip 마커를 보호하기 위해 사용하지 않는다. `%APPDATA%`(roaming)는 쓰지 않는다. 출시 전이므로 `~/.cache` 표기는 이관 없이 교체한다. 경로는 `os.homedir()`·`process.platform`·환경변수로 계산하며 공백·비ASCII 경로를 검증한다.
3. SSH/HTTPS origin, fork, origin 없음, GitHub Enterprise를 어디까지 지원하는지 정한다.
4. worktree·심볼릭 링크·상위 탐색 경계·브랜치 경로 인코딩과 Windows 드라이브·UNC·경로 대소문자를 정한다(Q08).
5. 알 수 없는 명령·플래그, 상충하는 대상 옵션, 누락한 인자의 오류 형식을 고정한다.

## Q06 확정 설정·오류 계약

| 항목 | 확정 계약 | 후속 미결 |
|---|---|---|
| 스키마 | `history_repo`, `language` 필수. `write`, `gate`, `auto_save`, `ask`, `agent_hook`, `watch` 선택. 이 키 외에는 허용하지 않고 `review` 제거 | 없음 |
| 기본값 | `write: direct`, `gate: block`, `auto_save: true`, `ask: manual`, `agent_hook: false`, `watch` 생략 시 저장소 전체 | 없음 |
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
| `language` | 필수 BCP 47 언어 태그. `Intl.getCanonicalLocales`로 검증·정규화하며 기본값이나 자동 감지 없음 |
| `watch` | 선택 문자열 배열. 아래의 저장소 상대 glob 계약을 따르며 생략 시 저장소 전체 |

## 언어 계약 (Q06d 확정)

- `init config`는 `--language <tag>`를 필수로 받고 정규화한 태그를 `.history.yml`에 쓴다. 플래그가 없으면 파일을 쓰지 않고 exit 2다.
- 직접 작성한 설정도 `language`가 없으면 exit 2다. 최근 PR·커밋·운영체제 locale에서 언어를 추론하지 않고 `en`으로 fallback하지 않는다.
- Node.js의 `Intl.getCanonicalLocales`가 수락하는 BCP 47 태그만 허용한다. 예를 들어 `ko`, `en`, `en-US`, `zh-Hant`는 유효하고 `ko_KR`, 빈 문자열은 유효하지 않다.
- 해석된 설정과 `init config` 출력은 canonical tag를 사용한다. 이 값은 에이전트가 생성하는 기록·질문·요약의 기본 자연어를 지정하며 코드, 경로, 식별자, 인용문을 번역하라는 의미는 아니다.

## watch glob 계약 (Q06e 확정)

- 패턴은 저장소 루트 상대 경로이며 구분자는 모든 운영체제에서 `/`다. 매칭 대상도 Git이 반환한 저장소 상대 경로를 `/`로 정규화한 값이다.
- 지원 문법은 리터럴, `*`, `?`, 문자 클래스(`[abc]`, `[a-z]`, `[!a]`), 전체 경로 세그먼트인 `**`다. `*`와 `?`는 `/`를 넘지 않고 `**`는 0개 이상의 세그먼트와 일치한다. 선행 점이 있는 이름도 일반 문자처럼 매칭한다.
- 여러 패턴은 OR로 결합한다. 선행 `!` 제외 패턴, brace, extglob, 역슬래시 escape는 지원하지 않고 해당 문법을 사용하면 exit 2다.
- 빈 문자열·빈 배열, 선행 `/`, 후행 `/`, `.`·`..` 세그먼트, `\\`, Windows 드라이브 절대 경로와 UNC 경로는 exit 2 검증 실패다. OS 네이티브 구분자로 자동 변환하지 않는다.
- `watch`를 생략하면 논리적으로 저장소 전체가 대상이다. 자동 diff 감지와 관련 경로 수집에는 이 범위를 적용하되, 명시적인 조회·기록 명령 자체를 비활성화하지 않는다.

## dry-run 부작용 경계 (Q06f 확정)

- `--dry-run`은 쓰기 명령에서만 허용한다. 읽기 전용 명령이나 내부 `hook` 진입점에 주면 미지 플래그로 exit 2다.
- 설정·기존 로컬 파일·기존 캐시·Git 상태를 읽고 읽기 전용 GitHub 조회를 수행할 수 있다. 입력과 권한 검증도 읽기만으로 가능한 범위에서 정상 실행과 동일하게 수행한다. Git 조회는 `--no-optional-locks` 또는 동등한 설정으로 선택적 인덱스 갱신을 막는다.
- 디렉터리·캐시·인덱스·번들·초안·설정·로그·락·임시 파일을 만들거나 수정하지 않는다. 따라서 락도 획득하지 않는다.
- `git clone/fetch/pull/rebase/commit/branch/checkout/push`와 `gh repo create`, PR 생성, 댓글, 상태 변경 등 로컬 저장소나 원격 상태를 바꾸는 명령은 실행하지 않는다. commit hook 같은 간접 부작용도 발생시키지 않는다.
- 정상 실행에 필요한 데이터가 기존 상태에 없으면 이를 만들거나 가져오지 않고 계획 결과에 미확인 전제 조건으로 표시한다. dry-run 성공은 실제 쓰기·원격 권한 성공을 보장하지 않는다.
- 성공 시 일반 실행의 완료 결과를 흉내 내지 않고 `{"dry_run":true,"command":"...","would_change":[{"scope":"local|git|github","action":"...","target":"..."}],"unverified":["..."]}`를 반환한다. 생성하지 않은 commit id·URL·파일 경로를 실제 결과처럼 만들지 않는다. 배열은 실행 예정 순서로 안정적으로 정렬한다.
- 입력·설정 검증 실패는 일반 실행과 같은 exit 1/2 계약을 유지한다.

## 검증할 시나리오

- 동일한 프로젝트를 하위 디렉터리와 --cwd로 지정했을 때 설정 해석의 일관성.
- 정상 JSON 출력과 stderr 진단의 분리 및 종료 코드.
- 설정 없음·잘못된 YAML·미지원 값·origin 없음의 확정된 오류 계약.
- 공백·한글·슬래시를 포함한 입력의 경로 충돌과 명령 인자 처리.
- 환경변수 지정 시 캐시가 지정한 위치에서 해석되는지 확인.
- macOS·Linux·Windows에서 동일한 입력이 같은 논리 결과와 종료 코드·출력 스키마를 만드는지 확인.
- Windows 경로·공백·드라이브·UNC 입력, LF/CRLF, git·gh 자식 프로세스 인자 전달과 파일 락·원자적 교체를 별도 확인.

Q06 fixture는 언어 태그 canonicalization·누락·잘못된 태그, 세 운영체제에서 같은 watch 결과, 금지 패턴, dry-run 전후 파일시스템·Git refs·GitHub 상태 불변을 포함한다. Q08a fixture는 세 운영체제의 기본 루트, `XDG_DATA_HOME` 지정·미지정, `PROJECT_HISTORY_HOME` 우선을 포함한다. Q08b–f의 기대값은 사용자 선택 뒤 작성한다.
