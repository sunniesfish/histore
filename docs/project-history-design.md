# 프로젝트 히스토리 플러그인 — 설계 결정 (확정분)

기준일: 2026-09-16
상태: 전 항목 1차 확정. 관련 문서: `skills/history/`(SKILL.md 본문), `core-cli-interface.md`, `viewer-design.md`.

---

## 1. 제품 포지션

- **AI 개발 환경(Claude Code, Codex)에 프로젝트 장기 기억을 추가하는 플러그인.** 별도 CLI 제품 아님.
- 기록 대상은 커밋 히스토리가 아니라 **"왜 그렇게 결정했는가"**. 코드에 나타나지 않는 이유, 검토했다가 버린 대안, 되돌리기 비용이 큰 선택.
- 개발자는 평소처럼 작업 → 플러그인이 결정을 기록 → GitHub 히스토리 저장소에 축적 → 같은 AI 환경에서 질의.
- 플러그인은 **CI 워크플로를 소유하지 않는다.** 설치는 플러그인 추가 한 번.
- 플러그인은 **토큰·자격증명을 다루지 않는다.** 개발자 머신의 `gh auth`를 그대로 사용.

## 2. 컴포넌트와 스택

- 언어: TypeScript 단일. 모노레포.
  - `packages/core` — 스킬이 호출하는 내부 스크립트 (npm, `npx`로 실행). 결정적 작업 담당: diff/log 수집, 스키마 검증, 저장소 쓰기, 번들 생성, 상태 전이, 인덱스 빌드, 검색.
  - `packages/plugin` — Claude Code 플러그인 (`.claude-plugin/plugin.json`, `skills/`, `commands/`, `hooks/`). SKILL.md는 Codex와 공유.
  - `packages/viewer` — React 정적 사이트 (Vite). 히스토리 저장소를 읽어 렌더링, GitHub Pages. **선택 컴포넌트.**
- "왜"를 판단하고 쓰는 것은 에이전트, 강제·감지·수집·운반·검색은 훅 + 스크립트.
- 릴리즈·마일스톤은 저장하지 않는다. 뷰어가 GitHub에서 직접 읽는다.
- v1에 임베딩 검색 없음 (API 키·로컬 모델 의존이 설치 단순성을 깸). 검색 인터페이스만 고정해 v2에서 교체 가능하게.
- 구축 순서: 플러그인(스킬 + 훅 + 스크립트) → 저장소 → 뷰어. 앞의 둘만으로 제품이 성립해야 한다.

## 3. 히스토리 저장소

### 3.1 원칙

- **별도 GitHub 저장소가 SSOT.** 프로젝트 저장소에는 설정 파일 한 개(`.history.yml`) 외에 아무것도 생기지 않는다.
- 히스토리 저장소는 **프로젝트 단위**로, 코드 저장소 여러 개를 다룰 수 있다 (예: api + web). 저장소를 가로지르는 결정을 쪼개지 않기 위해.
- 쓰기는 **개발자 자신의 git/gh 인증**으로 세션 안에서 수행. 새 시크릿·토큰 없음.
- GitHub 저장소를 **append-mostly 파일 스토어**로 쓰고, 조회에 필요한 모든 구조는 로컬에서 파생한다. 저장소는 단순하고 충돌 없이, 복잡함은 캐시에만 (언제든 삭제·재생성 가능).
- 온보딩 비용(1회, 조직 관리자): 히스토리 저장소 생성 + 멤버 write 권한.

### 3.2 Init 흐름 (`/history init`)

1. 스크립트가 `gh auth status` 확인. 미로그인이면 개발자에게 `gh auth login` 요청 (플러그인이 토큰을 받지 않음)
2. 질문: 새 저장소 생성 / 기존 저장소 사용. 기본값 `<org>/<repo>-history`, private
3. 사용자 확인 후 `gh repo create` → 초기 골격 push
4. 프로젝트 저장소에 `.history.yml` 작성. **이 파일은 커밋됨.** 팀원은 init 없이 이 파일만으로 캐시 clone

### 3.3 저장소 구조

```
history.yml                 # 저장소 메타
README.md                   # init 시 자동 생성
entries/
  2026/
    09/
      2026-09-auth-session-to-jwt.md
templates/
  entry.md                  # 사람이 손으로 쓸 때용
.github/workflows/pages.yml # 선택. 뷰어 배포 (히스토리 저장소 안, 코드 저장소와 무관)
```

```yaml
# history.yml
schema: 1
repos:
  - org/api
  - org/web
```

### 3.4 효율 규칙

