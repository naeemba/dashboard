import { resolve } from 'node:path';
import { sessionReply, type BoundAction } from '../actions/action';
import type { SessionReply, SessionRequest } from '../workers/session-cli';
import { refused } from '../workers/session-cli';
import { APP_VERBS, PROJECT_REQUEST } from './project-cli';

// The command's door to the project actions: `dashboard project open`, `close` and `focus`. They arrive
// on the session socket as [PROJECT_REQUEST, verb, folder, name], the folder already found in
// projects.yaml and ~-expanded by project-cli.ts; anything else is the session command's. Every decision
// is the action's (src/main/actions/project/).

export type ProjectRequestPorts = {
  // The slot a project folder is open in, or -1.
  slotOf(projectPath: string): number;
  open: BoundAction;
  close: BoundAction;
  focus: BoundAction;
};

export function projectRequests(
  ports: ProjectRequestPorts,
  otherwise: (request: SessionRequest) => Promise<SessionReply>,
): (request: SessionRequest) => Promise<SessionReply> {
  return async (request) => {
    const [word, verb, folder, name] = request.args;
    if (word !== PROJECT_REQUEST) return otherwise(request);
    if (verb === undefined || !APP_VERBS.includes(verb) || folder === undefined || name === undefined) {
      return refused('the project request was not one the app could read');
    }
    const projectPath = resolve(folder);
    if (verb === 'open') return sessionReply(await ports.open.call({ projectPath, name, from: 'command' }));
    // -1 for a project that is not open, which each action refuses.
    const slot = ports.slotOf(projectPath);
    return sessionReply(await (verb === 'close' ? ports.close : ports.focus).call({ slot, name }));
  };
}
