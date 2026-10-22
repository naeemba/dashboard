import { ipcMain } from 'electron';
import { existsSync } from 'node:fs';
import { withClaude, type ClaudeSlot } from './claude-resume';
import { resumeLedger, type SessionPlacement } from './resume-ledger';
import { readSession, writeSession, type Session } from './session';

// session.json, read once at launch and written by main alone. The renderer sends the layout whenever it
// changes, as it always has; main writes it with which Claude Code conversation each pane is running,
// which only main can see. Two writers of one file would each wipe the other's half.
//
// Main-process wiring, out of main.ts because main had reached its 600-line ceiling. No test file, under
// the exemption CLAUDE.md gives main's wiring: what a pane is owed and what it counts as running is
// resume-ledger.ts's, and the file's shape is session.ts's, both tested. What is left is when to write.

type ClaudeSessions = {
  // The conversation a pane being spawned should resume, or null. Asked once per pane per launch: the
  // slot is used up whether or not it resumes, so a project closed and opened again later in the run
  // starts empty like any project opened by hand.
  takeResume(projectPath: string, index: number, id: string): ClaudeSlot | null;
  // Where every live session is, from a sweep or from Quit.
  placed(placement: SessionPlacement): void;
};

export function sessionStore(file: string, slotOf: (projectPath: string) => number): ClaudeSessions {
  const saved = readSession(file);
  const ledger = resumeLedger(saved.pages, existsSync);
  let layout: Session | null = null;
  let lastWritten = '';

  // Nothing until the renderer has sent a layout: before that there is no list of pages to put the
  // sessions on, and writing the saved file back would be writing yesterday. A sweep that finds the same
  // sessions writes nothing either.
  function write(): void {
    if (layout === null) return;
    const session = withClaude(layout, slotOf, ledger.held());
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
    takeResume: (projectPath, index, id) => ledger.take(projectPath, index, id, Date.now()),
    placed(placement) {
      ledger.place(placement);
      write();
    },
  };
}