- **엔트리 하나 = 파일 하나, 경로 불변.** 동시 push 충돌 없음. 상태가 바뀌어도 파일을 옮기지 않고 frontmatter만 수정. id = 파일명.
- **공유 가변 파일을 커밋하지 않는다.** `index.json` 등 파생 데이터는 저장소에 두지 않는다 (충돌의 단일 지점). 뷰어용 인덱스는 빌드 시 생성.
- **연/월 샤딩** — 디렉터리당 파일 수 제한.
- **인덱스는 frontmatter만 파싱**해서 만든다 (전문 검색 인덱스는 본문 포함, sync 시 1회).

### 3.5 쓰기 경로

- `direct`(기본): 캐시에서 `git pull --rebase` → 파일 쓰기 → commit → push. 충돌 시 rebase 재시도.
- `pr`: `entry/<id>` 브랜치 → 히스토리 저장소 PR. 코드 PR 머지 시 같은 브랜치에서 status 갱신 후 머지. 자동 저장은 저장소 auto-merge 설정으로.
- 커밋 메시지 규격: `history: add <id>` / `history: accept <id>` / `history: supersede <old> by <new>`. git log가 감사 로그.

### 3.6 규격

- id: `YYYY-MM-<slug>`. 충돌 시 `-2` 접미.
- 파일: UTF-8, frontmatter `---` 구분, 본문 섹션은 `## Context` 등 h2 고정 (스크립트가 섹션 비어 있음을 판정하는 기준).
- `schema` 버전은 저장소 레벨(`history.yml`)에만. 마이그레이션은 전체 일괄 스크립트.
- `paths`: 코드 저장소가 둘 이상이면 `api:src/auth/**` 형태로 접두. 하나면 접두 없음.

## 4. 엔트리 스키마

기록 단위는 **결정(decision) 하나.** 이벤트가 아니다. 결정 하나가 PR 여러 개에 걸칠 수도, 코드가 없을 수도 있다.

### 4.1 frontmatter (필수 9 + 선택 1)

```yaml
id: 2026-09-auth-session-to-jwt
title: 세션 인증을 JWT로 교체          # 문제-해결 문장
date: 2026-09-05
status: proposed                      # proposed | accepted | rejected | superseded | reverted
supersedes: []
paths: [src/auth/**]                  # 자동. 연결 PR diff에서 추출
refs:
  - {type: pr, url: ..., role: implements}
  - {type: issue, url: ..., role: discusses}
  - {type: slack, url: ..., role: discusses}
deciders: [alice]                     # 자동. PR author
verified_by: null                     # 결정자가 확인하면 채움. null이면 미확인
revisit_when: null                    # 선택
```

- `refs.role`은 `implements` / `discusses` 두 개.
- `type` 필드 없음 (v1은 decision만). `scope`, `impact`, `summary`, `drivers`, `consulted`, `provenance`, `open_questions`, `confirmation` 없음.

### 4.2 본문

`## Context`(판단 기준 포함) → `## Decision` → `## Alternatives`(각각 왜 버렸나 한 줄) → `## Consequences`. 한 화면 안에 끝나야 한다.

- **diff에서 추론한 문장에만 `(추정)` 마커.** 대화·이슈·PR 본문·리뷰에서 온 문장은 마커 없음.
- 옵션별 pros/cons 표 없음.
- Alternatives는 "왜 X가 아닌가" 질의의 검색 대상이므로 반드시 채운다.

### 4.3 상태 전이

로컬 초안(저장소 밖) → `proposed`(PR 생성 시 push) → `accepted`(PR 머지 확인) / `rejected`(PR 닫힘). `superseded` / `reverted`는 새 엔트리가 이전 엔트리에 표시. **삭제하지 않는다.**

### 4.4 기록 여부 판별 (SKILL.md 담당)

다음 중 하나라도 해당하면 기록:
1. 코드를 읽어도 이유가 보이지 않는다 (비즈니스 제약, 일정, 팀 상황, 라이선스)
2. 검토했다가 버린 대안이 있었다
3. 되돌리기 비용이 크거나 영향이 모듈 경계를 넘는다

diff만 봐도 이해되는 것은 기록하지 않는다. 검증 질문: *6개월 뒤 합류한 개발자가 "이거 왜 이렇게 돼 있어요?"라고 물을 만한가.*

## 5. 로컬 캐시와 인덱스

### 5.1 구조 (`~/.cache/<tool>/history/`)

