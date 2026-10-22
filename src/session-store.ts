import { ipcMain } from 'electron';
import { existsSync } from 'node:fs';
import { sessionToWrite, type PaneConversation } from './claude-resume';
import { resumeLedger, type SessionPlacement } from './resume-ledger';
import { readSession, writeSession, type Session } from './session';

// session.json, read once at launch and written by main alone. The renderer sends the layout whenever it
// changes, as it always has; main writes it with which Claude Code conversation each pane is running,
// which only main can see. Two writers of one file would each wipe the other's half.
//
// Main-process wiring, out of main.ts because main had reached its 600-line ceiling. Every decision it
// makes is tested where it lives: what a pane is owed and what it counts as running is resume-ledger.ts's,
// when to write is sessionToWrite's in claude-resume.ts, and the file's shape is session.ts's.

type ClaudeSessions = {
  // The conversation a pane being spawned should resume, or null. Asked once per pane per launch: the
  // saved conversation is used up whether or not it resumes, so a project closed and opened again later in the run
  // starts empty like any project opened by hand.
  takeResume(projectPath: string, index: number, id: string): PaneConversation | null;
  // Where every live session is, from a sweep or from Quit.
  placed(placement: SessionPlacement): void;
};

export function sessionStore(file: string, slotOf: (projectPath: string) => number): ClaudeSessions {
  const saved = readSession(file);
  const ledger = resumeLedger(saved.pages, existsSync);
  let layout: Session | null = null;
  let lastWritten = '';

  function write(): void {
    const next = sessionToWrite(layout, slotOf, ledger.held(), lastWritten);
    if (next === null) return;
    lastWritten = next.encoded;
    writeSession(file, next.session);
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
