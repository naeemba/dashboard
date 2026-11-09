import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// actions-rule-1: a caller that changes state calls an action. These are the calls that do the work
// themselves, and every place each is made today. A new caller is a new count here and fails; a noun's
// card that moves a call behind its action lowers the count in the same change (docs/actions/inventory.md).
const BYPASSES: { call: string; allowed: Record<string, number> }[] = [
  // pane.dispatch's run: only the action and its wiring.
  { call: 'startPane(', allowed: { 'src/main/actions/pane/dispatch.ts': 2 } },
  // A worker screen starts only as pane.dispatch's screen half.
  { call: 'workerScreens.start', allowed: { 'src/main/main.ts': 1 } },
  // A resume is built only as pane.dispatch's worker arguments; none is typed into a shell.
  { call: "'--resume'", allowed: { 'src/main/workers/dispatch.ts': 1 } },
  { call: '--resume ${', allowed: {} },
  // A pane's shell spawned: only the pane actions' `spawn`.
  { call: 'panes.spawn', allowed: { 'src/main/main.ts': 1 } },
  // A pane dropped: the definition and its call in closeProjectSlot, project.close's `close`.
  { call: 'dropPane(', allowed: { 'src/main/main.ts': 2 } },
  // worktree.remove and worktree.make: only the actions and the remove's port. /create-task's make runs
  // outside the app and stays its program's.
  { call: 'worktrees.remove', allowed: { 'src/main/main.ts': 1 } },
  { call: "'worktree', 'add'", allowed: { 'src/main/actions/worktree/make.ts': 2, 'src/main/board/create-task-program.ts': 1 } },
  // settings.json: its definition, and settings.write's `writeFile` port.
  { call: 'writeSettings(', allowed: { 'src/main/main.ts': 1, 'src/main/settings/settings-store.ts': 1 } },
  // The channel behind Enter on an exited pane, pane.restart's door.
  { call: "'pty:restart'", allowed: { 'src/main/panes/pane-channels.ts': 1 } },
  // What the session actions do, handed to them as ports and called nowhere else: main's start, only
  // through session.start, and a conversation's title, only through session.rename, which writes the
  // drawer's label with it.
  { call: 'chats.start', allowed: {} },
  { call: 'chats.actionPorts', allowed: { 'src/main/main.ts': 1 } },
  { call: 'renameSession(', allowed: { 'src/main/actions/session/session-actions.ts': 1 } },
  { call: 'sessions.rename', allowed: { 'src/main/actions/session/session-actions.ts': 1 } },
  // What project.open, project.close and project.focus do, handed to them as ports and called nowhere
  // else: each definition, and landOnPane's one port.
  { call: 'placeProject(', allowed: { 'src/main/main.ts': 1 } },
  { call: 'closeProjectSlot(', allowed: { 'src/main/main.ts': 1 } },
  { call: 'landOnPane(', allowed: { 'src/main/main.ts': 1, 'src/main/panes/pane-channels.ts': 1 } },
  // The install swapped and the app restarted: the definition and update.install's ports, nowhere else.
  { call: 'swapInto(', allowed: { 'src/main/actions/update/update-actions.ts': 1, 'src/main/update/install.ts': 1 } },
  { call: 'app.relaunch(', allowed: { 'src/main/actions/update/update-actions.ts': 1 } },
  { call: 'quitAndInstall(', allowed: { 'src/main/actions/update/update-actions.ts': 1 } },
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