```
repos/<org>/<repo>-history/        # shallow clone (depth 1, sync 때 fetch)
index/<org>/<repo>-history.json    # frontmatter 인덱스
index/<org>/<repo>-history.search.json  # 전문 검색 인덱스 (BM25)
drafts/<org>/<repo>/<branch>/      # 초안 (코드 저장소·브랜치 기준)
sessions.jsonl                     # 세션 인덱스 (session_id → 브랜치, transcript_path, 시각)
skip/<org>/<repo>/<branch>         # 결정 없음 마커
```

### 5.2 frontmatter 인덱스

인덱스가 답해야 하는 질의가 곧 구조다.

```json
{
  "built_at": "...",
  "by_id":   { "<id>": { "path", "title", "status", "date", "deciders", "verified_by" } },
  "by_ref":  { "<PR/issue URL>": ["<id>"] },
  "by_path": [ { "glob": "src/auth/**", "id": "<id>" } ],
  "superseded_by": { "<old id>": "<new id>" },
  "questions": [ { "id", "comment_url", "asked_at" } ]
}
```

- `by_ref`: "이 PR에 엔트리 있나" (게이트, SessionStart 검사 2·3)
- `by_path`: 능동 표시
- `superseded_by`, `questions`: 저장소에는 없고 인덱스에서만 파생 (스키마 확장 없이 역방향 조회)

### 5.3 전문 검색 인덱스

- 순수 JS BM25 (MiniSearch 계열), 네이티브 의존성 없음
- 토크나이저: 한국어 바이그램 + 영어 단어
- 색인 필드: title(가중치 높음), Context, Decision, **Alternatives**
- sync 시 1회 빌드

## 6. 조회 파이프라인

원칙: **결정적 검색으로 후보를 10개 이하로 줄이고, 에이전트는 마지막 판단만 한다.**

1. **질의 확장** (에이전트, ~100 토큰) — 동의어·관련어 생성, 현재 저장소·작업 파일 파악. 외부 호출 없음.
2. **BM25 검색** (스크립트, 0 토큰, <100ms) — `history search <query> [--repo]`. paths가 현재 문맥과 겹치면 가산점.
3. **후보 목록** (~300 토큰) — 상위 10개: id, title, status, date, Decision 첫 문장. 에이전트가 1~3개 선택 (리랭커 역할).
4. **본문 읽기** (~300 토큰 × 1~3) — `history show <id>`. `superseded`면 체인을 따라 현행 결정까지.

- 질문당 총 1.5~2k 토큰, 1초 미만. 엔트리 수 증가에 3·4단계 비용 고정.
- **"기록 없음"을 정확히 말한다.** BM25 점수 임계값 미달 시 스크립트가 `no_strong_match` 반환 → 에이전트는 추측하지 않고 "기록되어 있지 않다"고 답함 → git log/blame으로 관련 PR을 찾아 `/history record #N` 제안 (질의 실패 = 백필 트리거).
- 답변에 refs 링크 포함. `verified_by`가 비어 있으면 "미확인" 표시.
- 능동 표시(paths 매칭)는 검색 없이 인덱스 조회만. 비용 0.
- `history search` 인터페이스(질의 → 순위화된 id 목록)를 고정. 수천 개 이상·어휘 확장 시 v2에서 임베딩으로 백엔드만 교체.

## 7. 트리거 모델

### 7.1 원칙

- "왜"는 세션 대화와 사람이 쓴 GitHub 텍스트(이슈·PR 본문·리뷰)에 있다. 코드에는 없다.
- 캡처는 세션 안에서만. 실행 단위는 브랜치(PR 하나 분량). 커밋 단위 아님.
- 초안은 **브랜치별로 세션을 가로질러 누적.** 결정을 인지한 순간 로컬 초안 생성·갱신, PR 시점에 flush.
- 트랜스크립트는 로컬에서만 읽고, 저장소에는 추출된 결정만 올라간다.

### 7.2 소스 번들 — `history bundle <branch|#PR>`

모든 경로가 이것으로 재료를 모은다.

| 소스 | 얻는 법 | 표시 |
|---|---|---|
| 로컬 초안 | drafts/ | 그대로 |
| 세션 트랜스크립트 | sessions.jsonl → 발화만 추출 | 그대로 |
| 연결 이슈 | closing issues, `Closes #N`, 브랜치명 패턴 | 그대로, refs discusses |
| PR 본문 | gh pr view | 그대로, refs implements |
| 리뷰 스레드 | gh api | 그대로 |
| diff | git | 추론 문장만 `(추정)` |

### 7.3 훅 (Claude Code)

