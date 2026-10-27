# project-history — 스크립트 인터페이스

기존 명령 규약이다. 구현·상세화 상태는 [전체 계획](../plan/README.md), 누락·모순은 [설계 결정 관리](../plan/decisions.md)를 참고한다. 사용자 결정 전에는 충돌하는 규약을 임의로 선택하지 않는다.

`packages/core`가 제공하는 실행 파일. 사용자용 CLI가 아니라 **스킬과 훅이 호출하는 내부 도구**다. 사람이 배우는 대상이 아니므로 일관성과 기계 가독성을 최우선으로 한다.

실행: `npx project-history <command> [subcommand] [flags]`
(실행 이름 `history`는 bash 내장 명령과 충돌하므로 사용하지 않음)

---

## 1. 공통 규약

**출력**
- 데이터를 반환하는 명령은 stdout에 **JSON 한 객체**. 사람이 읽는 마크다운을 반환하는 명령(`show`, `template`, `draft show`)만 예외이며 `--json`으로 구조화 출력 가능.
- 진단·로그는 stderr. stdout은 절대 오염하지 않는다.
- 훅 진입점(`hook *`)은 Claude Code와 Codex의 입력을 호스트별 adapter에서 공통 내부 이벤트로 정규화한다. 명령 계열은 공유하되 stdin·matcher·출력·종료 의미가 같다고 가정하지 않고 호스트별 응답으로 변환한다(아래 6절).

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
- `.history.yml`을 cwd에서 상위로 탐색한다. 없으면 도움말·버전, `init check/create/config`, `doctor`, `local list/show/discard`만 허용한다. 이 로컬 상태 명령은 현재 Git 저장소·origin·GitHub 인증도 요구하지 않는다(Q06g·Q08j). 다른 명령은 exit 1 + hint `run init`이다(Q06c).
- 설정이 있으면 필수 `history_repo`·`language`, 허용 키, 타입과 enum을 검증한다. 미지 키와 제거된 `review`를 포함한 스키마 오류는 exit 2다(Q06a/b/d).
- `language`는 `Intl.getCanonicalLocales`가 수락하는 BCP 47 태그이며 기본값·자동 감지가 없다. `watch`는 저장소 루트 기준 `/` glob 배열이고 생략 시 저장소 전체다. 세부 문법은 제품 설계 9절을 따른다(Q06d/e).
- 데이터 루트: `$PROJECT_HISTORY_HOME` 또는 운영체제별 사용자 데이터 디렉터리: macOS `~/Library/Application Support/project-history`, Linux·WSL2 `$XDG_DATA_HOME/project-history`(미설정 시 `~/.local/share/project-history`), Windows `%LOCALAPPDATA%\project-history` (Q08a).
- 현재 코드 저장소: `git remote get-url origin`에서 `<org>/<repo>`.
- 로컬 초안·skip의 저장소 키는 `git rev-parse --git-common-dir`의 정규화된 실제 절대 경로를 UTF-8로 인코딩한 SHA-256 해시다. 브랜치 키는 전체 브랜치 ref의 UTF-8 SHA-256 해시다. 같은 저장소의 worktree는 상태를 공유하고 별도 clone은 분리한다(Q08b).
- 초안·skip의 메타데이터에 원래 전체 브랜치 ref를 함께 보존해 브랜치 삭제·이름 변경 후에도 로컬 상태 목록에 표시한다(Q08i).
- 초안·skip 최초 저장 시 이전 경로를 나중에 지정할 수 있도록 Git 공용 디렉터리의 정규화된 실제 경로를 로컬 메타데이터에 기록한다. 저장소를 옮긴 뒤에는 사용자 명시 요청에 한해 이전 키의 상태를 새 키로 복사하고 원본을 보존한다. 대상 상태가 있으면 덮어쓰지 않는다(Q08c). 재연결 명령 이름·결과 형식은 후속 확정한다.
- 브랜치 이름이 바뀌면 새 브랜치 키에서 빈 상태로 시작한다. 사용자가 이전 브랜치명을 명시한 경우에만 같은 로컬 저장소의 초안·skip을 새 브랜치 키로 복사한다. 원본은 보존하고 대상 상태가 있으면 덮어쓰지 않는다(Q08d).
- detached HEAD에서는 현재 브랜치 ref가 없으므로 브랜치 키를 만들지 않는다. 현재 체크아웃의 초안·skip 등 브랜치 상태 쓰기와 훅의 해당 자동 쓰기는 실행하지 않고 브랜치 전환을 안내한다. 조회 및 명시적 브랜치·PR 대상의 `bundle`은 허용하며 HEAD SHA를 임시 키로 사용하지 않는다(Q08e). 명령별 오류·훅 출력은 후속 확정한다.
- 브랜치 삭제·이름 변경·저장소 이동·기간 경과·stale skip만으로 로컬 초안·skip을 삭제하지 않는다. 사용자가 대상과 내용을 확인한 뒤 명시적으로 정리한다(Q08g). 원격 저장 성공 후 연결 초안·번들 삭제는 Q09e를 따른다. 정리 명령과 미리보기 출력은 후속 확정한다.
- 같은 브랜치에서 초안과 skip은 공존하지 않는다. skip이 있으면 stale 상태라도 `skip --clear` 전의 `draft write`를 거부하고, 초안이 하나라도 있으면 모두 처리하기 전의 skip 표시를 거부한다. 충돌 시 기존 상태를 자동 삭제하지 않는다(Q08h).
- 로컬 상태 정리는 `local list/show/discard`로 현재 브랜치 밖의 저장소·브랜치까지 목록화하고 초안 본문 또는 skip 이유·스냅샷을 조회한 뒤, 로컬 저장소·브랜치 키와 단일 초안 ID 또는 skip을 지정해 삭제한다(Q08i/j). 설정 없이 접근할 수 있으며(Q06g), 정확한 출력·오류 형식은 후속 확정한다.

