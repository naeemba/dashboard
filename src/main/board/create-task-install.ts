import { readFileSync } from 'node:fs';
import path from 'node:path';
import { failureLine } from '../command/failure-line';
import { replaceFileIfChanged } from '../app/replace-file';
import { skillFolder } from '../skills/skill-folder';

// /create-task and the program it runs, which install-skills.ts writes under ~/.claude at every
// launch so an upgrade reaches it with no step of its own.
//
// A skill, not a file in ~/.claude/commands: commands/ is often a link into a dotfiles repo, and
// writing there would edit somebody's dotfiles. skills/<name>/ is a folder of its own, and it keeps
// the program beside the text that runs it, at one path that never moves:
// ~/.claude/skills/create-task/create-task.js. claude-pr-loop runs that path through
// PR_LOOP_CARD_SCRIPT as an executable, not under `node`, so the path, the `#!` line and mode 0755 are
// all part of the interface. On Windows the mode means nothing; the skill runs it under `node` there
// as everywhere.
//
// A file is written only when its bytes differ, so a launch with nothing new leaves both alone. A
// program whose bytes match but whose mode does not (its execute bit dropped by a chmod, a restore or
// a sync; one installed before the `#!` line differs in bytes and is rewritten) is chmodded, not
// rewritten.

function createTaskFolder(home: string): string {
  return skillFolder(home, 'create-task');
}

export function createTaskScript(home: string): string {
  return path.join(createTaskFolder(home), 'create-task.js');
}

// The skill's text. The script's path is written in absolute, so it runs from any shell on any
// platform without `~` having to expand.
function createTaskSkill(script: string): string {
  return `---
name: create-task
description: Capture a task on the project board and push it to main, without touching the branch I am on
argument-hint: <what the task is>
model: sonnet
effort: low
---

Capture this as a card on the project board: $ARGUMENTS

Run exactly one command:

    node '${script}' --title '<title>' --notes '<notes>' --priority <priority>

- Single-quote every value, so a backtick or \`$\` in it is text, not a command.
  Write a \`'\` inside one as \`'\\''\`.
- \`--title\` is one line, plain, saying what needs doing. You write it — do not
  paste my words in verbatim if they do not read as a title.
- \`--notes\` is the detail I gave, tidied up. If I gave none, pass \`--notes ''\`.
  Do not invent detail.
- \`--priority\` is \`urgent\`, \`high\`, \`medium\` or \`low\`. Judge it from how I said
  it; \`medium\` when I gave no signal. It colours the card and sorts the column.
- Add \`--column '<name>'\` only if I named a column. The default is Backlog.
- Add \`--remote <name>\` only on a repo whose board lives on a remote other than
  \`origin\` (a GitLab remote beside a GitHub \`origin\`).

If it says the branch has no board, stop and tell me. Do not
re-run it with \`--seed\` unless I say so — a board missing from main is usually a
bad merge, and seeding would publish whatever stale copy is in this worktree.

## Do not do anything else

This is quick capture while I am busy on something else. It must cost me nothing.

- Do NOT read the codebase, grep, or research the task to enrich the notes.
  A thin card I can flesh out later beats five minutes of your time.
- Do NOT switch branches, stash, commit, add, or edit any file. The script commits
  to main in a throwaway worktree of its own and never touches my worktree, HEAD,
  or index. Nothing else you do should either.
- Do NOT run \`/simplify\` or any follow-up. Nothing in the project changed.

When the script prints its line, repeat that line and stop.
`;
}

const EXECUTABLE = 0o755;
const SHEBANG = '#!/usr/bin/env node\n';

// `builtScript` is the create-task-cli-entry.js this build carries; a copy, not a link, so the
// installed one keeps working while the app is being swapped for a new build. Answers the line to
// log when it could not write, or null: a failure here costs the skill, never the launch.
export function installCreateTask(home: string, builtScript: string): string | null {
  try {
    const script = createTaskScript(home);
    replaceFileIfChanged(script, SHEBANG + readFileSync(builtScript, 'utf8'), EXECUTABLE);
    replaceFileIfChanged(path.join(createTaskFolder(home), 'SKILL.md'), createTaskSkill(script));
    // Node reads a .js as ESM when the nearest package.json above it says "type": "module", and one
    // in ~/.claude or ~ would make the CommonJS program fail with `require is not defined`.
    replaceFileIfChanged(path.join(createTaskFolder(home), 'package.json'), '{"type":"commonjs"}\n');
    return null;
  } catch (error: unknown) {
    return `create-task not installed: ${failureLine(error)}`;
  }
}