| 이벤트 | 매처 | 타입 | 역할 |
|---|---|---|---|
| SessionStart | startup/resume | command, async | 캐시 fetch → 인덱스 재빌드 → 세션 인덱스 기록 → `proposed` 상태 전이 → 검사 4종 → stdout 한 줄 알림 |
| UserPromptSubmit | — | command | 직전 턴들에 실질 diff + 초안 없음 → additionalContext 넛지 (세션당 N턴에 1회). 차단 안 함 |
| PreToolUse | Bash: `gh pr create` / 원격 `git push` | command | 게이트 |
| PreToolUse | Bash: `gh pr create` | agent, opt-in | 엔트리 내용 검증 (플레이스홀더, diff 불일치) |
| PostToolUse | Bash: `gh pr create` | command | PR URL → refs 기록, 엔트리 Context/Decision을 PR 본문 초안에 삽입 |

**SessionStart 검사 4종**
1. 초안 있음 + PR 열림/머지 → flush 제안 (검증 통과 + auto-save면 스크립트가 직접 push). 원격 브랜치 삭제 → 폐기 제안
2. 현재 브랜치에 PR 있음 + 엔트리 없음 → 번들 생성 → 기록 제안 (웹에서 만든 PR)
3. 최근 머지 PR 중 엔트리 없음 → 목록 알림
4. 질문 마커 있는 엔트리에 작성자 답글 도착 → 엔트리 갱신 제안

**게이트 (PreToolUse)**
- 초안 있음 → 스키마 검증 → `proposed` push → 통과
- skip 마커 → 통과
- 없음 → 번들 생성 → exit 2, stderr로 "`/history record` 실행, 참고: <번들 경로>" → 에이전트가 기록 후 재시도
- 모드: `block`(기본) / `warn`(exit 0 + additionalContext)

훅은 스킬을 직접 호출할 수 없다. 훅의 출력(stderr, additionalContext, stdout)이 에이전트에게 지시하고, 에이전트가 스킬을 실행한다.

### 7.4 명령

- `/history init` — 3.2 참조
- `/history record [#N]` — 기록. PR 번호를 주면 GitHub 소스만으로 번들을 만들어 다른 사람의 PR도 기록 가능
- `/history ask <질문>` — 6절 조회 파이프라인
- `/history skip` — 현재 브랜치 "결정 없음" 판정

### 7.5 Codex 지원 (확인 완료, 2026-09-16)

Codex는 Claude Code와 **같은 훅 스키마**(이벤트명, stdin 필드, exit 2 + stderr, `hookSpecificOutput.additionalContext`)를 쓰고, 플러그인에 번들된 `hooks/hooks.json`을 로드하며, 호환을 위해 `CLAUDE_PLUGIN_ROOT`도 설정한다. 따라서 **하나의 플러그인 폴더로 양쪽을 지원**한다.

- 매니페스트 둘: `.claude-plugin/plugin.json` + `.codex-plugin/plugin.json`. `skills/`, `hooks/hooks.json`, `scripts/`는 공유
- 훅 명령은 `${CLAUDE_PLUGIN_ROOT}` 기준 경로 사용

**차이로 인한 설계 조정**
- `prompt`/`agent` 타입 훅은 Codex에서 파싱만 되고 건너뜀 → opt-in agent 검증 훅은 Claude Code 전용
- Stop 훅은 JSON 출력만 유효하고 additionalContext 대상 이벤트가 아님 → 넛지를 **UserPromptSubmit**으로 이동 (양쪽에서 additionalContext 지원). 다음 프롬프트 처리 직전에 주입되어 타이밍도 더 낫다
- 플러그인 훅은 설치만으로 신뢰되지 않음. 사용자가 `/hooks`에서 1회 검토·신뢰해야 하고, 훅 정의가 바뀌면(해시) 다시 검토 → init 안내와 README에 명시. 신뢰 전엔 훅 없이(명령만으로) 동작
- `timeout` 기본값이 600초 → 모든 훅에 timeout 명시 (SessionStart 10, PreToolUse 20, PostToolUse 20, UserPromptSubmit 3)
- additionalContext 약 2,500토큰 초과 시 파일로 spill → 훅 출력은 짧게 유지 (이미 5줄 제한)
- `transcript_path` 형식은 안정 인터페이스가 아님 → Codex 트랜스크립트 파서는 best-effort, 실패 시 번들에서 해당 섹션만 생략
- 스킬 호출은 `$history` 형식. Claude Code의 `arguments` frontmatter는 무시될 수 있으므로 SKILL.md는 인자가 평문으로 오면 첫 단어를 action으로 해석