**동시성**
- 캐시 clone에 쓰는 명령(`flush`, `ask-comment`, `sync`)은 저장소별 파일 락을 잡는다.
- push 실패(non-fast-forward)는 `pull --rebase` 후 1회 재시도. 그래도 실패하면 exit 1, 로컬 커밋은 유지.

**공통 플래그**
`--cwd <dir>` · `--json` · `--verbose` · `--dry-run` (쓰기 명령)

`--dry-run`은 `bundle`, `draft write/discard`, `skip`, `flush`, `entry set-status`, `ask-comment`, `sync`, `init create/config`, `index rebuild`, `local discard`에만 허용한다. 설정·기존 파일과 캐시·Git·GitHub의 읽기 전용 조회는 수행할 수 있지만 디렉터리, 캐시, 인덱스, 번들, 초안, 설정, 로그, 락, 임시 파일을 만들거나 수정하지 않는다. Git 조회의 선택적 인덱스 갱신도 비활성화한다. `clone/fetch/pull/rebase/commit/branch/checkout/push`, 저장소·PR·댓글 생성과 다른 원격 변경도 실행하지 않는다. 성공 결과는 `dry_run`, `command`, `would_change[{scope,action,target}]`, `unverified[]`로 구성하며 만들지 않은 commit id·URL을 반환하지 않는다. 읽기 전용 명령과 `hook *`에 이 플래그를 주면 exit 2다(Q06f).

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
  "path": "<data-root>/bundles/org__api/feat__jwt.md",
  "sections": {
    "draft": true,
    "transcript": {"sessions": 2, "chars": 8400},
    "issues": [{"number": 88, "title": "..."}],
    "pr_body": true,
    "reviews": 5,
    "diff_files": 14
  },
  "truncated": ["diff"],
  "warnings": [{"code": "transcript_redacted", "count": 2}],
  "partial": false,
  "unavailable": []
}
```
번들 파일은 마크다운, h2 섹션 고정: `## draft` `## transcript` `## issues` `## pr_body` `## reviews` `## diff_summary` `## diff`. 기본 실행에서는 `sessions.jsonl`에서 같은 로컬 저장소·브랜치에 연결된 여러 세션의 user/assistant 텍스트 발화만 추출한다(Q09a). 도구 호출·출력은 제외하며 `--no-transcript`면 발화 추출을 생략한다. 추출한 발화에서 알려진 비밀값 형식은 번들 작성 전에 `[REDACTED]`로 전체 값을 가리고, 결과의 `warnings`에 `transcript_redacted` 코드와 가림 건수를 담는다. 가림이 없으면 `warnings: []`다. 원문·일부 문자를 경고·로그에 넣지 않으며 모든 민감정보의 탐지를 보장하지 않는다(Q09b). 번들은 로컬에 두고 원격 엔트리에는 대화 전체나 트랜스크립트 경로를 저장하지 않는다. 탐지 형식 목록은 후속 결정이다.

