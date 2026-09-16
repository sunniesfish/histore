# project-history — 스크립트 인터페이스

`packages/core`가 제공하는 실행 파일. 사용자용 CLI가 아니라 **스킬과 훅이 호출하는 내부 도구**다. 사람이 배우는 대상이 아니므로 일관성과 기계 가독성을 최우선으로 한다.

실행: `npx project-history <command> [subcommand] [flags]`
(실행 이름 `history`는 bash 내장 명령과 충돌하므로 사용하지 않음)

---

## 1. 공통 규약

**출력**
- 데이터를 반환하는 명령은 stdout에 **JSON 한 객체**. 사람이 읽는 마크다운을 반환하는 명령(`show`, `template`, `draft show`)만 예외이며 `--json`으로 구조화 출력 가능.
- 진단·로그는 stderr. stdout은 절대 오염하지 않는다.
- 훅 진입점(`hook *`)은 Claude Code/Codex 공통 훅 출력 규약을 따른다 (아래 6절). 두 도구의 stdin·출력 스키마가 같으므로 진입점은 하나다.

**종료 코드**
- `0` 성공
- `1` 오류 — stderr에 `{"error": "...", "hint": "..."}`
- `2` 검증 실패 / 게이트 차단 — stdout에 `{"errors": [{"field","message"}]}`. 훅에서 exit 2는 "차단"의 의미와 일치한다.

**절대 하지 않는 것**
- 대화형 프롬프트. 질문은 전부 에이전트가 사람에게 한다.
- 토큰·자격증명 입력. GitHub 접근은 `gh` CLI, git 접근은 사용자의 git 설정.
- 코드 저장소에 쓰기 (`init config`의 `.history.yml` 작성 제외).
- 트랜스크립트 원문 노출. 번들에는 발화 텍스트만 추출한다.

**설정 해석**
- `.history.yml`을 cwd에서 상위로 탐색. 없으면 exit 1 + hint `run init`.
- 캐시 루트: `$PROJECT_HISTORY_HOME` 또는 `~/.cache/project-history/`.
- 현재 코드 저장소: `git remote get-url origin`에서 `<org>/<repo>`.

**동시성**
- 캐시 clone에 쓰는 명령(`flush`, `ask-comment`, `sync`)은 저장소별 파일 락을 잡는다.
- push 실패(non-fast-forward)는 `pull --rebase` 후 1회 재시도. 그래도 실패하면 exit 1, 로컬 커밋은 유지.

**공통 플래그**
`--cwd <dir>` · `--json` · `--verbose` · `--dry-run` (쓰기 명령)

---

## 2. 브랜치·초안 명령

### `status --branch <b> | --pr <N>`
현재 상태를 한 번에. 스킬 `record`의 첫 호출.
```json
{
  "repo": "org/api",
  "branch": "feat/jwt",
  "drafts": [{"id": "2026-09-auth-session-to-jwt", "path": "...", "updated_at": "..."}],
  "skip": null,
  "pr": {"number": 123, "url": "...", "state": "open", "merged_at": null,
         "author": "alice", "is_current_user": true},
  "entries": ["..."],
  "last_sync": "2026-09-14T09:00:00Z"
}
```
`entries`는 이 브랜치/PR에 refs로 연결된 기존 엔트리 id. `pr`은 `gh pr view`로 조회, 없으면 `null`.

### `bundle <branch|#N> [--no-transcript] [--max-diff-lines 400]`
소스 번들 생성. 파일로 쓰고 경로와 요약을 반환한다.
```json
{
  "path": "~/.cache/project-history/bundles/org__api/feat__jwt.md",
  "sections": {
    "draft": true,
    "transcript": {"sessions": 2, "chars": 8400},
    "issues": [{"number": 88, "title": "..."}],
    "pr_body": true,
    "reviews": 5,
    "diff_files": 14
  },
  "truncated": ["diff"]
}
```
번들 파일은 마크다운, h2 섹션 고정: `## draft` `## transcript` `## issues` `## pr_body` `## reviews` `## diff_summary` `## diff`. 트랜스크립트는 `sessions.jsonl`에서 이 브랜치의 세션을 찾아 user/assistant 텍스트 발화만 추출, 도구 호출·출력은 제외.

### `template`
빈 엔트리 마크다운을 stdout에. 자동 채움 필드(`paths`, `deciders`)는 포함하지 않는다.

