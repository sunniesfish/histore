# 01. 공통 실행·설정·로컬 기반

상태: 상세화 중. 관련 결정: Q05, Q06, Q08, Q10. 근거: [CLI 공통 규약](../spec/core-cli-interface.md), [제품 설계](../spec/project-history-design.md).

## 목표와 산출물

내부 명령이 같은 방식으로 설정·프로젝트·캐시를 해석하고 결과와 오류를 반환하도록 한다. 공통 실행 계층, 설정 해석, 저장소 식별, 캐시 경로 규약과 그 검증이 필요하다. 소스 파일 분할과 라이브러리는 아직 정하지 않았다.

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

## 확정이 필요한 상세 계약

1. 설정 없는 경우 init check/create/config와 template 등 어느 명령까지 허용하는가?
2. history 저장소 주소 키의 정확한 이름, 필수 여부, 전체 YAML 스키마는 무엇인가?
3. auto_save는 기본 true이며 초안 자동 전송을 제어한다(Q02 확정). 의미가 정의되지 않은 기존 review 키를 유지할지 제거할지, v1 미지원 ask: auto 값의 오류 처리를 어떻게 할지 확정해야 한다.
4. 감시 경로·언어 감지·미지 키·잘못된 타입·기존 설정 덮어쓰기는 어떻게 처리하는가?
5. 캐시 기본 경로는 설계의 ~/.cache/<tool>/history/와 CLI의 ~/.cache/project-history/ 중 어떻게 통일하는가?
6. SSH/HTTPS origin, fork, origin 없음, GitHub Enterprise를 어디까지 지원하는가?
7. worktree·심볼릭 링크·상위 탐색 경계·브랜치 경로 인코딩을 어떻게 다루는가?
8. --dry-run은 네트워크 읽기·캐시 작성·락을 어디까지 허용하는가?
9. 알 수 없는 명령·플래그, 상충하는 대상 옵션, 누락한 인자의 오류 형식을 어떻게 고정하는가?

## 검증할 시나리오

- 동일한 프로젝트를 하위 디렉터리와 --cwd로 지정했을 때 설정 해석의 일관성.
- 정상 JSON 출력과 stderr 진단의 분리 및 종료 코드.
- 설정 없음·잘못된 YAML·미지원 값·origin 없음의 확정된 오류 계약.
- 공백·한글·슬래시를 포함한 입력의 경로 충돌과 명령 인자 처리.
- 환경변수 지정 시 캐시가 지정한 위치에서 해석되는지 확인.

테스트의 기대값은 미결 정책 확정 후 작성한다. 설정 없는 명령의 허용 범위를 임의로 가정하지 않는다.