Q09f: 번들 생성 시점 기준 최근 30일의 발화를 최대 10만 자까지 수집한다. 한도를 넘으면 최신 발화를 우선한다. 기간·크기 제한으로 빠진 내용이 있으면 번들 본문에 잘림을 알리고 결과의 `truncated`에 `transcript`를 포함한다. 의도적인 제한은 `partial` 또는 `unavailable`로 표시하지 않는다. 발화 경계·문자 수 계산은 후속 구현 계약에서 정한다.

Q09g: `issues`에는 PR의 GitHub 연결 정보와 PR 본문의 명시적 이슈 참조로 확인된 이슈만 중복 없이 담는다. PR이 없거나 명시적 참조가 없으면 브랜치 이름으로 이슈를 추정하지 않는다. 본문 참조 구문과 다른 저장소 이슈 처리는 후속 계약에서 정한다.

Q09h/i: `reviews`와 번들의 `## reviews`에는 해결 여부와 관계없는 PR 리뷰 스레드, 리뷰 제출 요약, PR 일반 댓글을 반영한다. 번들에는 스레드·요약·일반 댓글의 유형과 확인 가능한 스레드 해결 상태를 표시하고 중복 항목은 한 번만 담는다. `sections.reviews`는 수집된 고유 항목 수다. 페이지네이션·크기 제한과 정렬·출처 표시 세부는 후속 계약에서 정한다.

Q09c: 일부 수집원이 실패하면 확보한 자료로 번들을 반환(exit 0)하고 `partial: true`, `unavailable: [{"source":"transcript","reason":"read_failed"}]`처럼 실패 소스와 사유 코드를 표시한다. 원래 자료가 없거나 `--no-transcript`로 생략한 소스는 실패로 표시하지 않는다. 시도한 수집원이 모두 실패해 사용 가능한 자료가 없으면 exit 1이다. 부분 번들에서 작성한 엔트리도 Q07a의 결정 내용·출처 최소 요건을 통과해야 원격 저장할 수 있다.

Q09d: 로컬 브랜치의 diff는 PR 대상 브랜치(없으면 원격 기본 브랜치)와의 merge-base부터 현재 작업 트리까지다. 커밋된 변경과 staged·unstaged 수정·삭제, ignore되지 않은 미추적 파일을 포함한다. 연결된 로컬 작업 트리가 없는 PR은 base/head diff만 사용한다. 기준을 찾지 못하면 Q09c에 따라 diff를 수집 실패로 표시한다. skip의 변경 스냅샷은 같은 범위에서 `watch` 대상만 사용하고 stage 이동·커밋만으로 최종 내용이 같을 때는 유지한다(Q06e·Q08f). 명시적 번들은 전체 변경을 수집한다.

Q09e: 기록 절차에 연결된 번들은 원격 저장 성공이 확인되면 삭제하고, 실패·중단 또는 로컬 초안 작성만 끝난 경우에는 보존한다. 독립 실행한 `bundle` 결과와 원본 트랜스크립트는 이 자동 삭제의 대상이 아니다. 독립 번들의 장기 정리 정책은 후속으로 정한다.

### `template`
빈 엔트리 마크다운을 stdout에. 자동 채움 필드(`paths`, `deciders`)는 포함하지 않는다.

