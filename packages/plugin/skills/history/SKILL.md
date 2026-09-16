---
name: history
description: Record and query the project's decision history — the "why" behind choices that code alone doesn't explain. Use when the user asks why something was built a certain way, when a design decision is reached during work, before creating a PR, or when a hook or session note reports unrecorded decisions.
argument-hint: "[record [#PR] | ask <question> | skip | init]"
arguments: [action, target]
allowed-tools: Bash(npx project-history:*), Bash(gh pr view:*), Bash(gh issue view:*), Bash(git log:*), Bash(git diff:*), Bash(git blame:*)
---

# Project decision history

This project keeps a history of *decisions* in a separate GitHub repository. An entry answers one question: "why is it like this?" — not "what changed". Commits already record what changed.

All storage access goes through the `project-history` script (`npx project-history <cmd>`). Never edit the history repository or the local cache by hand, and never commit history files into the code repository.

## Dispatch

Based on `$action` (if the arguments arrived as plain text, the first word is the action and the rest is the target), read the matching file in this skill directory and follow it:

- `record` → `record.md` (target: current branch, or `$target` as `#PR`)
- `ask` → `ask.md` (`$target` is the question; if empty, use the user's last message)
- `skip` → run `npx project-history skip --branch <current>` and confirm in one line
- `init` → `init.md`
- no action → if the user is asking a "why" question, use `ask`; if a decision was just made in the conversation, use `record`

The rules below apply to every action.

## What counts as a decision

Record when **at least one** holds:

1. The reason is not visible from the code — a business constraint, deadline, team situation, licence, vendor limitation, performance finding.
2. An alternative was considered and rejected.
3. Reverting would be costly, or the effect crosses a module or service boundary.

Do **not** record when the diff explains itself: renames, refactors without behaviour change, dependency bumps, formatting, bug fixes whose cause and fix are both obvious, and anything a reader would understand from the code alone.

Test: *Would a developer joining in six months ask "why is it done this way?"* If not, skip it.

One entry per decision. A branch may hold zero, one, or several. Do not merge unrelated decisions into one entry to save effort, and do not split one decision to look thorough.

## Writing an entry

Use `npx project-history template` for the exact format. Rules:

- Frontmatter: only the fields in the template. `paths` and `deciders` are filled by the script — leave them out of what you write.
- Body sections, in order, each an h2: `Context`, `Decision`, `Alternatives`, `Consequences`. Keep the whole entry under one screen (~40 lines).
- `Context` states the problem and the criteria that mattered (latency, cost, deadline, team skills…). `Decision` is one to three sentences. `Alternatives` lists each rejected option with **one line on why it was rejected**. `Consequences` names the trade-off accepted.
- `Alternatives` is mandatory and is the most valuable section. It is what lets someone later ask "why not X?". If you cannot fill it from the sources, ask (see below) — do not invent options.
- Write in the language set in `.history.yml` (`language`), defaulting to the language the team writes PRs in.
- Title is a problem–solution sentence ("Move price calculation to the client"), not a ticket name.

## Sources over inference

Before writing, get the source bundle (`npx project-history bundle <branch|#PR>`) and read it. It contains the local draft, session transcript excerpts, linked issues, the PR body, review threads, and the diff.

- Anything stated by a person or in the recorded conversation is used as-is.
- Anything you infer **only from the diff** must end with the marker `(추정)` — or the equivalent marker for the configured language. The reader must be able to tell fact from inference.
- Never fill a gap with a plausible reason. An honest gap is more valuable than a wrong reason; the entry stays `verified_by: null` and the gap becomes a question.

## Asking

If the bundle does not give the reason or the rejected alternatives, ask **before** writing. Point at the specific gap, not at the decision in general:

- Good: "The PR body mentions latency but not why server-side calculation was rejected — was it round-trip time, or something else?"
- Bad: "Why did you make this change?"

Ask at most two questions per entry.

- If the decider is the current user: ask directly in the conversation and wait.
- If the decider is someone else (recording another person's PR): draft the questions, show them to the user, and only after the user approves run `npx project-history ask-comment <#PR> --entry <id>` to post one comment on the PR. Never post without approval.

## Surfacing existing decisions

Before making non-trivial edits to files, run `npx project-history related <files...>`. If it returns entries, mention them in one line ("A recorded decision covers this area: <title> (<id>). It says …") and take them into account. Do not paste entries into the conversation unless the user asks.

When you answer from the history, always include the entry id and its PR/issue links, and say **"unverified"** for any entry whose `verified_by` is empty.

## Hard limits

- Do not run `gh pr create`, `git push`, or any write to GitHub as part of this skill except through `project-history` commands, and only `flush` and `ask-comment` write anything.
- Do not modify `.history.yml` except during `init`.
- Do not read transcript files directly; the script extracts only conversation text into the bundle.