### `draft write --branch <b> | --pr <N> --file <path>`
초안 저장. 검증 후 `paths`(diff에서), `deciders`(PR author 또는 현재 사용자)를 채운다. 같은 `id`가 있으면 갱신, 없으면 추가 (브랜치당 여러 초안 가능).
```json
{"id": "...", "path": "...", "filled": {"paths": ["src/auth/**"], "deciders": ["alice"]},
 "warnings": ["Consequences is short"]}
```
검증 실패 → exit 2. 검사 항목: frontmatter 필수 필드·허용값, `refs.role ∈ {implements, discusses}`, 네 섹션 존재·비어 있지 않음, `Alternatives`에 항목 1개 이상, 본문 길이 상한.

### `draft show --branch <b> [--id <id>]` → 마크다운
### `draft discard --branch <b> [--id <id>]` → `{"discarded": ["..."]}`

### `skip --branch <b> [--reason "..."] | --clear`
"결정 없음" 마커. `{"skipped": true, "branch": "...", "reason": "..."}`

---

## 3. 저장소 쓰기 명령

### `flush --branch <b> | --pr <N> [--status proposed|accepted|rejected] [--id <id>]`
초안을 히스토리 저장소에 반영. 기본 status는 PR 상태에서 결정(없음/open → `proposed`, merged → `accepted`, closed → `rejected`).

동작: 검증 → 캐시 `pull --rebase` → `entries/YYYY/MM/<id>.md` 작성 → `supersedes` 대상 엔트리 `status: superseded`로 갱신 → 커밋(`history: add <id>` / `history: accept <id>`) → `write: direct`면 push, `write: pr`이면 `entry/<id>` 브랜치 push + `gh pr create` → 로컬 초안 삭제 → 인덱스 재빌드.
```json
{"flushed": [{"id": "...", "status": "proposed", "path": "entries/2026/09/....md",
              "url": "https://github.com/org/api-history/blob/main/...", "commit": "abc123"}],
 "mode": "direct"}
```

### `entry set-status <id> <status>`
상태 전이 단독 실행. `sync`가 내부적으로 쓰고, 수동 정리에도 쓴다. 커밋 메시지 `history: <status> <id>`.

### `ask-comment <#N> --entry <id> --file <questions.md>`
프로젝트 PR에 코멘트 1개 게시(`gh api`). 본문 = 질문 + `@author` + 숨은 마커 `<!-- history:q <id> -->`. 엔트리 refs에 코멘트 URL을 `discusses`로 추가하고 커밋·push.
```json
{"comment_url": "...", "entry": "...", "mentioned": "alice"}
```
동일 엔트리에 이미 마커 코멘트가 있으면 exit 1 (PR당 1개 원칙).

---

## 4. 조회 명령

### `search "<query>" [--repo <name>] [--k 10] [--min-score <f>]`
BM25 검색. 색인: title(가중 3), Context, Decision, Alternatives. 토크나이저: 한국어 바이그램 + 영어 단어 소문자. `--repo`가 주어지거나 cwd에서 추론되면 해당 저장소 `paths`를 가진 엔트리에 가산점.
```json
{"candidates": [
   {"id": "...", "title": "...", "status": "accepted", "date": "2026-03-02",
    "decision_first_line": "...", "score": 12.4, "paths": ["web:src/pricing/**"]}
 ],
 "no_strong_match": false}
```
최고 점수가 `min-score` 미만이면 `{"no_strong_match": true, "nearest": [...최대 3개]}`.

### `show <id> [--chain] [--json]`
엔트리 마크다운 출력. 마지막에 `---` 뒤 트레일러: `superseded_by: <id>` (있을 때). `--chain`이면 supersedes 양방향 체인의 id·title·date 목록을 트레일러에 추가. `--json`이면 `{frontmatter, body, superseded_by, chain}`.

### `related <file...> [--repo <name>]`
현재 작업 파일에 해당하는 결정. `by_path` 인덱스만 조회, 검색 없음.
```json
{"entries": [{"id": "...", "title": "...", "status": "accepted", "matched": "src/auth/**"}]}
```

---

## 5. 동기화·초기화

### `sync [--no-fetch] [--timeout <sec>]`
캐시 fetch → frontmatter 인덱스 + 검색 인덱스 재빌드 → `proposed` 엔트리의 PR 상태 조회 후 전이(`entry set-status` + push).
```json
{"fetched": true, "entries": 312,
 "transitions": [{"id": "...", "from": "proposed", "to": "accepted"}],
 "index_built_at": "..."}
```

