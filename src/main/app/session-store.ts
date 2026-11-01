import type { Channels } from './channels';
import { existsSync } from 'node:fs';
import { LOCAL_SCREEN } from '../../shared/remote-host/screens';
import { sessionToWrite, type PaneConversation } from '../workers/claude-resume';
import { resumeLedger, type SessionPlacement } from '../workers/resume-ledger';
import { readSession, writeSession } from './session';
import type { Session } from '../../shared/app/bridge';

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
  // The panes of this project with a conversation still to resume; resume-ledger.ts says what for.
  owedResumes(projectPath: string): number[];
  // A taken conversation that resumes in another pane than the one it was taken for.
  moveResume(fromId: string, toId: string): void;
  // Where every live session is, from a sweep or from Quit.
  placed(placement: SessionPlacement): void;
};

// `dispatched` is main's record of the panes holding its workers, saved so a restart knows them again.
export function sessionStore(
  table: Channels, file: string, slotOf: (projectPath: string) => number, dispatched: (id: string) => boolean,
): ClaudeSessions {
  const saved = readSession(file);
  const ledger = resumeLedger(saved.pages, existsSync);
  let layout: Session | null = null;
  let lastWritten = '';

  function write(): void {
    const next = sessionToWrite(layout, slotOf, ledger.held(), dispatched, lastWritten);
    if (next === null) return;
    lastWritten = next.encoded;
    writeSession(file, next.session);
  }

  // The layout the window last sent, once it has sent one. The window asks again when it comes back
  // from another host, and its pages are rebuilt bare then: what they had before the connect is here,
  // because nothing another screen sends replaces it.
  table.handle('session:read', () => layout ?? saved);
  table.on('session:write', (screen, next: Session) => {
    // A couch layout must not overwrite the desk's: the file is the host window's.
    if (screen !== LOCAL_SCREEN) return;
    layout = next;
    write();
  });

  return {
    takeResume: (projectPath, index, id) => ledger.take(projectPath, index, id, Date.now()),
    owedResumes: (projectPath) => ledger.owed(projectPath),
    moveResume: (fromId, toId) => ledger.move(fromId, toId),
    placed(placement) {
      ledger.place(placement);
      write();
    },
  };
}
