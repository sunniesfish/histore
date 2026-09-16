# project-history

AI 개발 환경(Claude Code, Codex)에 프로젝트 결정 히스토리("왜 그렇게 결정했는가")를 기록·질의하는 플러그인. 별도 CLI 제품이 아니다.

## 문서 (SSOT)

작업 전 반드시 읽는다. 코드와 문서가 충돌하면 문서를 먼저 고친 뒤 코드를 맞춘다.

- `docs/project-history-design.md` — 설계 결정 확정분. 제품 포지션, 저장소 구조, 엔트리 스키마, 훅/트리거 모델, 조회 파이프라인
- `docs/core-cli-interface.md` — `packages/core` 스크립트의 명령·입출력 규약
- `packages/plugin/skills/history/SKILL.md` — 에이전트가 따르는 스킬 본문. Claude Code·Codex 공유

## 구조

```
packages/core     npm 패키지 `project-history`. 스킬·훅이 npx로 호출하는 내부 스크립트 (TypeScript, ESM)
packages/plugin   플러그인 폴더. .claude-plugin/ + .codex-plugin/ 매니페스트, skills/, commands/, hooks/
docs/             설계·기획 문서
```

`packages/viewer`(React 정적 사이트)는 선택 컴포넌트. 플러그인 + 저장소만으로 제품이 성립한 뒤에 추가한다.

## 불변 규칙

- 토큰·자격증명을 다루지 않는다. GitHub는 `gh`, git은 사용자 설정 그대로.
- 코드 저장소에 쓰지 않는다 (`.history.yml` 한 개 제외). 히스토리는 별도 GitHub 저장소가 SSOT.
- 스크립트는 대화형 프롬프트를 띄우지 않는다. 질문은 에이전트가 한다.
- 스크립트 stdout은 JSON 한 객체(마크다운 반환 명령 제외). 진단은 stderr. 종료 코드 0/1/2 의미는 `docs/core-cli-interface.md` 1절.
- 공유 가변 파일(`index.json` 등)을 히스토리 저장소에 커밋하지 않는다. 파생 데이터는 로컬 캐시에만.
- v1에 임베딩 검색 없음. `search` 인터페이스만 고정.
- 훅 명령 경로는 `${CLAUDE_PLUGIN_ROOT}` 기준. 모든 훅에 timeout 명시.

## 개발

- pnpm 워크스페이스. `pnpm install` → `pnpm typecheck` / `pnpm build` / `pnpm test`
- 테스트는 `node --test`. 프레임워크 추가 금지.
- 의존성 추가는 네이티브 바이너리 없는 순수 JS만 (설치 단순성이 제품 요구사항).