### `draft write (--branch <b> | --pr <N>) --file <path> [--update-existing <id>]`
초안 저장. 입력 검증(`paths`·`deciders` 생략 허용) → 입력에 없는 필드만 `paths`(diff에서), `deciders`(PR author, PR 없으면 현재 gh 인증 사용자)로 채움 → 최종 스키마 검증 순으로 처리한다. `filled`에는 실제로 채운 필드만 담는다(Q07o). 같은 작업 대상의 같은 `id` local draft만 자동 갱신한다. 다른 작업 대상·원격 기록과 충돌한 새 기록은 `-2`, `-3` 순의 첫 빈 suffix를 사용한다. 원격 기존 기록 수정은 `--update-existing <id>`가 필요하고 입력 id와 같아야 한다(Q07h). 동시 충돌의 재검사는 Q10에서 확정한다.
대상 브랜치에 skip이 있으면 stale 여부와 관계없이 초안을 쓰지 않고 `skip --clear`를 안내한다(Q08h).
```json
{"id": "...", "path": "...", "filled": {"paths": ["src/auth/**"], "deciders": ["alice"]},
 "warnings": []}
```
검증 실패 → exit 2. 검사 대상은 frontmatter 필드·자료형·허용값(Q07l), `refs.type ∈ {pr, issue, link}`·`refs.role ∈ {implements, discusses}`·URL 형식·중복(Q07m), 본문 h2 섹션 순서·Decision 비어 있지 않음·`refs: []`일 때 Context 비어 있지 않음·빈 Alternatives/Consequences와 `missing`의 정합성(Q07n)이다. 본문 길이는 검사하지 않는다. 원격 기록의 월 변경 `date` 수정도 exit 2다(Q07k). Q07i에 따라 미지·중복 key와 YAML anchor·alias·merge key·custom tag도 exit 2다. Q01(B)에 따라 근거가 부족한 기록도 로컬 및 원격 저장할 수 있으므로, 기존의 모든 섹션 비어 있지 않음·Alternatives 항목 1개 이상을 일률적 저장 조건으로 적용하지 않는다. Q07a: 최소 내용은 결정 내용과 출처이며 이유·대안·결과는 부족함을 표시하고 보완할 수 있다. 선택 이유 부재만으로 저장을 거부하지 않는다. Q07b에 따라 부족한 항목은 메타데이터 목록과 본문 설명으로 표시한다. Q07c: missing은 필수 배열이며 허용값은 rationale/alternatives/consequences다. 부족한 항목만 포함하며 모두 채웠으면 []로 둔다. 필드 누락을 []로 대체하지 않는다. Q07d: URL 없는 대화 출처는 Context의 발언자·날짜·근거 요약으로 표현하며 refs: []를 허용한다. 대화 전체·로컬 트랜스크립트 경로는 저장하지 않는다. refs가 비었다는 이유만으로 출처 없음으로 판정하지 않는다. Q07e: id는 `YYYY-MM-<ascii-kebab-slug>`이고 새 ID 충돌은 `-2`, `-3` 순 suffix를 사용한다. Q07f: date는 실제 `YYYY-MM-DD`이고 id prefix와 연·월이 일치해야 한다. 백필 날짜를 모르면 기록일과 Context의 미확인 표시를 사용한다. Q07j: date는 UTC 날짜이며 출력에서 UTC 기준임을 명시한다. Q07g: suffix를 제외한 slug는 1–72자이며 초과 입력을 자동 절단하지 않는다. Q07h: 같은 작업 대상의 local draft만 자동 갱신하고 다른 대상·원격 기록은 암묵적으로 덮어쓰지 않는다. Q14a: verified_by는 결정자의 명시적인 기록 확인으로만 채우며 PR 머지·질문 답변만으로 자동 채우지 않는다. Q14b: 결정·이유·대안·결과의 의미가 바뀌면 기존 확인을 해제하고 재확인한다. PR URL·상태·서식만 바뀌면 유지한다. Q14c: 실제 확인한 결정자 목록을 저장하며 전원 확인을 요구하지 않는다. 확인 목록 원소는 중복 없는 GitHub login이다(Q07l). 의미 변경 판정·확인 증거 표현은 후속 확정한다.

