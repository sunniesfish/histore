# 프로젝트 히스토리 플러그인 — 설계 결정 (확정분)

기준일: 2026-09-16
상태: 기존 설계의 1차 확정 내용. 누락·모순은 [설계 결정 관리](../plan/decisions.md)에서 사용자에게 질문해 확정한다.

관련 문서: [history 스킬](../../packages/plugin/skills/history/SKILL.md), [CLI 인터페이스](core-cli-interface.md), [전체 계획](../plan/README.md). 뷰어는 후속 범위이며 별도 설계 문서는 아직 없다.

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
- `pr`: `entry/<id>` 브랜치 → 히스토리 저장소 PR. 코드 PR 머지 시 같은 브랜치에서 status 갱신 후 머지. 히스토리 PR 자동 병합은 저장소 auto-merge 설정으로. 초안 자동 전송(auto_save)과 자동 병합은 별개다.
- 커밋 메시지 규격: `history: add <id>` / `history: accept <id>` / `history: supersede <old> by <new>`. git log가 감사 로그.

### 3.6 규격

- id: `YYYY-MM-<slug>`. 충돌 시 `-2` 접미.
- 파일: UTF-8, frontmatter `---` 구분, 본문 섹션은 `## Context` 등 h2 고정 (스크립트가 섹션 비어 있음을 판정하는 기준).
- `schema` 버전은 저장소 레벨(`history.yml`)에만. 마이그레이션은 전체 일괄 스크립트.
- `paths`: 코드 저장소가 둘 이상이면 `api:src/auth/**` 형태로 접두. 하나면 접두 없음.

## 4. 엔트리 스키마

기록 단위는 **결정(decision) 하나.** 이벤트가 아니다. 결정 하나가 PR 여러 개에 걸칠 수도, 코드가 없을 수도 있다.

### 4.1 frontmatter (필수 10 + 선택 1)

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
verified_by: null                     # 결정자가 작성된 기록을 명시적으로 확인한 경우에만 채움
missing: [alternatives]                # 부족한 항목. 모두 채웠으면 []
revisit_when: null                    # 선택
```

- Q07b·Q07c: `missing`은 필수 배열이다. 허용값은 `rationale`(선택 이유), `alternatives`(기각한 대안과 이유), `consequences`(예상 결과·감수한 단점)다. 부족한 항목만 넣고 모두 채웠으면 `[]`로 둔다. 본문에는 구체적으로 무엇을 모르는지 설명한다.
- `missing`은 정보 종류를 나타낸다. Context에 문제 상황이 적혀 있어도 선택 이유가 없으면 `rationale`이 부족할 수 있다. `status`(결정 진행 상태)와 `verified_by`(결정자 확인 여부)는 별개다.
- `missing` 필드 누락을 빈 배열로 간주하지 않는다. 필수 배열 여부와 허용값은 검증 대상이며 중복·순서 정규화, 부분적인 공백의 판정, 이전 형식 기록의 호환 처리는 후속 확정한다.
- `refs.role`은 `implements` / `discusses` 두 개.
- Q07d: 외부 URL이 없는 대화 출처는 Context에 발언자·날짜·결정 근거 요약으로 남긴다. 외부 링크가 없으면 `refs: []`를 허용한다. 대화 원문 전체나 로컬 트랜스크립트 경로를 원격 기록에 저장하지 않고 별도 sources 메타데이터도 추가하지 않는다. 링크 부재 자체를 출처 부재로 판정하지 않는다.
- Q14a: `verified_by`는 결정자가 작성된 기록 내용을 명시적으로 확인했을 때만 채운다. 코드 PR 머지, 근거 질문에 대한 답변, 에이전트의 보완 또는 `missing: []`만으로 채우지 않는다. 확인자 목록의 정확한 저장 형식·확인 증거의 보관 등은 후속 결정이다.
- Q14b: 결정·선택 이유·기각한 대안·예상 결과의 의미가 바뀌면 기존 확인을 해제하고 변경된 기록을 다시 확인받는다. PR URL 추가·PR 상태 동기화·서식만 바뀌면 확인을 유지한다. 의미 변경 판정 방법과 처리 순서는 후속 확정한다.
- Q14c: 실제로 기록을 확인한 결정자 목록을 저장한다. 결정자 한 명 이상이 확인하면 해당 인물의 확인으로 표시하고, 확인하지 않은 결정자까지 동의한 것으로 표현하지 않는다. 전원 확인은 필수 조건이 아니다.
- `type` 필드 없음 (v1은 decision만). `scope`, `impact`, `summary`, `drivers`, `consulted`, `provenance`, `open_questions`, `confirmation` 없음.

### 4.2 본문

`## Context`(판단 기준 포함) → `## Decision` → `## Alternatives`(각각 왜 버렸나 한 줄) → `## Consequences`. 한 화면 안에 끝나야 한다.

