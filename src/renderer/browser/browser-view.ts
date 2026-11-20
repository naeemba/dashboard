import './browser.css';
import type { DashboardBridge } from '../../shared/app/bridge';
import { NO_TABS, type BrowserState, type BrowserTab, type BrowserVerb } from '../../shared/browser/browser';
import type { BrowserCommand } from '../../shared/keys/browser-actions';
import { failureText } from '../../shared/errors/failure';
import { clampIndex, heldIndex } from '../../shared/app/clamp-index';
import { isModified } from '../keys/shortcuts';
import { browserPlacement, type BrowserSpot } from './browser-placement';

// A project's browser screen: a row of tabs, an address bar under it, and the box the tab's web page
// is drawn in. The page itself is main's, a native view laid over that box (browser-views.ts); this
// draws everything around it and asks a browser action for every change. docs/browser/README.md.

export type BrowserOptions = {
  bridge: DashboardBridge;
  projectPath: string;
  onError(message: string): void;
  onNotice(message: string): void;
  onChanged(): void;
};

export type BrowserView = {
  element: HTMLElement;
  // The keyboard to the web page on screen, or the address bar when there is no tab.
  focus(): void;
  runCommand(command: BrowserCommand): void;
  statusLabel(): string;
  // The page is gone, and its tabs with it: its screen is measured and told of nothing more.
  close(): void;
};

// Every browser screen, by its project, for main's pushes and for the placement.
const screens = new Map<string, { receive(state: BrowserState): void; hasTabs(): boolean; spot(): BrowserSpot }>();

function tabName(tab: BrowserTab): string {
  return tab.title.trim() || (tab.url === 'about:blank' ? 'New tab' : tab.url);
}

