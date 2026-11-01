import type { DashboardBridge, OpenProjects } from '../../shared/app/bridge';
import { relativeAge } from '../../shared/app/age';
import { clampIndex } from '../../shared/app/clamp-index';
import { failureText } from '../../shared/errors/failure';
import { SESSION_PAGE_SIZE, type DocEntry, type SessionList } from '../../shared/drawer/drawer';
import { iconButton, icon } from '../app/icons';
import { promptOverlay } from '../app/overlay';
import type { Page } from '../app/page';
import { isModified } from '../keys/shortcuts';
import { drawerKey, drawerRows, sessionDetail, type DrawerRow } from './drawer-rows';

// The drawer on the left of a project's page: the project's docs and the Claude sessions the app started
// for it, rows that jump somewhere and never content. It lies over the page without resizing it, and is
// opened and closed by its button in the title row, beside the tabs, or by its key. Every rule with a
// branch is drawer-rows.ts's; this is the DOM.

type DrawerPorts = {
  bridge: Pick<DashboardBridge, 'listDocs' | 'listSessions' | 'renameSession' | 'resumeSession'>;
  // The project page in front, or null on the manager and a project whose folder has gone.
  page(): Page | null;
  // Whether a keystroke is the drawer's own key, as the settings bind it now.
  isToggle(event: KeyboardEvent): boolean;
  openDoc(page: Page, path: string): void;
  report(message: string): void;
  // The keyboard back to the page once the drawer goes.
  closed(): void;
  // A resume opened this worker on the page: the keyboard goes to it, on the terminals view.
  resumed(page: Page, index: number, open: OpenProjects): void;
};

type Drawer = { button: HTMLButtonElement; element: HTMLElement; toggle(): void; render(): void };

const NO_SESSIONS: SessionList = { rows: [], more: false };