- **diff에서 추론한 문장에만 `(추정)` 마커.** 대화·이슈·PR 본문·리뷰에서 온 문장은 마커 없음.
- 옵션별 pros/cons 표 없음.
- Alternatives는 "왜 X가 아닌가" 질의의 검색 대상이다. 완성된 기록에는 기각한 대안과 이유를 채운다.
- Q01 사용자 결정(B): 근거가 부족한 불완전한 기록도 원격 저장하고, 부족한 부분을 명시한 뒤 질문·답변으로 보완한다. 부족한 내용을 추측으로 채우지 않는다. Q07a: 결정 내용과 그 출처가 있으면 저장할 수 있다. 이유·대안·결과는 부족함을 표시하고 보완하며 선택 이유 자체를 저장 필수 조건으로 요구하지 않는다. 부족한 항목은 메타데이터 목록과 본문 설명으로 표시한다(Q07b). 목록은 Q07c의 필수 missing 배열 규격을 따른다. Q13a에 따라 불완전한 기록도 기본 검색에 포함하고 후보에 부족한 항목을 표시하며, 답변에서는 확인된 내용과 모르는 내용을 구분한다. 대화 출처는 Q07d의 Context 표현을 따른다. 부분 누락 판정·발언자와 날짜 표현 세부 등은 추가 결정 대상이다. status 및 verified_by만으로 내용 완성도를 표현한다고 가정하지 않는다.

### 4.3 상태 전이

로컬 초안(저장소 밖) → `proposed`(PR 생성 시 전송) → 구현 PR 상태에 따라 전이한다. **삭제하지 않는다.**

- Q12b: 하나 이상의 `type: pr`, `role: implements`인 코드 PR이 연결되어 있다면, 그 PR들이 모두 머지됐을 때 자동으로 `accepted`로 전이한다. 일부만 머지되고 나머지가 열려 있으면 `proposed`를 유지한다. `discusses` 링크는 이 판정에서 제외한다.
- 구현 PR이 없는 기록에 모두 머지 조건을 적용해 자동 accepted로 만들지 않는다. 코드 없는 결정은 명시적 accepted 저장 흐름으로 다룬다.
- Q12a: 새 결정이 `accepted`가 됐을 때만 `supersedes` 대상인 기존 결정을 `superseded`로 바꾼다. 새 결정을 proposed로 저장할 때는 대체 관계를 기록할 수 있지만 기존 결정의 상태를 변경하지 않는다.
- Q12c: 하나 이상의 구현 PR이 모두 머지 없이 닫혔다면 proposed에서 rejected로 전이한다. 일부 닫혔지만 열린 PR이 남아 있거나 merged와 미머지 닫힘이 혼재하면 proposed를 유지하고 연결 관계 정리를 안내한다. 코드 PR 교체를 이유로 결정 전체가 기각됐다고 단정하지 않는다.
- Q12d: rejected 기록의 연결 구현 PR이 다시 열리면 자동 proposed로 복귀한다. 이후 전부 머지 조건에 따라 accepted로 전이한다. 이 규칙으로 accepted/superseded/reverted를 자동 복구하지 않는다.
- 재개방 감지를 위해 rejected 기록의 연결 구현 PR도 sync 조회 대상에 포함한다. 조회 주기·한도는 후속 확정하며 프로젝트 전체 과거 PR 스캔으로 확대하지 않는다.
- PR 연결 변경, 명시적 상태 지정과 자동 전이의 우선순위, 재개방 후 바로 머지되어 중간 open을 관측하지 못한 경우, 철회(reverted) 및 대체 분기는 후속 질문에서 확정한다.
- flush로 처음부터 accepted를 저장하는 경우와 sync/entry set-status로 accepted에 진입하는 경우 모두 위 대체 시점 규칙을 적용한다. 복수 엔트리 갱신의 실패 복구·허용 상태 전이표는 후속 확정한다.

