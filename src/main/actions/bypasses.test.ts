import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// actions-rule-1: a caller that changes state calls an action. These are the calls that do the work
// themselves, and every place each is made today. A new caller is a new count here and fails; a noun's
// card that moves a call behind its action lowers the count in the same change (docs/actions/inventory.md).
const BYPASSES: { call: string; allowed: Record<string, number> }[] = [
  // pane.dispatch's run: only the action and its wiring.
  { call: 'startPane(', allowed: { 'src/main/actions/pane/dispatch.ts': 2, 'src/main/actions/pane/pane-actions.ts': 1 } },
  // A worker screen starts only as pane.dispatch's screen half.
  { call: 'workerScreens.start', allowed: { 'src/main/main.ts': 1 } },
  // `claude --resume` typed into a shell, not pane.dispatch: resumeIn's shell branch and the drawer.
  { call: 'write(resumeLine(', allowed: { 'src/main/main.ts': 2 } },
  // worktree.remove: the card actions' port, `pane release`'s throwaway and the worktree dialog.
  { call: 'worktrees.remove', allowed: { 'src/main/main.ts': 2, 'src/main/ship/worktree-channels.ts': 1 } },
  // worktree.make: a reviewed card's re-add (main.ts), a ship's and a throwaway's (one line, branch-worktree.ts)
  // and /create-task's.
  { call: "'worktree', 'add'", allowed: { 'src/main/main.ts': 1, 'src/main/ship/branch-worktree.ts': 1, 'src/main/board/create-task-program.ts': 1 } },
  // settings.write: launch's host token, the settings screen and the remote join.
  { call: 'writeSettings(settingsFile', allowed: { 'src/main/main.ts': 3 } },
  // The wrappers behind the other Bypass: yes rows, counted with the ports that pass them on, so a new
  // door into one moves a count. pane claim, add, release and close:
  { call: 'openWorker', allowed: { 'src/main/main.ts': 4, 'src/main/workers/session-requests.ts': 2, 'src/main/workers/worker-channels.ts': 2 } },
  { call: 'closeWorker', allowed: { 'src/main/main.ts': 3, 'src/main/workers/session-requests.ts': 2, 'src/main/workers/worker-channels.ts': 2 } },
  // pane restart a shell, project open, close and focus, session start main.
  { call: "'pty:restart'", allowed: { 'src/main/panes/pane-channels.ts': 1 } },
  { call: 'openProject(', allowed: { 'src/main/main.ts': 4, 'src/main/workers/session-requests.ts': 2 } },
  { call: 'closeProjectSlot(', allowed: { 'src/main/main.ts': 2 } },
  { call: 'landOnPane(', allowed: { 'src/main/main.ts': 1, 'src/main/panes/pane-channels.ts': 2 } },
  { call: 'chats.start', allowed: { 'src/main/main.ts': 3 } },
];

function sourceFiles(folder: string): string[] {
  return readdirSync(folder, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
    .map((file) => path.join(folder, file));
}

function callsOf(call: string): Record<string, number> {
  const found: Record<string, number> = {};
  for (const file of sourceFiles('src/main')) {
    const count = readFileSync(file, 'utf8').split(call).length - 1;
    if (count > 0) found[file.split(path.sep).join('/')] = count;
  }
  return found;
}

describe('state changes that bypass an action', () => {
  it.each(BYPASSES)('$call is made only where it is today', ({ call, allowed }) => {
    expect(callsOf(call)).toEqual(allowed);
  });
});