export function createBrowserView(options: BrowserOptions): BrowserView {
  const { bridge, projectPath } = options;
  let state: BrowserState = NO_TABS;
  // The highlighted chip while the tab row has the keyboard; the last place is the new tab chip.
  let highlighted = 0;
  // The chip a left press landed on, by its tab id ('new' for the new tab chip), held here rather than
  // on the node so a redraw between press and release still matches. A release acts only on it.
  let pressed: number | 'new' | null = null;
  // Any release ends the press, so one that started on a chip and ended off the row is not kept for
  // the next stray release. Bubbling, it runs after the chip's own mouseup has read it.
  const endPress = (): void => { pressed = null; };
  window.addEventListener('mouseup', endPress);

  const element = document.createElement('div');
  element.className = 'browser';
  const row = document.createElement('div');
  row.className = 'browser-tabs';
  row.tabIndex = 0;
  const address = document.createElement('input');
  address.className = 'browser-address';
  address.dir = 'auto';
  address.spellcheck = false;
  address.placeholder = 'Type an address, then Enter';
  const page = document.createElement('div');
  page.className = 'browser-page';
  element.append(row, address, page);

  // A browser action, its refusal said on the bar and its failure as one.
  async function act(verb: BrowserVerb, request: Record<string, unknown> = {}): Promise<boolean> {
    try {
      const answer = await bridge.browser(verb, { projectPath, ...request });
      if ('refused' in answer) options.onNotice(answer.refused);
      return !('refused' in answer);
    } catch (error: unknown) {
      options.onError(`The browser could not ${verb}: ${failureText(error)}`);
      return false;
    }
  }

  const shownTab = (): BrowserTab | undefined => state.tabs.find((tab) => tab.id === state.active);

  function focusPage(): void {
    if (state.active === null) address.focus();
    else void act('focus');
  }

  function showAddress(): void {
    if (document.activeElement === address) return;
    address.value = shownTab()?.url.replace(/^about:blank$/, '') ?? '';
  }

  function draw(): void {
    highlighted = clampIndex(highlighted, state.tabs.length);
    const chips = [...state.tabs.map((tab) => {
      const chip = document.createElement('span');
      chip.className = 'browser-tab';
      chip.classList.toggle('active', tab.id === state.active);
      chip.textContent = tabName(tab);
      chip.title = tab.url;
      // Who has it, when it is not you: the agent's pane.
      if (tab.holder !== 'user') {
        const holder = document.createElement('span');
        holder.className = 'browser-tab-holder';
        holder.textContent = tab.holder;
        chip.append(holder);
      }
      return chip;
    }), Object.assign(document.createElement('span'), { className: 'browser-tab browser-tab-new', textContent: '+ New tab' })];
    chips.forEach((chip, index) => {
      const id = state.tabs[index]?.id ?? 'new';
      chip.classList.toggle('highlighted', index === highlighted);
      // A click moves the highlight there, then does what Enter does (conventions-rule-1). The press
      // keeps the keyboard where it is, and the release acts: a push from main redraws the row, and a
      // chip rebuilt between press and release never gets a click, but the chip there gets the mouseup.
      // Paired with the press, because mouseup goes to whatever is under the pointer: a drag from the
      // address bar, or from another chip, let go over this one does nothing.
      chip.addEventListener('mousedown', (event) => {
        event.preventDefault();
        if (event.button === 0) pressed = id;
      });
      chip.addEventListener('mouseup', (event) => {
        if (event.button !== 0 || pressed !== id) return;
        highlighted = index;
        choose();
      });
    });
    row.replaceChildren(...chips);
  }

  function choose(): void {
    const tab = state.tabs[highlighted];
    if (tab === undefined) return newTab();
    void act('switch', { tab: tab.id }).then((done) => { if (done) focusPage(); });
  }

  function newTab(): void {
    void act('open').then((done) => {
      if (!done) return;
      address.value = '';
      address.focus();
    });
  }

  function go(): void {
    const verb = state.active === null ? 'open' : 'navigate';
    void act(verb, { url: address.value }).then((done) => { if (done) focusPage(); });
  }

  row.addEventListener('keydown', (event) => {
    if (isModified(event)) return;
    const moves: Record<string, () => void> = {
      ArrowLeft: () => { highlighted = (highlighted + state.tabs.length) % (state.tabs.length + 1); draw(); },
      ArrowRight: () => { highlighted = (highlighted + 1) % (state.tabs.length + 1); draw(); },
      ArrowDown: () => address.focus(),
      Enter: choose,
      Escape: focusPage,
    };
    const move = moves[event.key];
    if (move === undefined) return;
    event.preventDefault();
    move();
  });
  // Arriving on the row starts the highlight on the tab on screen.
  row.addEventListener('focus', () => {
    highlighted = heldIndex(state.tabs.map((tab) => tab.id), state.active ?? undefined, 0);
    draw();
  });

  address.addEventListener('keydown', (event) => {
    if (isModified(event)) return;
    if (event.key === 'Enter') go();
    else if (event.key === 'ArrowUp') row.focus();
    else if (event.key === 'Escape') {
      address.blur();
      showAddress();
      focusPage();
    } else return;
    event.preventDefault();
  });
  address.addEventListener('blur', showAddress);

  function receive(next: BrowserState): void {
    state = next;
    draw();
    showAddress();
    options.onChanged();
  }
  screens.set(projectPath, {
    receive,
    hasTabs: () => state.tabs.length > 0,
    spot() {
      const { x, y, width, height } = page.getBoundingClientRect();
      return { projectPath, onScreen: page.checkVisibility({ visibilityProperty: true }), bounds: { x, y, width, height } };
    },
  });
  resized.observe(page);
  draw();
  void bridge.readBrowser(projectPath).then(receive, () => undefined);

  // An action from a key, then the keyboard back to the page it was pressed in.
  const run = (verb: BrowserVerb, request: Record<string, unknown>): void => void act(verb, request).then(focusPage);
  const commands: Record<BrowserCommand, () => void> = {
    address: () => { address.focus(); address.select(); },
    'tab-new': newTab,
    'tab-close': () => { if (state.active !== null) run('close', { tab: state.active }); },
    'tab-next': () => run('switch', { step: 1 }),
    'tab-previous': () => run('switch', { step: -1 }),
    back: () => run('step', { step: 'back' }),
    forward: () => run('step', { step: 'forward' }),
    reload: () => run('step', { step: 'reload' }),
    revoke: () => run('revoke', {}),
  };

  return {
    element,
    focus: focusPage,
    runCommand: (command) => commands[command](),
    statusLabel: () => {
      const tab = shownTab();
      return tab === undefined ? 'no tab' : tabName(tab);
    },
    // Main closes a project's tabs when this machine closes it, but a host's project, or one of ours
    // left behind on joining a host, goes from this screen without main hearing: the page says so.
    close() {
      void bridge.browser('reset', { projectPath }).catch(() => undefined);
      screens.delete(projectPath);
      resized.unobserve(page);
      window.removeEventListener('mouseup', endPress);
      queue();
    },
  };
}

// Once for the window: main's pushes, and the one place the web page is put on screen or taken off it.
// Asked again after anything that can move it, once a frame however many asked: a page or a view
// shown or hidden, a box resized (the window, the drawer), a layer added to the body or taken off.
let said = '';
let queued = false;
let placementBridge: DashboardBridge | null = null;
const resized = new ResizeObserver(queue);
new MutationObserver(queue).observe(document.body, { childList: true });
new MutationObserver(queue).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
// The which-key strip's wait ending (which-key.css), when it turns visible.
document.body.addEventListener('animationend', queue);

export function listenForBrowsers(bridge: DashboardBridge): void {
  bridge.onBrowserChange((projectPath, state) => {
    screens.get(projectPath)?.receive(state);
    queue();
  });
  placementBridge = bridge;
}

function queue(): void {
  if (queued) return;
  queued = true;
  requestAnimationFrame(sync);
}

function sync(): void {
  queued = false;
  // Only a screen with a tab can have a page to draw, so with none open nothing is measured.
  const withTabs = [...screens.values()].filter((screen) => screen.hasTabs());
  const placed = withTabs.length === 0 ? null : browserPlacement(
    withTabs.map((screen) => screen.spot()),
    [...document.body.children].map((layer) => ({ id: layer.id, drawn: layer.checkVisibility({ visibilityProperty: true }) })),
  );
  const saying = JSON.stringify(placed);
  if (saying === said || placementBridge === null) return;
  said = saying;
  void (placed === null ? placementBridge.browser('hide', {}) : placementBridge.browser('show', placed)).catch(() => { said = ''; });
}
