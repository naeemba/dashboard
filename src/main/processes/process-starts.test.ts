import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// processes-rule-1: a process that runs as long as a pane or an agent starts in its systemd scope
// (scope-support.ts). The files that can start a process at all, by importing what starts one, each
// under the reason it may. A new file fails here: it starts through the scope, or it is a short call
// that ends before anyone would want it capped, and says so above its row. A card that moves a site
// behind the scope or removes it deletes its row; never add one without that reason.
const STARTS_PROCESSES = [
  // A pane's pty, its command built through the scope (pane-shells.ts).
  'src/main/panes/pane-shell.ts',
  // The pane and screen hosts themselves: one process for every pane, left where the app runs on
  // purpose; only what they start is scoped.
  'src/main/panes/pane-host-client.ts',
  // The scope check's two probes and daemon-reload.
  'src/main/processes/launch-scopes.ts',
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
  // The manager's tasks, which run builds and tests, and the Agent SDK's sessions, which start inside
  // the SDK and import nothing here: both scoped by the card after this one.
  'src/main/manager/task-runner.ts',
];

const STARTS = /from '(node:)?child_process'|from 'node-pty'/;

function sourceFiles(folder: string): string[] {
  return readdirSync(folder, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
    .map((file) => path.join(folder, file).split(path.sep).join('/'));
}

describe('what starts a process', () => {
  it('is only the files allowed to, each for its reason', () => {
    const starting = sourceFiles('src').filter((file) => STARTS.test(readFileSync(file, 'utf8')));
    expect(starting.sort()).toEqual(STARTS_PROCESSES.sort());
  });
});
