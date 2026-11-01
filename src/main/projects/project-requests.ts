import { resolve } from 'node:path';
import { closeRefusal, type ClosingPane } from '../../shared/panes/close-refusal';
import type { SessionReply, SessionRequest } from '../workers/session-cli';
import { answered, refused } from '../workers/session-requests';
import { PROJECT_REQUEST } from './project-cli';

// What main does with `dashboard project open` and `close`: every decision, against what main.ts hands
// over. They arrive on the session socket as [PROJECT_REQUEST, verb, folder, name], the folder already
// found in projects.yaml and ~-expanded by project-cli.ts; anything else is the session command's.

export type ProjectRequestPorts = {
  // The slot a project folder is open in, or -1.
  slotOf(projectPath: string): number;
  folderExists(projectPath: string): boolean;
  // Opens the folder the way the project picker does: a page on every screen.
  open(projectPath: string): void;
  // The project's panes as the close key reads them, each with its name.
  panesOf(slot: number): ClosingPane[];
  // Closes it the way the close key does once it has agreed: shells, editor and page gone.
  close(slot: number): void;
};

export function projectRequests(
  ports: ProjectRequestPorts,
  otherwise: (request: SessionRequest) => Promise<SessionReply>,
): (request: SessionRequest) => Promise<SessionReply> {
  return async (request) => {
    const [word, verb, folder, name] = request.args;
    if (word !== PROJECT_REQUEST) return otherwise(request);
    if ((verb !== 'open' && verb !== 'close') || folder === undefined || name === undefined) {
      return refused('the project request was not one the app could read');
    }
    const projectPath = resolve(folder);
    const slot = ports.slotOf(projectPath);
    if (verb === 'open') {
      if (slot !== -1) return answered(`${name} is already open`);
      if (!ports.folderExists(projectPath)) return refused(`${name}'s folder, ${projectPath}, does not exist`);
      ports.open(projectPath);
      return answered(`opened ${name}`);
    }
    if (slot === -1) return refused(`${name} is not open`);
    // The close key's own refusal and nothing else: no question, since nobody is at the keyboard to
    // answer one. The cost: an unsaved buffer in the project's editor, which the refusal never reads,
    // goes with the rest, where the key would have asked first.
    const refusal = closeRefusal(name, ports.panesOf(slot));
    if (refusal !== '') return refused(refusal);
    ports.close(slot);
    return answered(`closed ${name}`);
  };
}