**훅이 아예 없는 상황**(신뢰 전, `[features].hooks=false`, 관리형 정책으로 차단, 기타 도구)에서는 SKILL.md 지침 + 명시적 명령만으로 동작. 강제력과 자동 감지가 없어질 뿐 기능은 같다.

## 8. 질문 흐름

번들에서 Alternatives나 판단 기준이 비어 있으면 **쓰기 전에** 구체적으로 묻는다. 비어 있는 칸을 짚어서 1~2개.

| 상황 | 답할 사람 | 채널 |
|---|---|---|
| 내 브랜치, 세션 안 | 나 | 대화, 실시간 |
| 내 브랜치, 웹 PR | 나 | 다음 세션 대화 |
| 다른 사람 PR | PR 작성자 | 프로젝트 PR에 코멘트 + @멘션, 비동기 |

**비동기 질문 메커니즘**
1. 쓸 수 있는 만큼 작성해 `proposed` push. `verified_by: null`
2. 프로젝트 PR에 코멘트 1개 게시: 질문 묶음 + @작성자 + 숨은 마커 `<!-- history:q <entry-id> -->`. refs에 코멘트 URL을 `discusses`로 추가
3. 작성자가 GitHub에서 답함
4. SessionStart 검사 4가 답글 감지 → 갱신 제안 → 에이전트가 답글을 번들에 넣어 완성. `verified_by`는 답한 작성자

- 질문 대상: PR 작성자 → 봇/부재 시 CODEOWNERS → `git blame` 상위 기여자
- **판별 기준을 통과한 PR에만** 질문. PR당 코멘트 1개.
- 질문 게시는 사람 승인 후 (`ask: manual | auto`, 기본 manual)
- 답이 안 오면 `(추정)`·미확인 상태로 남긴다. 강제 없음.

## 9. 프로젝트 설정 (`.history.yml`, 프로젝트 저장소에 커밋)

- 히스토리 저장소 주소
- 게이트 모드 `block | warn`
- 쓰기 방식 `direct | pr`
- agent 훅 on/off
- 질문 게시 `manual | auto`
- 감시 경로 (선택)

## 10. 작동 흐름

**A. 기본 — 여러 세션에 걸친 작업**
세션 1: 결정 대화 → 로컬 초안 생성. 세션 2: 초안 갱신. 세션 3: `gh pr create` → 게이트가 초안 검증 → `proposed` push → PostToolUse가 PR URL 기록·PR 본문 채움 → 코드 리뷰어가 이유도 함께 검토 → 머지 → 다음 세션 SessionStart가 `accepted` 전이.

**B. 웹에서 만든 PR**
다음 세션 SessionStart 검사 2 → 번들 → 기록 제안 → 승인 → 작성 → push.

**C. 다른 사람의 PR / 백필**
SessionStart 검사 3 알림 → `/history record #N` → GitHub 소스 번들 → 작성 → 비어 있는 부분은 PR 코멘트로 질문 → 답 오면 검사 4 → 완성.

**D. 코드 없는 결정**
`/history record` → 대화에서 작성 → refs에 이슈/Slack → `accepted`로 직접 push.

**E. 질의** (예: "왜 이 처리를 백엔드가 아닌 프론트엔드에서 하게 됐어?")
질의 확장 → `history search` → 후보 10개 → 선택 → `history show` → supersedes 체인 추적 → 답변 (기각된 대안·refs·미확인 표시 포함). 매치 없으면 "기록 없음" + 백필 제안.

## 11. 의도된 한계

- 이슈·PR·대화 어디에도 이유가 없고 질문에도 답이 없는 변경 → 미확인 엔트리로 남음
- 초안·트랜스크립트는 한 머신에만 존재. 다른 머신에서 PR을 만들면 flush 지연
- 트랜스크립트 보존 기간이 지난 세션은 복구 불가
- 상태 전이는 다음 세션까지 지연 (히스토리는 실시간일 필요 없음)
- skip 남용은 agent 훅 opt-in 또는 코드 리뷰어 몫
- 검색은 BM25 + 바이그램. 수천 개 이상·어휘 확장 시 임베딩 필요 (v2)
- 더 강한 강제(특정 경로 PR에 엔트리 필수)는 예제 YAML로 제공만 하고 플러그인이 소유·요구하지 않음

## 12. 미결

- SKILL.md 본문 — 판별 기준 3개, 질문 규칙, 질의 확장 지침을 에이전트가 따를 문장으로
- 스크립트 서브커맨드 인터페이스 (`init`, `draft`, `bundle`, `flush`, `sync`, `search`, `show`, `skip`, `ask-comment` 등) — 입출력 형식
- 뷰어 설계
