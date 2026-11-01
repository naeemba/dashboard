import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import type { Channels } from '../app/channels';
import { listDocs, readDoc } from './docs-list';
import { resumeChoice } from '../workers/session-index';
import type { SessionIndexStore } from '../workers/session-index-store';
import type { DrawerReply, ResumeReply } from '../../shared/drawer/drawer';
import type { OpenProjects } from '../../shared/app/bridge';
import { isManagerPath } from '../../shared/manager/manager';
import { MANAGER_FOLDER } from '../manager/manager-terminals';

// The key the session index files a page's conversations under: the manager's page has the empty path,
// and its sessions run in, and are filed under, its folder.
const sessionsOf = (projectPath: string): string => (isManagerPath(projectPath) ? MANAGER_FOLDER : projectPath);

// The drawer's channels. Main-process wiring only, out of main.ts because main is at its ceiling; what
// a row is and when a resume is refused are docs-list.ts's and session-index.ts's. Main hands over the
// one thing only it can do, a new worker pane with a conversation typed into it.
export function registerDrawer(table: Channels, main: {
  sessions: SessionIndexStore;
  projectPath(slot: number): string | undefined;
  // The new worker's number.
  resumeInWorker(slot: number, session: string, directory: string): number;
  openProjects(): OpenProjects;
}): void {
  table.handle('docs:list', (_screen, projectPath: string, open: string[]) => listDocs(projectPath, open, homedir()));
  table.handle('docs:read', (_screen, projectPath: string, file: string) => readDoc(projectPath, file, homedir()));
  table.handle('sessions:list', (_screen, projectPath: string, count: number) => main.sessions.page(sessionsOf(projectPath), count));
  table.handle('sessions:rename', (_screen, projectPath: string, id: string, label: string): DrawerReply => {
    const refused = main.sessions.rename(sessionsOf(projectPath), id, label);
    return refused === null ? null : { refused };
  });
  // Always a new worker, never a pane already open: one that is busy would get `claude --resume`
  // typed into whatever it is running.
  table.handle('sessions:resume', (_screen, slot: number, id: string): ResumeReply => {
    const projectPath = main.projectPath(slot);
    if (projectPath === undefined) return { refused: 'That project is closed' };
    const choice = resumeChoice(main.sessions.find(projectPath, id), existsSync, main.sessions.runningIn(id));
    if ('refused' in choice) return choice;
    main.sessions.used(projectPath, id);
    const index = main.resumeInWorker(slot, id, choice.record.directory);
    return { index, open: main.openProjects() };
  });
}
