---
name: commit
description: 변경 사항을 원자적 커밋으로 만든다. 한국어 메시지 + Conventional Commits 형식(feat/fix/...(scope): 요약). publishable 패키지 변경이면 changeset 동봉을 강제한다(이 저장소 전용). 사용자가 "커밋해", "커밋해줘", "/commit", "commit this"라고 하거나 작업 마무리에 커밋을 요청할 때 사용.
---

# 커밋 규약 (deepmedi Face RGB/Matrix Web SDK 전용)

변경 사항을 베스트 프랙티스에 맞는 **원자적 커밋**으로 만든다. 이 저장소는 Changesets로 버전을 관리하므로, **publishable 패키지 변경이면 changeset 동봉을 강제**한다(아래 0단계).

## 절차

0. **Changeset 선검사 (이 저장소 전용).** `git status`로 변경 범위를 본 뒤:
   - publishable 패키지(`packages/**`·`sdks/*` 중 `private: false`)의 **소스**가 바뀌었는데 `.changeset/`에 대응 신규 항목이 없으면 → **커밋 전에 changeset을 작성한다**(상세는 [CLAUDE.md](../../../CLAUDE.md)의 "Changeset 작성 규칙"). 변경 범위를 보고 영향 패키지·bump 강도(major/minor/patch)를 판단해 `.changeset/<설명적-이름>.md`로 직접 만든다.
   - 문서·테스트·CI·`apps/*`만 바꿨으면 버전 영향 없음 → `pnpm changeset add --empty`로 의도를 반드시 명시한다.
   - changeset 파일은 그 changeset이 설명하는 변경과 **같은 커밋 또는 바로 뒤 커밋**에 담는다(논리 단위 유지).
1. `git status --porcelain`과 `git diff`(스테이징 전/후)로 실제 변경 내용을 파악한다. 추측하지 말 것.
2. 현재 브랜치를 확인한다. **기본 브랜치(main/master)면 먼저 작업 브랜치를 만든다.**
3. 변경을 **논리 단위**로 가른다 — 한 커밋은 하나의 목적만 담는다.
   - 서로 의존하거나 단일 목적을 이루는 변경(예: 새 함수 + 그 호출부 + 테스트)은 **한 커밋**.
   - 무관한 변경(기능 + 리팩터 + 오타 수정)은 **각각 분리**한다. 필요하면 경로/헝크 단위로 `git add`.
4. 각 커밋 메시지를 아래 형식으로 작성하고 커밋한다.
5. 커밋 후 `git log --oneline`과 clean 트리를 확인한다.
6. **push는 사용자가 명시적으로 요청할 때만** 한다.

## 메시지 형식

```
<type>(<scope>): <한국어 요약, 마침표 없이>

<본문: 무엇을·왜. 필요 시 - bullet 로 정리. 어떻게(how)보다 의도(why)를 적는다.>
```

- **언어**: 제목·본문 모두 한국어.
- **type**: `feat` | `fix` | `refactor` | `docs` | `test` | `chore` | `perf` | `build` | `ci` | `style`.
- **scope**: 변경이 속한 모듈/영역(예: `orchestrator`, `analyzer`, `react-hooks`, `changeset`). 애매하면 생략 가능 — `feat: …`.
- **제목**: 명령형, 50자 내외, 끝에 마침표 없음.
- **본문**: 한 줄 비우고 작성. 사소한 변경이면 본문 생략 가능. 줄당 72자 권장.
- **breaking change**: 제목에 `!`(`feat(api)!: …`) 또는 본문에 `BREAKING CHANGE:` 푸터. (BREAKING이면 changeset도 major여야 한다.)

## 트레일러

- 하네스 환경의 푸터 규약(`Co-Authored-By: Claude …`)이 지정돼 있으면 그대로 붙인다. 지정이 없으면 붙이지 않는다.
- 이슈 연결이 필요하면 `Refs #123` / `Closes #123` 푸터를 본문 뒤에 둔다.

## 주의

- 커밋 메시지는 heredoc(`git commit -F -`)으로 전달해 줄바꿈·따옴표를 안전하게 처리한다.
- `git add -A`로 통째로 담기 전에, 의도치 않은 파일(빌드 산출물·secret·로그)이 섞이지 않았는지 status로 확인한다.
- 사용자가 요청하지 않은 한 `--amend`/force-push/기존 히스토리 변경은 하지 않는다.
- 로컬에서 `pnpm changeset version`을 직접 돌리지 않는다(버전 적용은 main push 시 CI 일괄 수행).

## 예시

```
feat(analyzer): 요청 타임아웃 옵션 추가

각 HTTP 요청에 timeoutMs 를 두어 무한 대기를 막는다. 미지정 시
기본 30초, 0 이하면 비활성. 만료 시 NetworkErrorCode.TIMEOUT.
```

changeset 동봉 예(같은 작업 묶음의 별도 커밋):

```
chore(changeset): analyzer 타임아웃 옵션 minor changeset 추가
```