### `init check`
```json
{"gh": {"installed": true, "authenticated": true, "user": "alice"},
 "repo": "org/api", "config_exists": false}
```
### `init create --repo <org/name> [--private] [--existing]`
새 저장소 생성(`gh repo create`) 후 골격 push, 또는 `--existing`이면 write 권한 확인. 어느 쪽이든 `history.yml`의 `repos`에 현재 코드 저장소 추가.
`{"repo": "org/api-history", "created": true, "url": "..."}`
### `init config --repo <org/name> [--language ko]`
`.history.yml` 작성. 기본값: `gate: block`, `write: direct`, `review: manual`, `ask: manual`, `agent_hook: false`, `language: <detected>`.

### `config get [key]` → 해석된 설정 JSON

---

## 6. 훅 진입점

`hooks/hooks.json`이 호출하는 명령. stdin으로 Claude Code 훅 JSON을 읽고 훅 규약으로 응답한다. 스킬은 이 명령들을 직접 부르지 않는다.

### `hook session-start`
1. `sessions.jsonl`에 `{session_id, repo, branch, transcript_path, started_at}` 추가
2. `sync --timeout 8` (실패해도 계속)
3. 검사 4종 → 결과가 있으면 stdout에 **최대 5줄** plain text:
   ```
   [history] 2 drafts on feat/jwt not flushed; PR #123 is open → /history record
   [history] PR #120, #121 merged without a decision entry → /history record #120
   [history] @bob answered your question on PR #118 → /history record #118
   ```
   결과 없으면 출력 없음. 매 세션 실행되므로 8초 넘기지 않는다.

### `hook user-prompt`
UserPromptSubmit. 마지막 넛지 이후 실질 diff 발생(`git diff --stat` 변화) + 현재 브랜치 초안 없음 + 세션 내 N턴 경과 → `{"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": "[history] Recent turns changed 6 files on feat/jwt and no decision draft exists. If a design decision was made, record it."}}`. 그 외 출력 없음. 차단 안 함. (Stop은 Codex에서 additionalContext 대상이 아니라 사용하지 않음)

### `hook pre-tool`
`tool_name == "Bash"`이고 `tool_input.command`가 `gh pr create` 또는 원격 `git push`(`--dry-run` 제외)에 매치될 때만 동작. 아니면 즉시 exit 0.
- 초안 있음 → `draft` 검증 → `flush --status proposed` → exit 0
- skip 마커 → exit 0
- 둘 다 없음 → `bundle` 생성 → `gate: block`이면 exit 2 + stderr:
  ```
  [history] No decision draft for branch feat/jwt. Run /history record before creating the PR.
  Sources collected: ~/.cache/project-history/bundles/org__api/feat__jwt.md
  If this branch contains no design decision, run /history skip.
  ```
  `gate: warn`이면 exit 0 + 같은 내용을 `additionalContext`로.

### `hook post-tool`
`gh pr create` 성공 시 `tool_response`에서 PR URL 파싱 → 방금 flush된 엔트리 refs에 `{type: pr, role: implements}` 추가 → 커밋·push → `additionalContext`로 PR 본문에 넣을 Context/Decision 요약 제안. 실패는 무시(exit 0, stderr 로그).

---

## 7. 내부·유지보수 명령 (스킬 비노출)

- `index rebuild` — 인덱스만 재생성
- `migrate --to <schema>` — 저장소 전체 일괄 마이그레이션, `history.yml`의 `schema` 갱신
- `cache clear [--repo]` — 캐시 삭제 (초안은 `--include-drafts` 없이는 보존)
- `doctor` — gh, git, 설정, 캐시, 권한 점검

---

## 8. 스킬 ↔ 명령 매핑 요약

| 스킬 단계 | 명령 |
|---|---|
| record 1 | `status` |
| record 2 | `bundle` |
| record 3 (없음) | `skip` |
| record 5 | `template`, `draft write` |
| record 6 | `flush` |
| record 7 | `ask-comment` |
| ask 2–3 | `search`, `show` |
| SKILL 공통 | `related` |
| init | `init check`, `init create`, `init config`, `sync` |
| 훅 | `hook session-start|user-prompt|pre-tool|post-tool` |
