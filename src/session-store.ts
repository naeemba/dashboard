import { ipcMain } from 'electron';
import { existsSync } from 'node:fs';
import { heldSlots, resumable, withClaude, type ClaudeSlot } from './claude-resume';
import { readSession, writeSession, type Session } from './session';

// session.json, read once at launch and written by main alone. The renderer sends the layout whenever it
// changes, as it always has; main writes it with which Claude Code conversation each pane is running,
// which only main can see. Two writers of one file would each wipe the other's half.
//
// Main-process wiring, out of main.ts because main had reached its 600-line ceiling. No test file, under
// the exemption CLAUDE.md gives main's wiring: every rule here is claude-resume.ts's or session.ts's and
// is tested there. What is left is when to write, and handing each saved slot to its pane once.

export type ClaudeSessions = {
  // The conversation a pane being spawned should resume, or null. Asked once per pane per launch: the
  // slot is used up whether or not it resumes, so a project closed and opened again later in the run
  // starts empty like any project opened by hand.
  takeResume(projectPath: string, index: number, id: string): ClaudeSlot | null;
  // Where every live session is, from a sweep or from Quit.
  placed(byPane: ReadonlyMap<string, ClaudeSlot>): void;
};

export function sessionStore(file: string, slotOf: (projectPath: string) => number): ClaudeSessions {
  const saved = readSession(file);
  const pending = new Map(saved.pages.map((page) => [page.path, [...page.claude]]));
  const launchedAt = Date.now();
  const resumed = new Map<string, ClaudeSlot>();
  let live: ReadonlyMap<string, ClaudeSlot> = new Map();
  let layout: Session | null = null;
  let lastWritten = '';

  // Nothing until the renderer has sent a layout: before that there is no list of pages to put the
  // sessions on, and writing the saved file back would be writing yesterday. A sweep that finds the same
  // sessions writes nothing either.
  function write(): void {
    if (layout === null) return;
    const session = withClaude(layout, slotOf, heldSlots(live, resumed, Date.now() - launchedAt));
    const encoded = JSON.stringify(session);
    if (encoded === lastWritten) return;
    lastWritten = encoded;
    writeSession(file, session);
  }

  ipcMain.handle('session:read', () => saved);
  ipcMain.on('session:write', (_event, next: Session) => {
    layout = next;
    write();
  });

  return {
    takeResume(projectPath, index, id) {
      const slots = pending.get(projectPath);
      const slot = slots?.[index];
      if (slots !== undefined) slots[index] = null;
      if (!resumable(slot, existsSync)) return null;
      resumed.set(id, slot);
      return slot;
    },
    placed(byPane) {
      live = byPane;
      write();
    },
  };
}
