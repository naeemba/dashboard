import { resolve } from 'node:path';
import { failureText } from '../../shared/errors/failure';
import { closeRefusal, type ClosingPane } from '../../shared/panes/close-refusal';
import type { SessionReply, SessionRequest } from '../workers/session-cli';
import { answered, refused } from '../workers/session-cli';
import { APP_VERBS, PROJECT_REQUEST } from './project-cli';

// What main does with `dashboard project open`, `close` and `focus`: every decision, against what main.ts hands
// over. They arrive on the session socket as [PROJECT_REQUEST, verb, folder, name], the folder already
// found in projects.yaml and ~-expanded by project-cli.ts; anything else is the session command's.

export type ProjectRequestPorts = {
  // The slot a project folder is open in, or -1.
  slotOf(projectPath: string): number;
  // Whether the project in that slot was restored with its folder gone: a dead page, not an open one.
  missingIn(slot: number): boolean;
  folderExists(projectPath: string): boolean;
  // Opens the folder the way the project picker does: a page on every screen. Answers its slot.
  open(projectPath: string): number;
  // Starts the page's main session if it is not running, and answers its name once it has initialised,
  // which is when another session's SendMessage can reach it.
  startMain(slot: number): Promise<string>;
  // The project's panes as the close key reads them, each with its name.
  panesOf(slot: number): ClosingPane[];
  // Closes it the way the close key does once it has agreed: shells, editor and page gone.
  close(slot: number): void;
  // Brings the window to the front on the page in that slot.
  focus(slot: number): void;
};

// How long `project open` waits for main to answer. Claude Code takes a few seconds to start; a minute
// is long enough for a slow machine and short enough that a session stuck starting is said out loud.
export const MAIN_START_MS = 60_000;

// An explicit open starts main as well as the page, so the manager can hand the project to it at once.
// Restoring pages at launch does not come here, so a restored page's main still waits to be shown,
// told something, or reported to (chat-start.ts).
async function startedMain(ports: ProjectRequestPorts, slot: number, opened: string): Promise<SessionReply> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`nothing answered within ${MAIN_START_MS / 1000} seconds`)), MAIN_START_MS);
  });
  try {
    return answered(`${opened}; ${await Promise.race([ports.startMain(slot), timeout])} is running`);
  } catch (error) {
    return refused(`${opened}, but its main session did not start: ${failureText(error)}`);
  } finally {
    clearTimeout(timer);
  }
}

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
    const slot = ports.slotOf(projectPath);
    if (verb === 'open') {
      // A dead page is opened over, as the picker revives it once its folder is back.
      if (slot !== -1 && !ports.missingIn(slot)) return startedMain(ports, slot, `${name} is already open`);
      if (!ports.folderExists(projectPath)) return refused(`${name}'s folder, ${projectPath}, does not exist`);
      return startedMain(ports, ports.open(projectPath), `opened ${name}`);
    }
    if (slot === -1) return refused(`${name} is not open`);
    if (verb === 'focus') {
      ports.focus(slot);
      return answered(`switched to ${name}`);
    }
    // The close key's own refusal and nothing else: no question, since nobody is at the keyboard to
    // answer one. The cost: an unsaved buffer in the project's editor, which the refusal never reads,
    // goes with the rest, where the key would have asked first.
    const refusal = closeRefusal(name, ports.panesOf(slot));
    if (refusal !== '') return refused(refusal);
    ports.close(slot);
    return answered(`closed ${name}`);
  };
}
