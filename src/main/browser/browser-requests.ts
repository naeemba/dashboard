import type { Refused } from '../../shared/app/bridge';
import { isRecord } from '../../shared/app/is-record';
import { failureText } from '../../shared/errors/failure';
import { MANAGER_SLOT } from '../../shared/manager/manager';
import { paneFromId } from '../../shared/panes/terminals';
import { isRefused, sessionReply, type BoundAction } from '../actions/action';
import { answered, PANE_ID, refused, type SessionReply, type SessionRequest } from '../workers/session-cli';
import type { BrowserReads } from './browser-page';
import { BROWSER_REQUEST, type BrowserCommand } from './browser-cli';

// The browser command's door: [BROWSER_REQUEST, pane, command as JSON] on the session socket, for the
// agent in that pane. A change is the browser action's, a read browser-page.ts's; this only says which,
// and which project the pane is in. Anything else is `otherwise`'s.

export type BrowserRequestPorts = {
  // Whether the pane is open in this app: a worker, or a page's main screen.
  paneOpen(pane: string): boolean;
  projectPath(slot: number): string | undefined;
  // The page a project folder is open on, or -1.
  slotOf(projectPath: string): number;
  actions: Record<'open' | 'claim' | 'release' | 'navigate' | 'step' | 'resize' | 'click' | 'type' | 'press', BoundAction>;
  reads: BrowserReads;
};

// A pane id that names no pane of this app: a tab it opened would be held by nobody who could let go.
function paneRefusal(paneOpen: (pane: string) => boolean, pane: string): Refused | null {
  return PANE_ID.test(pane) && paneOpen(pane) ? null : { refused: `pane ${pane} is not open in this app` };
}

// The project whose browser a pane's open and tabs mean: the one named with --project, else the
// pane's own. The manager's page has no browser.
export function browserProject(ports: Pick<BrowserRequestPorts, 'projectPath' | 'slotOf'>, pane: string, named: string | null): string | Refused {
  if (named !== null) return ports.slotOf(named) === -1 ? { refused: `${named} is not open in the app; \`dashboard project open\` it first` } : named;
  const { slot } = paneFromId(pane);
  if (slot === MANAGER_SLOT) return { refused: 'the manager has no browser; name a project with --project' };
  return ports.projectPath(slot) ?? { refused: `pane ${pane} is in no open project` };
}

async function answer(ports: BrowserRequestPorts, pane: string, command: BrowserCommand): Promise<SessionReply> {
  const reply = (result: string | Refused): SessionReply => (isRefused(result) ? refused(result.refused) : answered(result));
  const { actions, reads } = ports;
  const unknownPane = paneRefusal(ports.paneOpen, pane);
  if (unknownPane !== null) return refused(unknownPane.refused);
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
    case 'go': return sessionReply(await actions.navigate.call({ ...onTab, url: command.url }));
    case 'back': case 'forward': case 'reload': return sessionReply(await actions.step.call({ ...onTab, step: command.verb }));
    case 'resize': return sessionReply(await actions.resize.call({ ...onTab, width: command.width, height: command.height }));
    case 'reset': return sessionReply(await actions.resize.call(onTab));
    case 'click': return sessionReply(await actions.click.call({ ...onTab, ref: command.ref }));
    case 'type': return sessionReply(await actions.type.call({ ...onTab, ref: command.ref, text: command.text }));
    case 'press': return sessionReply(await actions.press.call({ ...onTab, key: command.key, ref: command.ref }));
    case 'read': return reply(await reads.read(pane, command.tab, command));
    case 'screenshot': return reply(await reads.screenshot(pane, command.tab, command));
    case 'snapshot': return reply(await reads.snapshot(pane, command.tab, null));
    case 'console': return reply(await reads.console(pane, command.tab, null));
    case 'network': return reply(await reads.network(pane, command.tab, null));
  }
}

export function browserRequests(
  ports: BrowserRequestPorts,
  otherwise: (request: SessionRequest) => Promise<SessionReply>,
): (request: SessionRequest) => Promise<SessionReply> {
  return async (request) => {
    const [word, pane, json] = request.args;
    if (word !== BROWSER_REQUEST) return otherwise(request);
    let command: unknown;
    try {
      command = JSON.parse(json ?? '');
    } catch {
      command = null;
    }
    if (pane === undefined || !isRecord(command) || typeof command.verb !== 'string') return refused('the browser request was not one the app could read');
    // A page that stopped answering, or a tab closed mid-call, is said as what it is.
    return answer(ports, pane, command as BrowserCommand).catch((error: unknown) => refused(failureText(error)));
  };
}