#### 자동 상태 전이 사례 (Q12a–d)

아래 구현 PR은 type: pr / role: implements인 코드 PR이다. discusses는 제외한다.

| 현재 상태 | 구현 PR 관측 결과 | 처리 |
|---|---|---|
| proposed | 하나 이상이며 모두 merged | accepted, 대체 대상이 있으면 superseded 반영 |
| proposed | 모두 머지 없이 closed | rejected |
| proposed | 일부 closed, 나머지 open | proposed 유지·연결 정리 안내 |
| proposed | merged와 머지 없이 closed가 혼재 | proposed 유지·연결 정리 안내 |
| proposed | 일부 merged, 나머지 open | proposed 유지 |
| rejected | 연결 구현 PR이 다시 open | proposed 복귀 |
| superseded/reverted | 과거 구현 PR 상태 변경 | rejected 재개방 규칙으로 복구하지 않음 |

PR 조회 실패를 closed로 간주하지 않는다. 실패 시 전이·안내의 세부 규칙, 초안의 초기 상태 판정 및 직접 상태 지정과의 관계는 후속 상세화한다.

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
  "by_id":   { "<id>": { "path", "title", "status", "date", "deciders", "verified_by", "missing" } },
  "by_ref":  { "<PR/issue URL>": ["<id>"] },
  "by_path": [ { "glob": "src/auth/**", "id": "<id>" } ],
  "superseded_by": { "<old id>": "<new id>" },
  "questions": [ { "id", "comment_url", "asked_at" } ]
}
```

- `by_ref`: "이 PR에 엔트리 있나" (게이트, SessionStart 검사 2·3)
- `by_path`: 능동 표시
- `superseded_by`, `questions`: 저장소에는 없고 인덱스에서만 파생 (스키마 확장 없이 역방향 조회)
- Q12a: proposed인 새 기록의 supersedes 관계만으로 이전 기록을 이미 대체된 결정으로 해석하지 않는다. 인덱스와 show의 현행 결정 안내는 실제 적용된 대체를 구분해야 한다. 제안 관계를 별도로 보여주는 형식은 후속 확정한다.

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
- 답변에 존재하는 refs 링크를 포함한다. 외부 링크 없는 대화 기반 기록은 Context의 발언자·날짜·근거 요약을 출처로 설명한다. 링크를 만들어내지 않는다. `verified_by`가 비어 있으면 "미확인" 표시. 확인자가 있으면 실제 확인한 사람을 표시하며 일부 확인을 전원 확인으로 표현하지 않는다(Q14c).
- Q13a: missing이 비어 있지 않은 기록도 기본 검색에 포함한다. 검색 후보에는 missing 목록을 전달하고 에이전트는 확인된 내용만 답한다. 예를 들어 결정은 확인됐지만 선택 이유가 없으면 "선택 이유는 아직 기록되지 않았다"고 명시한다. 완성도만을 이유로 기본 검색에서 제외하지 않는다. 미완성 기록만을 위한 별도 검색 필터나 점수 변경은 이번 결정으로 추가하지 않는다.
- 능동 표시(paths 매칭)는 검색 없이 인덱스 조회만. 비용 0.
- `history search` 인터페이스(질의 → 순위화된 id 목록)를 고정. 수천 개 이상·어휘 확장 시 v2에서 임베딩으로 백엔드만 교체.

## 7. 트리거 모델

### 7.1 원칙

- "왜"는 세션 대화와 사람이 쓴 GitHub 텍스트(이슈·PR 본문·리뷰)에 있다. 코드에는 없다.
- 캡처는 세션 안에서만. 실행 단위는 브랜치(PR 하나 분량). 커밋 단위 아님.
- 초안은 **브랜치별로 세션을 가로질러 누적.** 결정을 인지한 순간 로컬 초안 생성·갱신, PR 시점에 flush.
- 트랜스크립트는 로컬에서만 읽고, 저장소에는 추출된 결정만 올라간다.

### 7.1.1 자동 저장 정책 (Q02 확정)

`auto_save`는 로컬 초안의 자동 원격 전송을 제어하며 기본값은 true다. 로컬 초안 저장, 기존 원격 기록의 동기화, PR 질문 게시 승인은 각각 별개다.

| 시점 | auto_save: true | auto_save: false |
|---|---|---|
| 대화에서 결정 인지·내용 보완 | 로컬 초안 생성·갱신 | 동일 |
| 코드 PR 생성·원격 push 직전 | 최소 저장 요건을 통과한 초안 전송 | 전송을 제안만 함 |
| 세션 시작, 연결 코드 PR이 open 또는 merged | 남은 초안이 최소 저장 요건을 통과하면 전송 | 전송을 제안만 함 |
| 세션 시작, 연결 PR 없음 | 로컬 초안 유지 | 동일 |
| 명시적 기록·전송 요청 | PR 존재 여부와 관계없이 원격 저장 | 동일 |
| 기존 기록의 PR URL·머지·닫힘 갱신 | 자동 동기화 유지 | 동일 |
| 다른 사람의 PR에 질문 게시 | 내용·대상을 보여주고 개별 승인 후 게시 | 동일 |

대화 중 자동 기록은 로컬 초안 생성·갱신에서 끝나며 매번 원격 전송하지 않는다. 명시적 기록 요청은 원격 저장까지 수행한다. Q01(B)에 따라 불완전한 기록도 최소 저장 요건을 충족하면 전송 대상이다. 최소 내용은 결정 내용과 출처다(Q07a). 불완전성은 메타데이터 목록과 본문 설명으로 표현한다(Q07b). 목록은 Q07c의 missing 필수 배열을 따른다. 대화 출처는 Q07d 규칙을 따른다. 부분 누락 판정·그 외 필드 검증 세부는 Q07에서 확정한다.

자동 저장 실패 시 초안을 보존하고 실패를 알린다. Q15a: 네트워크·원격 권한 오류로 전송하지 못하면 gate 값과 관계없이 코드 PR 생성·push를 허용하고 다음 자동 저장 시점에 다시 전송한다. 전송 실패를 저장 성공으로 표시하지 않는다. Q15b: auto_save: false이고 최소 요건을 통과한 로컬 초안이 있으면 gate 값과 관계없이 전송을 제안만 하고 코드 PR 생성·push를 허용한다. 초안 없음·검증 실패·기타 오류의 추가 상세는 Q15에서 확정한다. 세션 시작 시 closed인 미전송 초안, 여러 PR 연결, 업데이트된 기존 기록의 내용 전송 범위는 후속 결정 대상이다.

### 7.1.2 PR 조회 정책 (Q17 확정)

- 세션 시작에는 현재 브랜치 PR의 존재·상태·기록 연결 여부, 상태 갱신이 필요한 기존 기록의 연결 PR, 답변 대기 질문의 새 답글을 확인한다.
- 현재 PR에 기록이 없어도 세션 시작 검사만으로 본문·리뷰 전체 번들을 생성하지 않는다. 누락을 안내하고 기록 절차에 들어갈 때 수집한다.
- 명시적 특정 PR 기록 요청에서는 해당 PR의 본문·연결 이슈·리뷰·diff를 수집한다.
- 프로젝트 전체의 과거·최근 PR 누락 검사는 기본 세션 작업에서 제외한다. 명시적 기록 보충 요청 또는 별도로 켠 검사에서 수행한다. 해당 검사 설정·명령·기간·한도는 미정이다.
- PR 조회 자체는 질문 게시의 트리거가 아니다. 기록할 가치가 있는 결정의 근거가 자료 수집 후에도 부족할 때 질문을 작성하고, 사용자 승인 후 게시한다.
- 조회 간격·캐시·중복 안내 억제·API 조회 한도는 추가 결정 대상이다.

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
| SessionStart | startup/resume | command, async | 캐시 fetch → 인덱스 재빌드 → 세션 인덱스 기록 → `proposed`·`rejected` 상태 동기화 → 검사 4종 → stdout 한 줄 알림 |
| UserPromptSubmit | — | command | 직전 턴들에 실질 diff + 초안 없음 → additionalContext 넛지 (세션당 N턴에 1회). 차단 안 함 |
| PreToolUse | Bash: `gh pr create` / 원격 `git push` | command | 게이트 |
| PreToolUse | Bash: `gh pr create` | agent, opt-in | 엔트리 내용 검증 (플레이스홀더, diff 불일치) |
| PostToolUse | Bash: `gh pr create` | command | PR URL → refs 기록, 엔트리 Context/Decision을 PR 본문 초안에 삽입 |

**SessionStart 검사 4종**
1. 초안 있음 + PR 열림/머지 → auto_save: true면 최소 요건 검증 후 전송, false면 전송 제안. 연결 PR이 없으면 초안 유지. 원격 브랜치 삭제 → 폐기 제안
2. 현재 브랜치에 PR 있음 + 엔트리 없음 → 기록 제안만 수행. 본문·리뷰 번들은 기록 절차에서 수집
3. 전체 과거·최근 PR 누락 검사는 명시적 요청 또는 별도로 켠 검사에서만 수행하며 기본 세션 시작에서는 제외
4. 답변 대기 질문에 작성자 답글 도착 → 엔트리 갱신 제안

**게이트 (PreToolUse)**
- 초안 있음 + auto_save: true → 최소 저장 요건 검증 → `proposed` 전송 → 성공 시 통과
- 최소 저장 요건을 통과한 초안 있음 + auto_save: false → 전송 제안만 수행 → gate 값과 관계없이 코드 도구 실행 허용(Q15b)
- 네트워크·원격 권한 오류로 전송 실패 → 초안 보존·실패 안내 → gate 값과 관계없이 코드 도구 실행 허용. 다음 자동 저장 시점에 재전송(Q15a)
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

번들에서 Alternatives나 판단 기준의 근거가 부족하면 부족한 부분을 짚어 1~2개 질문한다. Q01(B)에 따라 불완전한 기록의 원격 저장을 허용하므로 답변 완료를 모든 저장의 선행 조건으로 두지 않는다. PR 질문 게시 승인 규칙은 별도로 적용한다.

| 상황 | 답할 사람 | 채널 |
|---|---|---|
| 내 브랜치, 세션 안 | 나 | 대화, 실시간 |
| 내 브랜치, 웹 PR | 나 | 다음 세션 대화 |
| 다른 사람 PR | PR 작성자 | 프로젝트 PR에 코멘트 + @멘션, 비동기 |

**비동기 질문 메커니즘**
1. 쓸 수 있는 만큼 작성해 `proposed` push. `verified_by: null`
2. 프로젝트 PR에 코멘트 1개 게시: 질문 묶음 + @작성자 + 숨은 마커 `<!-- history:q <entry-id> -->`. refs에 코멘트 URL을 `discusses`로 추가
3. 작성자가 GitHub에서 답함
4. SessionStart 검사 4가 답글 감지 → 갱신 제안 → 에이전트가 답글을 번들에 넣어 보완. 부족한 내용이 해소되더라도 답변 사실만으로 verified_by를 채우지 않는다.
5. 결정자가 작성된 기록 내용을 명시적으로 확인했을 때만 해당 결정자를 확인 목록에 반영한다(Q14a·Q14c). 결정자 전원의 확인을 기다릴 필요는 없다. 기존 확인 후 기록의 의미가 바뀌면 기존 확인을 해제하고 다시 확인받는다(Q14b). 이 확인을 위한 별도 댓글을 자동 게시하는 동작은 승인된 것이 아니며 확인 절차 세부는 후속 확정한다.

- 질문 대상: PR 작성자 → 봇/부재 시 CODEOWNERS → `git blame` 상위 기여자
- **판별 기준을 통과한 PR에만** 질문. PR당 코멘트 1개.
- v1 질문 게시는 내용·대상을 보여주고 매번 사용자 승인 후 수행한다 (`ask: manual`). 자동 게시 검토는 후속 범위다. auto_save 설정은 댓글 게시 권한을 부여하지 않는다.
- 답이 안 오면 `(추정)`·미확인 상태로 남긴다. 강제 없음.

## 9. 프로젝트 설정 (`.history.yml`, 프로젝트 저장소에 커밋)

- 히스토리 저장소 주소
- 게이트 모드 `block | warn`
- 쓰기 방식 `direct | pr`
- agent 훅 on/off
- 질문 게시 `manual` (v1은 개별 승인 필수)
- 초안 자동 원격 전송 `auto_save: true | false` (기본 true)
- 감시 경로 (선택)

## 10. 작동 흐름

**A. 기본 — 여러 세션에 걸친 작업**
세션 1: 결정 대화 → 로컬 초안 생성. 세션 2: 초안 갱신. 세션 3(auto_save: true): `gh pr create` → 게이트가 초안의 최소 저장 요건 검증 → `proposed` 전송 → PostToolUse가 PR URL 기록·PR 본문 채움 → 코드 리뷰어가 이유도 함께 검토 → 연결된 모든 구현 PR 머지 → 다음 세션 SessionStart가 `accepted` 전이. 대체 대상이 있으면 이 시점에 `superseded`로 갱신한다.

**B. 웹에서 만든 PR**
다음 세션에 연결 PR이 open/merged이고 초안이 있으면 auto_save 정책으로 전송한다. 초안과 기록이 없으면 SessionStart 검사 2에서 기록을 제안한다. 기록 절차에 들어가면 번들 수집 → 작성 → 명시적 기록 요청에 따른 전송을 수행한다.

**C. 다른 사람의 PR / 백필**
명시적 기록 보충 요청 또는 별도로 켠 누락 검사 → `/history record #N` → GitHub 소스 번들 → 확인된 내용 작성·원격 저장 → 부족한 부분은 질문 내용·대상을 사용자에게 보여주고 승인 후 PR 댓글 게시 → 답 오면 검사 4 → 보완.

**D. 코드 없는 결정**
`/history record` → 대화에서 작성 → 외부 근거 링크가 있으면 refs에 기록하고, 외부 URL이 없는 대화 출처는 Context에 발언자·날짜·근거 요약을 기록(refs: [] 허용) → `accepted`로 직접 push. accepted 상태가 verified_by 확인을 의미하지 않는다.

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

## 12. 문서 작성 및 구현 상태

- 공통 SKILL.md와 CLI 인터페이스 문서는 작성되어 있다. 세부 스킬과 실제 명령 구현의 완료를 의미하지 않는다.
- v1 플러그인·저장소 구현 계획은 [전체 계획](../plan/README.md)에서 관리한다.
- 누락·모순과 새 설계 결정은 [설계 결정 관리](../plan/decisions.md)에서 사용자에게 질문한다.
- 뷰어와 v2 임베딩 검색은 이번 상세화 범위에서 제외하고 후속 단계로 둔다.
