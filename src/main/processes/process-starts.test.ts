import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// processes-rule-1: a process that runs as long as a pane or an agent starts in its systemd scope
// (scope-support.ts). The files that can start a process at all, by naming what starts one, each
// under the reason it may. A new file fails here: it starts through the scope, or it is a short call
// that ends before anyone would want it capped, and says so above its row. A card that moves a site
// behind the scope or removes it deletes its row; never add one without that reason.
const STARTS_PROCESSES = [
  // A pane's pty, its command built through the scope (pane-shells.ts).
  'src/main/panes/pane-shell.ts',
  // The pane and screen hosts themselves: one process for every pane, left where the app runs on
  // purpose; only what they start is scoped.
  'src/main/panes/pane-host-client.ts',
  // The scope check's two probes, daemon-reload and stopping a pane's scope at its close; each ends in
  // seconds.
  'src/main/processes/launch-scopes.ts',
  // The manager's tasks and the Agent SDK's Claude, each command put in its scope before it gets here.
  'src/main/processes/spawn-scoped.ts',
  // The app started from the `dashboard` command, which is the app, not an agent.
  'src/main/command/start-app.ts',
  // Git, nvim's remote calls, ps and lsof, an update's unpacking, the login shell's PATH: each ends in
  // seconds.
  'src/main/app/git.ts',
  'src/main/board/create-task-program.ts',
  'src/main/board/create-task-git-fixture.ts',
  'src/main/ship/worktree-scan.ts',
  'src/main/nvim/nvim-remote.ts',
  'src/main/panes/shell-directory-lookup.ts',
  'src/main/update/install.ts',
  'src/main/chat/chat-sessions.ts',
];

// Any quoted mention, so a dynamic import, a require or double quotes cannot slip past.
const STARTS = /['"](node:)?child_process['"]|['"]node-pty['"]/;

function sourceFiles(folder: string): string[] {
  return readdirSync(folder, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
    .map((file) => path.join(folder, file).split(path.sep).join('/'));
}

// spawn-scoped.ts takes any command shaped like a scoped one, so a file that imports it starts a
// process just as surely as one that names child_process. Each hands it the answer of scopes.scoped or
// retargeted; a new file is a row here, under the same reason.
const STARTS_THROUGH_SCOPE = [
  // The manager's tasks, each command from scopes.scoped.
  'src/main/manager/task-runner.ts',
  // The Agent SDK's Claude, retargeted into the scope main chose.
  'src/main/chat/claude-process.ts',
];

const IMPORTS_SPAWN_SCOPED = /from ['"][./]*(processes\/)?spawn-scoped['"]/;

describe('what starts a process', () => {
  it('is only the files allowed to, each for its reason', () => {
    const starting = sourceFiles('src').filter((file) => STARTS.test(readFileSync(file, 'utf8')));
    expect(starting.sort()).toEqual(STARTS_PROCESSES.sort());
  });

  it('through spawn-scoped is only the files allowed to', () => {
    const starting = sourceFiles('src').filter((file) => IMPORTS_SPAWN_SCOPED.test(readFileSync(file, 'utf8')));
    expect(starting.sort()).toEqual(STARTS_THROUGH_SCOPE.sort());
  });
});
