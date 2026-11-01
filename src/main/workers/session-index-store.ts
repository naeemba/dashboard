import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { replaceFile } from '../board/board-store';
import { projectSlug } from './dispatch';
import { paneLabel, paneFromId } from '../../shared/panes/terminals';
import {
  parseSessionIndex, renamed, sessionPage, withLive, withSession, withUse, type SessionIndex,
} from './session-index';
import type { SessionPlacement } from './resume-ledger';
import type { SessionList, SessionRecord } from '../../shared/drawer/drawer';

// session-index.json in the app's user data, read once at launch and written by main alone, plus what
// is running now, which only main can see: the token sweep's latest reading of the panes and each
// project's main conversation. Every rule about the rows is session-index.ts's.

export type SessionIndexStore = {
  // A fresh id for a Claude the app is about to start, recorded before it starts.
  launched(projectPath: string, directory: string, card: string | null): string;
  // The main session's conversation, reported when it begins or changes; undefined when it has none.
  mainIs(projectPath: string, id: string | undefined): void;
  // The conversation main's next launch resumes, undefined for none. Taken as well, since main resumes
  // it on the first prompt without asking: after a restart nothing is running yet.
  mainRemembers(projectPath: string, id: string | undefined): void;
  placed(placement: SessionPlacement): void;
  page(projectPath: string, count: number): SessionList;
  find(projectPath: string, id: string): SessionRecord | undefined;
  rename(projectPath: string, id: string, label: string): string | null;
  used(projectPath: string, id: string): void;
  // Where the conversation runs now, as a person names it, or null.
  runningIn(id: string): string | null;
};

function readIndex(file: string): SessionIndex {
  try {
    return parseSessionIndex(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    // No file yet, or one that does not parse: the drawer starts empty, as on a first launch.
    return {};
  }
}

export function sessionIndexStore(file: string): SessionIndexStore {
  let index = readIndex(file);
  let livePanes = new Map<string, string>();
  const mains = new Map<string, string>();
  const mainsNext = new Map<string, string>();

  function save(next: SessionIndex): void {
    if (next === index) return;
    index = next;
    try {
      replaceFile(file, JSON.stringify(index));
    } catch {
      // ponytail: a write that fails costs the rows since the last one on the next launch, nothing else.
    }
  }

  const record = (projectPath: string, id: string, directory: string, card: string | null): void => (
    save(withSession(index, projectPath, projectSlug(projectPath), { id, directory, card, at: Date.now() }))
  );

  return {
    launched(projectPath, directory, card) {
      const id = randomUUID();
      record(projectPath, id, directory, card);
      return id;
    },
    mainIs(projectPath, id) {
      if (id === undefined) return void mains.delete(projectPath);
      mains.set(projectPath, id);
      // A row already there is left to the sweep, so an init does not rewrite the file.
      if (index[projectPath]?.some((row) => row.id === id) !== true) record(projectPath, id, projectPath, null);
    },
    mainRemembers(projectPath, id) {
      if (id === undefined) mainsNext.delete(projectPath);
      else mainsNext.set(projectPath, id);
    },
    placed(placement) {
      livePanes = new Map([...placement.byPane].map(([pane, live]) => [live.session, pane]));
      save(withLive(index, [...livePanes.keys(), ...mains.values()], placement.takenAt));
    },
    page: (projectPath, count) => sessionPage(index, projectPath, count),
    find: (projectPath, id) => index[projectPath]?.find((row) => row.id === id),
    rename(projectPath, id, label) {
      const next = renamed(index, projectPath, id, label);
      if (typeof next === 'string') return next;
      save(next);
      return null;
    },
    used: (projectPath, id) => save(withUse(index, projectPath, id, Date.now())),
    runningIn(id) {
      if ([...mains.values(), ...mainsNext.values()].includes(id)) return 'the Claude screen';
      const pane = livePanes.get(id);
      return pane === undefined ? null : paneLabel(paneFromId(pane).index);
    },
  };
}