export function createDrawer(ports: DrawerPorts): Drawer {
  const element = document.createElement('div');
  element.className = 'drawer';
  element.hidden = true;
  const box = document.createElement('input');
  box.className = 'search-input drawer-filter';
  // A doc or a session renamed in Persian is typed right to left, and the box turns round to match.
  box.dir = 'auto';
  box.placeholder = 'Filter docs and sessions';
  const list = document.createElement('ul');
  list.className = 'drawer-list';
  const keys = document.createElement('p');
  keys.className = 'drawer-keys';
  keys.textContent = '↑↓ choose · Enter opens · F2 renames a session · Escape closes';
  element.append(box, list, keys);
  // A click anywhere in the drawer, on a row, a heading or empty space, leaves the keyboard in the box,
  // so the arrows, Enter and Escape still work after Load more or a refused resume. A click in the box
  // itself still places the caret.
  element.addEventListener('mousedown', (event) => {
    if (event.target !== box) event.preventDefault();
  });

  const button = iconButton('project drawer-toggle', 'drawer', 'Docs & sessions', () => toggle());
  // A click leaves the keyboard where it was until the drawer takes it.
  button.addEventListener('mousedown', (event) => event.preventDefault());

  let shownFor: Page | null = null;
  let docs: DocEntry[] = [];
  let sessions = NO_SESSIONS;
  let count = SESSION_PAGE_SIZE;
  let rows: DrawerRow[] = [];
  let items: HTMLElement[] = [];
  let highlighted = 0;
  // Each load is numbered, so an answer that arrives after the drawer moved to another page is dropped.
  let loads = 0;

  function heading(text: string, empty: boolean, emptyText: string): HTMLElement[] {
    const title = document.createElement('li');
    title.className = 'drawer-heading';
    title.textContent = text;
    if (!empty) return [title];
    const none = document.createElement('li');
    none.className = 'drawer-empty';
    none.textContent = emptyText;
    return [title, none];
  }

  function rowElement(row: DrawerRow, index: number, projectPath: string): HTMLElement {
    const item = document.createElement('li');
    item.className = 'drawer-row';
    item.classList.toggle('highlighted', index === highlighted);
    const name = document.createElement('span');
    name.className = 'drawer-name';
    const detail = document.createElement('span');
    detail.className = 'drawer-detail';
    if (row.kind === 'doc') {
      name.textContent = row.doc.name;
      item.append(icon('notes'), name);
    } else if (row.kind === 'session') {
      name.textContent = row.session.label;
      const age = relativeAge(row.session.lastUsedAt);
      detail.textContent = [sessionDetail(row.session, projectPath), age].filter(Boolean).join(' · ');
      item.append(icon('claude'), name, detail);
    } else {
      name.textContent = `Load ${SESSION_PAGE_SIZE} more`;
      item.append(icon('expand'), name);
    }
    // A click moves the highlight there, then does what Enter does there (conventions-rule-1).
    item.addEventListener('click', () => {
      highlighted = index;
      act(row);
    });
    return item;
  }

  function draw(): void {
    if (shownFor === null) return;
    const projectPath = shownFor.project.path;
    rows = drawerRows(docs, sessions, box.value, projectPath);
    highlighted = clampIndex(highlighted, rows.length - 1);
    items = rows.map((row, index) => rowElement(row, index, projectPath));
    const docCount = rows.filter((row) => row.kind === 'doc').length;
    const filtering = box.value !== '';
    list.replaceChildren(
      ...heading('Docs', docCount === 0, filtering ? 'No doc matches' : 'No docs/ folder here'),
      ...items.slice(0, docCount),
      ...heading('Sessions', rows.length === docCount, filtering ? 'No session matches' : 'No sessions started here yet'),
      ...items.slice(docCount),
    );
    items[highlighted]?.scrollIntoView({ block: 'nearest' });
  }

  // An arrow key moves the highlight between the rows already drawn and builds nothing.
  function highlight(index: number): void {
    items[highlighted]?.classList.remove('highlighted');
    highlighted = index;
    items[highlighted]?.classList.add('highlighted');
    items[highlighted]?.scrollIntoView({ block: 'nearest' });
  }

  // What the drawer lists, read again. The docs only on opening: Load more and a rename change sessions.
  function load(withDocs: boolean): void {
    const page = shownFor;
    if (page === null) return;
    const ticket = ++loads;
    Promise.all([
      withDocs ? ports.bridge.listDocs(page.project.path) : docs,
      ports.bridge.listSessions(page.project.path, count),
    ]).then(
      ([nextDocs, nextSessions]) => {
        if (ticket !== loads) return;
        docs = nextDocs;
        sessions = nextSessions;
        draw();
      },
      (error: unknown) => ports.report(`Could not read the drawer: ${failureText(error)}`),
    );
  }

  function open(page: Page): void {
    shownFor = page;
    docs = [];
    sessions = NO_SESSIONS;
    count = SESSION_PAGE_SIZE;
    highlighted = 0;
    box.value = '';
    element.hidden = false;
    button.classList.add('active');
    draw();
    load(true);
    box.focus();
  }

  function hide(): void {
    shownFor = null;
    loads += 1;
    element.hidden = true;
    button.classList.remove('active');
    docs = [];
    sessions = NO_SESSIONS;
    rows = [];
    items = [];
    list.replaceChildren();
  }

  function close(): void {
    hide();
    ports.closed();
  }

  function toggle(): void {
    if (shownFor !== null) return close();
    const page = ports.page();
    if (page === null) return ports.report('The drawer lists a project\'s docs and sessions — go to a project first');
    open(page);
  }

  function act(row: DrawerRow): void {
    const page = shownFor;
    if (page === null) return;
    if (row.kind === 'more') {
      count += SESSION_PAGE_SIZE;
      return load(false);
    }
    if (row.kind === 'doc') {
      close();
      return ports.openDoc(page, row.doc.path);
    }
    ports.bridge.resumeSession(page.slot, row.session.id).then(
      (reply) => {
        if ('refused' in reply) return ports.report(reply.refused);
        hide();
        ports.resumed(page, reply.index, reply.open);
      },
      (error: unknown) => ports.report(`Could not resume ${row.session.label}: ${failureText(error)}`),
    );
  }

  function rename(row: DrawerRow): void {
    const page = shownFor;
    if (page === null || row.kind !== 'session') return;
    void (async () => {
      const label = await promptOverlay('Rename this session', row.session.label, row.session.label, 'Enter renames, Escape keeps the name');
      if (shownFor === page) box.focus();
      if (label === null) return;
      try {
        const reply = await ports.bridge.renameSession(page.project.path, row.session.id, label);
        if (reply !== null) ports.report(reply.refused);
        load(false);
      } catch (error: unknown) {
        ports.report(`Could not rename ${row.session.label}: ${failureText(error)}`);
      }
    })();
  }

  box.addEventListener('input', () => {
    highlighted = 0;
    draw();
  });
  element.addEventListener('keydown', (event) => {
    const row = rows[highlighted];
    const action = drawerKey(event.key, isModified(event), ports.isToggle(event), row);
    if (action === 'ignore') return;
    event.preventDefault();
    switch (action) {
      case 'swallow': return;
      case 'close': return close();
      case 'next':
      case 'previous':
        if (rows.length === 0) return;
        return highlight((highlighted + (action === 'next' ? 1 : -1) + rows.length) % rows.length);
      case 'act': return act(row);
      case 'rename': return rename(row);
    }
  });

  return {
    button,
    element,
    toggle,
    // Asked on every redraw of the title row: the button is there only on a project page, and the drawer
    // shown for one page is put away once another is in front.
    render() {
      const page = ports.page();
      button.hidden = page === null;
      if (shownFor !== null && shownFor !== page) hide();
    },
  };
}
