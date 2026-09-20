#!/usr/bin/env node
/**
 * PreToolUse(Bash) 가드 — CLAUDE.md 규칙 2건의 기계적 강제.
 * 1) `changeset version` 로컬 실행 차단(버전 적용은 main push 시 CI가 일괄 수행).
 * 2) `git commit` 시 publishable 변경에 changeset 동봉 검사(빈 changeset 포함).
 * exit 2 = 차단(stderr가 에이전트에 전달), 그 외 오류는 fail-open.
 */

import { execFileSync } from 'node:child_process';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function block(message) {
  console.error(message);
  process.exit(2);
}

// heredoc 본문·따옴표 문자열은 산문(커밋 메시지 등)이므로 제거하고 실행 텍스트만 검사
function executableText(cmd) {
  return cmd
    .replace(/<<-?\s*['"]?(\w+)['"]?[\s\S]*?\n\1(?=\n|$)/g, ' ')
    .replace(/'[^']*'/g, ' ')
    .replace(/"[^"]*"/g, ' ');
}

let command = '';
try {
  const input = JSON.parse(await new Response(process.stdin).text());
  command = executableText(input?.tool_input?.command ?? '');
} catch {
  process.exit(0);
}

if (/\bchangeset\s+version\b/.test(command) || /\bversion-packages\b/.test(command)) {
  block(
    '차단: `changeset version`은 로컬에서 직접 실행하지 않는다(CLAUDE.md). ' +
      '버전 적용은 main push 시 CI(release.yml)가 일괄 수행한다.'
  );
}

const isGitCommit = /(?:^|[;&|(]\s*)git\s+(?:-\S+\s+)*commit\b/.test(command.trim());
if (!isGitCommit) process.exit(0);

try {
  const staged = git(['diff', '--cached', '--name-only']).split('\n').filter(Boolean);
  const touchesPublishable = staged.some((file) => /^(packages|sdks)\//.test(file));
  if (!touchesPublishable) process.exit(0);

  const isChangesetEntry = (file) =>
    /^\.changeset\/.+\.md$/.test(file) && !file.endsWith('README.md');

  const stagedChangeset = staged.some(isChangesetEntry);
  const untrackedChangeset = git(['ls-files', '--others', '--exclude-standard', '--', '.changeset'])
    .split('\n')
    .some(isChangesetEntry);

  let branchChangeset = false;
  for (const base of ['origin/dev', 'origin/main']) {
    try {
      branchChangeset = git(['diff', '--name-only', `${base}...HEAD`, '--', '.changeset'])
        .split('\n')
        .some(isChangesetEntry);
      break;
    } catch {
      // base ref 부재 시 다음 후보로
    }
  }

  if (!stagedChangeset && !untrackedChangeset && !branchChangeset) {
    block(
      '차단: publishable 패키지(packages/**·sdks/*) 변경이 staged인데 changeset이 없다. ' +
        '.changeset/<설명적-이름>.md를 작성하거나, 버전 영향이 없으면 ' +
        '`pnpm changeset add --empty`로 의도를 명시한 뒤 다시 커밋할 것(CLAUDE.md Changeset 규칙).'
    );
  }
} catch {
  process.exit(0);
}