### `draft show --branch <b> [--id <id>]` → 마크다운
### `draft discard --branch <b> [--id <id>]` → `{"discarded": ["..."]}`

### `skip --branch <b> [--reason "..."] | --clear`
"결정 없음" 마커. 표시 당시 작업의 실질 변경 스냅샷 식별값을 함께 저장한다. 현재 변경이 다르면 마커를 stale로 보고 게이트 통과 조건으로 사용하지 않는다. 다시 skip하면 현재 스냅샷으로 갱신한다(Q08f). `{"skipped": true, "branch": "...", "reason": "..."}`
초안이 하나라도 있으면 skip 표시는 거부하고 초안의 저장·삭제를 안내한다. `--clear`는 초안을 변경하지 않는다(Q08h).

---

## 3. 저장소 쓰기 명령

### `flush --branch <b> | --pr <N> [--status proposed|accepted|rejected] [--id <id>]`
초안을 히스토리 저장소에 반영. 기본 status는 연결된 구현 PR 전체의 상태를 기준으로 판단한다. 하나 이상의 type: pr/role: implements가 모두 merged면 accepted(Q12b), 일부만 merged이고 나머지가 open이면 proposed다. discusses는 판정에서 제외한다. 구현 PR이 없으면 기본 proposed이며 코드 없는 결정의 명시적 accepted 저장은 별도다. Q12c: 구현 PR이 모두 머지 없이 closed면 rejected, 일부 closed와 open 또는 merged가 혼재하면 proposed로 두고 연결 정리를 안내한다. 명시적 --status와 자동 판정 충돌은 후속 확정한다.

동작: 검증 → 캐시 `pull --rebase` → `entries/YYYY/MM/<id>.md` 작성 → 저장하는 새 결정이 accepted일 때만 `supersedes` 대상 엔트리 `status: superseded`로 갱신(Q12a, proposed 저장은 기존 상태 유지) → 커밋(`history: add <id>` / `history: accept <id>`) → `write: direct`면 push, `write: pr`이면 `entry/<id>` 브랜치 push + `gh pr create` → 원격 저장 성공 확인 → 로컬 초안과 해당 기록에 연결된 번들 삭제(Q09e) → 인덱스 재빌드. 실패·중단 시 연결된 번들을 보존한다. PR 모드의 정확한 성공 경계와 부분 성공 복구는 Q10·Q11에서 정한다.
```json
{"flushed": [{"id": "...", "status": "proposed", "path": "entries/2026/09/....md",
              "url": "https://github.com/org/api-history/blob/main/...", "commit": "abc123"}],
 "mode": "direct"}
```

### `entry set-status <id> <status>`
상태 전이 단독 실행. `sync`가 내부적으로 쓰고, 수동 정리에도 쓴다. 커밋 메시지 `history: <status> <id>`. accepted 진입 시에만 supersedes 대상을 superseded로 갱신한다(Q12a). 허용 전이표·명시적 상태 지정과 자동 판정의 우선순위는 후속 확정한다.

### `ask-comment <#N> --entry <id> --file <questions.md>`
v1은 질문 내용·대상에 대한 사용자 승인 후에만 호출한다. auto_save는 댓글 게시 승인을 대체하지 않는다. 프로젝트 PR에 코멘트 1개 게시(`gh api`). 본문 = 질문 + `@author` + 숨은 마커 `<!-- history:q <id> -->`. 엔트리 refs에 코멘트 URL을 `discusses`로 추가하고 커밋·push.
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
    "decision_first_line": "...", "score": 12.4, "paths": ["web:src/pricing/**"],
    "missing": ["alternatives"]}
 ],
 "no_strong_match": false}
