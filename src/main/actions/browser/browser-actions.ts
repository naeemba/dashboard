import { rm } from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import type { BrowserProxy } from '../../../shared/browser/proxy';
import type { Channels } from '../../app/channels';
import { browserFileFolder, browserPage } from '../../browser/browser-page';
import { browserRequests, type BrowserRequestPorts } from '../../browser/browser-requests';
import { browserViews, type BrowserViewsMain } from '../../browser/browser-views';
import { idleQuestion, tabClock, turnEndQuestion } from '../../browser/tab-idle';
import { firstFile } from '../../nvim/file-open';
import type { SessionReply, SessionRequest } from '../../workers/session-cli';
import { bind, registerActions } from '../action';
import type { BrowserPorts } from './browser-ports';
import { browserClaim, browserRelease, browserRevoke } from './claims';
import { browserNavigate, browserStep } from './navigate';
import { browserProxy } from './proxy';
import { browserClick, browserEval, browserPress, browserResize, browserType, browserUpload } from './page';
import { browserClose, browserOpen, browserSwitch } from './tabs';
import { browserFocus, browserHide, browserReset, browserShow } from './view';

// Main's wiring for the browser actions and their doors, out of main.ts, which is at its 600-line
// ceiling. The screen reaches each through its `browser:<verb>` channel; a page's new window is
// browser.open and a page closing itself browser.close; a project closing, or its page leaving the
// screen, is browser.reset; the browser command reaches them through `requests`, and a pane let go
// of is browser.release of all its tabs. docs/browser/README.md has the whole of it.
// `panes` is what the browser command's door asks main of the panes and pages (browser-requests.ts).
type PaneLookups = Omit<BrowserRequestPorts, 'actions' | 'reads' | 'used'>;

// How the app asks a tab's agent, and when: a main through its chat, queued behind its turn, once its
// tab goes unused; a worker as its next prompt, a Claude screen's or typed into its terminal, once its
// turn ends (tab-idle.ts). `idleMinutes` is the setting, null never asking. `mainOf` is the main a
// worker reports to, told of the tabs it still held when let go of.
export type TabAsking = {
  tellMain(slot: number, text: string): void;
  tellWorker(pane: string, text: string): void;
  mainOf(pane: string): number;
  idleMinutes(): number | null;
};

const SWEEP_MS = 60_000;

export function browserActions(table: Channels, main: BrowserViewsMain & { proxy(): BrowserProxy | null }, panes: PaneLookups, asking: TabAsking) {
  // A page's window that is no web page is denied before it opens (browser-views.ts).
  const views = browserViews(main, {
    opened: (projectPath, url, opener) => void open.call({ projectPath, url, opener }),
    closed: (projectPath, tab, opener) => void close.call({ projectPath, tab, opener }),
  });
  const page = browserPage(views.pages, views.ports.allBrowsers, browserFileFolder(app.getPath('userData')));
  // The folder screenshots were saved in before browser-files/, which nothing clears any more.
  void rm(path.join(app.getPath('userData'), 'browser-screenshots'), { recursive: true, force: true }).catch(() => undefined);
  const isFile = async (file: string): Promise<boolean> => (await firstFile([file])) !== undefined;
  // Every state kept is seen by the idle clock, so it knows who opened each tab (tab-idle.ts).
  const clock = tabClock();
  const keep: BrowserPorts['keep'] = (projectPath, state) => {
    views.ports.keep(projectPath, state);
    clock.seen(state, Date.now());
  };
  const ports: BrowserPorts = { ...views.ports, ...page.ports, isFile, keep, tellMain: asking.tellMain, mainOf: asking.mainOf };
  // An agent that does not answer keeps its tab: a question is asked once and nothing closes on a timer.
  setInterval(() => {
    const minutes = asking.idleMinutes();
    const questions = clock.due(views.ports.allBrowsers(), Date.now(), views.shown(), minutes);
    for (const { main: slot, tabs } of questions) asking.tellMain(slot, idleQuestion(tabs, minutes ?? 0));
  }, SWEEP_MS).unref();
  // The settings' proxy at launch, and each change to it main keeps.
  const proxy = bind(browserProxy, ports);
  void proxy.call({ proxy: main.proxy() });
  const open = bind(browserOpen, ports);
  const close = bind(browserClose, ports);
  const reset = bind(browserReset, ports);
  const release = bind(browserRelease, ports);
  const navigate = bind(browserNavigate, ports);
  const step = bind(browserStep, ports);
  registerActions(table, [
    open, close, bind(browserSwitch, ports), navigate, step, bind(browserShow, ports),
    bind(browserHide, ports), bind(browserFocus, ports), reset, bind(browserRevoke, ports),
  ]);
  // A read, so no action: the tabs a page built after they were opened draws.
  table.handle('browser:read', (_screen, projectPath: unknown) => views.ports.browserOf(String(projectPath)));
  const actions: BrowserRequestPorts['actions'] = {
    open, release, close, navigate, step, claim: bind(browserClaim, ports), resize: bind(browserResize, ports),
    click: bind(browserClick, ports), type: bind(browserType, ports), press: bind(browserPress, ports),
    upload: bind(browserUpload, ports), eval: bind(browserEval, ports),
  };
  return {
    owns: views.owns,
    useProxy: (next: BrowserProxy | null): void => void proxy.call({ proxy: next }),
    reset,
    // Every tab the pane holds back to the user, still open, and its main told which: the pane released,
    // finished, its agent exited, or another agent started in it.
    letGo: (pane: string): void => void release.call({ pane }),
    // The worker's turn ended with nothing left running: asked about the tabs it still holds.
    turnEnded(pane: string): void {
      const tabs = clock.ended(views.ports.allBrowsers(), pane, views.shown());
      if (tabs.length > 0) asking.tellWorker(pane, turnEndQuestion(tabs));
    },
    requests: (otherwise: (request: SessionRequest) => Promise<SessionReply>) => browserRequests({
      ...panes, actions, reads: page.reads, used: (pane, tab) => clock.calledOn(views.ports.allBrowsers(), pane, tab, Date.now()),
    }, otherwise),
  };
}
