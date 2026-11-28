import type { Refused } from '../../shared/app/bridge';
import { isRecord } from '../../shared/app/is-record';
import { failureText } from '../../shared/errors/failure';
import { MANAGER_BROWSER_PATH, MANAGER_SLOT } from '../../shared/manager/manager';
import { MAIN_INDEX, paneFromId } from '../../shared/panes/terminals';
import { livePane, notOpen } from '../panes/live-pane';
import { isRefused, sessionReply, type BoundAction } from '../actions/action';
import { answered, refused, type SessionReply, type SessionRequest } from '../workers/session-cli';
import type { BrowserReads } from './browser-page';
import { BROWSER_REQUEST, type BrowserRequest } from './browser-cli';

// The browser command's door: [BROWSER_REQUEST, pane, command as JSON, the pane's project] on the
// session socket, for the agent in that pane. A change is the browser action's, a read
// browser-page.ts's; this only says which, and which pane and project it is. Anything else is
// `otherwise`'s.

export type BrowserRequestPorts = {
  // Whether a terminal pane, a worker or the manager's, runs under the id.
  hasCommand(pane: string): boolean;
  projectPath(slot: number): string | undefined;
  // The page a project folder is open on, or -1.
  slotOf(projectPath: string): number;
  actions: Record<'open' | 'claim' | 'release' | 'close' | 'navigate' | 'step' | 'resize' | 'click' | 'type' | 'press' | 'upload' | 'eval', BoundAction>;
  reads: BrowserReads;
  // The pane's browser call named the tab: its idle clock starts over if the pane holds it (tab-idle.ts).
  used(pane: string, tab: number): void;
};

const UNREADABLE = 'the browser request was not one the app could read';
// Whether the pane is open in this app: a terminal pane, or the main screen of an open page. A tab held
// by any other id would be held by nobody who could let go.
export function paneIsOpen(ports: Pick<BrowserRequestPorts, 'hasCommand' | 'projectPath'>, pane: string): boolean {
  const { slot, index } = paneFromId(pane);
  return ports.hasCommand(pane) || (index === MAIN_INDEX && ports.projectPath(slot) !== undefined);
}

// The project whose browser a pane's open and tabs mean: the one named with --project, else the
// pane's own. The manager's panes and its main have the manager's browser.
export function browserProject(ports: Pick<BrowserRequestPorts, 'projectPath' | 'slotOf'>, pane: string, named: string | null): string | Refused {
  if (named !== null) return ports.slotOf(named) === -1 ? { refused: `${named} is not open in the app; \`dashboard project open\` it first` } : named;
  const { slot } = paneFromId(pane);
  if (slot === MANAGER_SLOT) return MANAGER_BROWSER_PATH;
  return ports.projectPath(slot) ?? { refused: `pane ${pane} is in no open project` };
}

async function answer(ports: BrowserRequestPorts, pane: string, command: BrowserRequest): Promise<SessionReply> {
  const result = await act(ports, pane, command);
  // After the action, so a claim counts as its new holder's call and a release as nobody's.
  if ('tab' in command) ports.used(pane, command.tab);
  return result;
}

async function act(ports: BrowserRequestPorts, pane: string, command: BrowserRequest): Promise<SessionReply> {
  const reply = (result: string | Refused): SessionReply => (isRefused(result) ? refused(result.refused) : answered(result));
  const { actions, reads } = ports;
  if (command.verb === 'open' || command.verb === 'tabs') {
    const projectPath = browserProject(ports, pane, command.project);
    if (isRefused(projectPath)) return refused(projectPath.refused);
    if (command.verb === 'tabs') return answered(reads.tabs(pane, projectPath));
    return sessionReply(await actions.open.call({ projectPath, url: command.url, pane }));
  }
  const onTab = { pane, tab: command.tab };
  switch (command.verb) {
    case 'claim': return sessionReply(await actions.claim.call(onTab));
    case 'release': return sessionReply(await actions.release.call(onTab));
    case 'close': return sessionReply(await actions.close.call(onTab));
    case 'go': return sessionReply(await actions.navigate.call({ ...onTab, url: command.url }));
    case 'back': case 'forward': case 'reload': return sessionReply(await actions.step.call({ ...onTab, step: command.verb }));
    case 'resize': return sessionReply(await actions.resize.call({ ...onTab, width: command.width, height: command.height }));
    case 'reset': return sessionReply(await actions.resize.call(onTab));
    case 'click': return sessionReply(await actions.click.call({ ...onTab, ref: command.ref }));
    case 'type': return sessionReply(await actions.type.call({ ...onTab, ref: command.ref, text: command.text }));
    case 'press': return sessionReply(await actions.press.call({ ...onTab, key: command.key, ref: command.ref }));
    case 'upload': return sessionReply(await actions.upload.call({ ...onTab, ref: command.ref, files: command.files }));
    case 'eval': return sessionReply(await actions.eval.call({ ...onTab, script: command.script, waitFor: command.waitFor }));
    case 'read': return reply(await reads.read(pane, command.tab, command));
    case 'screenshot': return reply(await reads.screenshot(pane, command.tab, command));
    case 'snapshot': return reply(await reads.snapshot(pane, command.tab, null));
    case 'console': return reply(await reads.console(pane, command.tab, null));
    case 'network': return reply(await reads.network(pane, command.tab, null));
    // A verb this build does not know, from anything else that writes to the socket.
    default: return refused(UNREADABLE);
  }
}

export function browserRequests(
  ports: BrowserRequestPorts,
  otherwise: (request: SessionRequest) => Promise<SessionReply>,
): (request: SessionRequest) => Promise<SessionReply> {
  return async (request) => {
    const [word, sent, json, paneProject] = request.args;
    if (word !== BROWSER_REQUEST) return otherwise(request);
    let command: unknown;
    try {
      command = JSON.parse(json ?? '');
    } catch {
      command = null;
    }
    if (sent === undefined || paneProject === undefined || !isRecord(command) || typeof command.verb !== 'string') {
      return refused(UNREADABLE);
    }
    const pane = livePane(ports, sent, paneProject);
    if (isRefused(pane)) return refused(pane.refused);
    if (!paneIsOpen(ports, pane)) return refused(notOpen(sent).refused);
    // A page that stopped answering, or a tab closed mid-call, is said as what it is.
    return answer(ports, pane, command as BrowserRequest).catch((error: unknown) => refused(failureText(error)));
  };
}