```
Q13a: 불완전한 기록도 기본 검색에 포함한다. 각 후보에 missing 배열을 반환해 에이전트가 부족한 내용을 구분하도록 한다. 에이전트는 확인된 내용만 답하고 부족한 이유를 만들어 채우지 않는다. `nearest` 후보에도 같은 missing 정보를 포함한다. 점수 가중·별도 필터 정책은 후속 결정 대상이다.

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
캐시 fetch → frontmatter 인덱스 + 검색 인덱스 재빌드 → proposed 및 재개방 감지가 필요한 rejected 엔트리에 연결된 구현 PR 전체의 상태 조회 후 전이(`entry set-status` + push). 하나 이상의 구현 PR이 모두 머지됐을 때만 자동 accepted로 전이하며 discusses는 제외한다(Q12b). accepted 전이에 따른 이전 결정의 superseded 갱신을 함께 수행한다(Q12a). Q12c에 따라 모두 미머지 닫힘이면 rejected, 일부 닫힘이면 proposed 유지·연결 정리 안내를 수행한다. Q12d에 따라 rejected 기록의 구현 PR이 재개방되면 proposed로 복귀한다. 이 재개방 규칙으로 superseded/reverted/accepted를 자동 복구하지 않는다. 감지 대상은 해당 기록의 연결 PR이며 전체 과거 PR 검색이 아니다.
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
### `init config --repo <org/name> --language <tag>`
`.history.yml` 작성. `history_repo`와 canonical BCP 47 `language`를 기록하고 기본값은 `gate: block`, `write: direct`, `auto_save: true`, `ask: manual`, `agent_hook: false`다. `review`는 쓰지 않으며 입력 설정에 있으면 검증 실패다. v1은 `ask: auto`를 지원하지 않는다. `--language`가 없거나 유효하지 않으면 파일을 쓰지 않고 exit 2다(Q06d).

### `config get [key]` → 해석된 설정 JSON

전체 조회는 `config`와 각 값의 `sources`(`file` 또는 `default`)를 반환한다. 단일 key 조회와 미존재 key의 오류 형식은 후속 확정한다.

---

## 6. 훅 진입점

`hooks/hooks.json`이 호출하는 명령. stdin으로 각 호스트의 훅 JSON을 읽고 host 식별과 이벤트별 adapter를 거쳐 해당 훅 규약으로 응답한다. 공통 비즈니스 로직과 호스트 adapter를 분리하며 스킬은 이 명령들을 직접 부르지 않는다.

### `hook session-start`
1. `sessions.jsonl`에 `{session_id, repo, branch, local_repo_key, branch_key, transcript_path, started_at}` 추가. 로컬 키 2개로 Q09a의 같은 저장소·브랜치 세션을 구분한다.
2. `sync --timeout 8` (실패해도 계속)
3. 현재 브랜치 PR과 초안 확인. 연결 PR이 open/merged이고 auto_save: true면 최소 저장 요건 검증 후 전송한다. auto_save: false면 제안만 한다. 연결 PR이 없으면 초안을 유지한다.
4. 현재 PR의 기록 누락은 안내만 하고 본문·리뷰 번들은 기록 절차에서 수집한다. 대기 질문의 새 답글은 갱신을 제안한다. 전체 과거·최근 PR 누락 검사는 명시적 요청 또는 별도로 켠 검사에서만 수행한다.
5. 결과가 있으면 stdout에 **최대 5줄** plain text (아래는 자동 전송하지 않은 경우의 안내 예):
   ```
   [history] 2 drafts on feat/jwt not flushed; PR #123 is open → /history record
   [history] Current PR #123 has no decision entry → /history record #123
   [history] @bob answered your question on PR #118 → /history record #118
   ```
   결과 없으면 출력 없음. 매 세션 실행되므로 8초 넘기지 않는다.

### `hook user-prompt`
UserPromptSubmit. 마지막 넛지 이후 실질 diff 발생(`git diff --stat` 변화) + 현재 브랜치 초안 없음 + 세션 내 N턴 경과 → `{"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": "[history] Recent turns changed 6 files on feat/jwt and no decision draft exists. If a design decision was made, record it."}}`. 그 외 출력 없음. 차단 안 함. (Stop은 Codex에서 additionalContext 대상이 아니라 사용하지 않음)

### `hook pre-tool`
`tool_name == "Bash"`이고 `tool_input.command`가 `gh pr create` 또는 원격 `git push`(`--dry-run` 제외)에 매치될 때만 동작. 아니면 즉시 exit 0.
- 초안 있음 + auto_save: true → 최소 저장 요건 검증 → `flush --status proposed` → 성공 시 exit 0
- 최소 저장 요건을 통과한 초안 있음 + auto_save: false → 전송 제안 후 gate 값과 관계없이 exit 0으로 코드 도구 실행 허용(Q15b). 구체 안내 출력 형식은 후속 확정
- 네트워크·원격 권한 오류로 자동 전송 실패 → 초안 보존·실패 안내 후 gate 값과 관계없이 exit 0으로 코드 도구 실행 허용. 다음 자동 저장 시점에 재전송(Q15a). flush 자체의 실패를 성공으로 바꾸지 않으며 허용은 게이트의 판단이다.
- 검증 실패·기타 오류의 상세 게이트 동작은 Q15에서 확정
- 현재 실질 변경 스냅샷과 일치하는 skip 마커 → exit 0(Q08f)
- stale skip 마커 → 유효한 skip이 없는 것으로 취급하고 기록 또는 skip 재표시를 안내(Q08f)
- 둘 다 없음 → `bundle` 생성 → `gate: block`이면 exit 2 + stderr:
  ```
  [history] No decision draft for branch feat/jwt. Run /history record before creating the PR.
  Sources collected: <data-root>/bundles/org__api/feat__jwt.md
  If this branch contains no design decision, run /history skip.
  ```
  `gate: warn`이면 exit 0 + 같은 내용을 `additionalContext`로.

### `hook post-tool`
`gh pr create` 성공 시 `tool_response`에서 PR URL 파싱 → 방금 flush된 엔트리 refs에 `{type: pr, role: implements}` 추가 → 커밋·push → `additionalContext`로 PR 본문에 넣을 Context/Decision 요약 제안. 실패는 무시(exit 0, stderr 로그).

---

## 7. 내부·유지보수 명령 (스킬 비노출)

- `local list` — 저장된 로컬 초안·skip을 원래 저장소 경로·키, 브랜치 ref·키, 초안 ID 또는 skip으로 목록화한다.
- `local show --repo-key <hash> --branch-key <hash> (--id <id> | --skip)` — 선택한 초안 본문 또는 skip 이유·스냅샷을 조회한다.
- `local discard --repo-key <hash> --branch-key <hash> (--id <id> | --skip) [--dry-run]` — 지정한 초안 하나 또는 skip 하나만 삭제한다. `--dry-run`은 대상만 보고한다. 설정·현재 Git 저장소 없이도 실행한다(Q06g·Q08i/j). 정확한 결과·오류 객체는 후속 확정한다.
- `index rebuild` — 인덱스만 재생성
- `migrate --to <schema>` — 저장소 전체 일괄 마이그레이션, `history.yml`의 `schema` 갱신
- `cache clear [--repo]` — 캐시 삭제. 초안·skip은 삭제하지 않으며 별도 대상별 조회·정리 흐름을 사용한다(Q08g/i)
- `doctor` — gh, git, 설정, 캐시, 권한 점검

---

## 8. 스킬 ↔ 명령 매핑 요약

| 스킬 단계 | 명령 |
|---|---|
| record 1 | `status` |
| record 2 | `bundle` |
| record 3 (없음) | `skip` |
| record 5 | `template`, `draft write` |
| record 6 | 명시적 기록 요청이면 `flush`. 대화 중 자동 기록은 로컬 저장에서 종료하고 원격 전송은 auto_save 트리거에 따름 |
| record 7 | `ask-comment` |
| ask 2–3 | `search`, `show` |
| SKILL 공통 | `related` |
| init | `init check`, `init create`, `init config`, `sync` |
| 훅 | `hook session-start|user-prompt|pre-tool|post-tool` |
