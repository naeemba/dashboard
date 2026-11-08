import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import type { Channels } from '../app/channels';
import { listDocs, readDoc } from './docs-list';
import { memoryFilesOf } from './measured-memory';
import { resumeChoice } from '../workers/session-index';
import type { SessionIndexStore } from '../workers/session-index-store';
import type { ResumeReply } from '../../shared/drawer/drawer';
import type { OpenProjects } from '../../shared/app/bridge';
import type { PaneActions } from '../actions/pane/pane-actions';
import { isRefused } from '../actions/action';
import { MANAGER_FOLDER, sessionsFolder } from '../manager/manager-terminals';

// The folders the manager's page lists the docs of: its own and Claude's.
const MANAGER_DOC_ROOTS = [MANAGER_FOLDER, path.join(homedir(), '.claude')];

// The drawer's channels. Main-process wiring only, out of main.ts because main is at its ceiling; what
// a row is and when a resume is refused are docs-list.ts's and session-index.ts's. Main hands over the
// one thing only it can do, pane.open: a new worker pane carrying the conversation on. A rename is
// session.rename's, on its own door (session-actions.ts).
export function registerDrawer(table: Channels, main: Pick<PaneActions, 'open'> & {
  sessions: SessionIndexStore;
  projectPath(slot: number): string | undefined;
  openProjects(): OpenProjects;
}): void {
  table.handle('docs:list', (_screen, projectPath: string, open: string[]) => listDocs(projectPath, open, MANAGER_DOC_ROOTS));
  table.handle('docs:read', (_screen, projectPath: string, file: string) => readDoc(projectPath, file, MANAGER_DOC_ROOTS, memoryFilesOf(projectPath)));
  table.handle('sessions:list', (_screen, projectPath: string, count: number) => main.sessions.page(sessionsFolder(projectPath), count));
  // Always a new worker, never a pane already open: one that is busy would have its program replaced.
  table.handle('sessions:resume', async (_screen, slot: number, id: string): Promise<ResumeReply> => {
    const projectPath = main.projectPath(slot);
    if (projectPath === undefined) return { refused: 'That project is closed' };
    const choice = resumeChoice(main.sessions.find(projectPath, id), existsSync, main.sessions.runningIn(id));
    if ('refused' in choice) return choice;
    main.sessions.used(projectPath, id);
    const opened = await main.open.call({ slot, directory: choice.record.directory, claude: true, resume: id });
    return isRefused(opened) ? opened : { index: opened.index, open: main.openProjects() };
  });
}
