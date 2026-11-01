import type { DashboardBridge, OpenProjects } from '../../shared/app/bridge';
import { relativeAge } from '../../shared/app/age';
import { clampIndex } from '../../shared/app/clamp-index';
import { failureText } from '../../shared/errors/failure';
import { SESSION_PAGE_SIZE, type DocEntry, type SessionList } from '../../shared/drawer/drawer';
import { isProjectPage } from '../../shared/manager/manager';
import { icon, iconOnlyButton } from '../app/icons';
import { promptOverlay } from '../app/overlay';
import type { Page } from '../app/page';
import { isModified } from '../keys/shortcuts';
import { docOverlay } from './doc-viewer';
import { drawerFollows, drawerKey, drawerRows, sessionDetail, toggledFolders, treeStep, type DrawerRow } from './drawer-rows';

// The drawer on the left of a page: the project's docs as a tree and the Claude sessions the app started
// for it, or on the manager's page the markdown under ~/.dashboard and ~/.claude and the manager's own.
// Open, it pushes the page to its right and the panes are measured again; closed it takes no room.
// It is opened and closed by its button in the title row, beside the tabs, or by its key.
// A doc opens in the full-screen viewer (doc-viewer.ts), over the drawer, which is still there after.
// Every rule with a branch is drawer-rows.ts's; this is the DOM.

type DrawerPorts = {
  bridge: Pick<DashboardBridge, 'listDocs' | 'readDoc' | 'listSessions' | 'renameSession' | 'resumeSession' | 'openExternal'>;
  // The page in front, the manager's included, or null on a project whose folder has gone.
  page(): Page | null;
  // Whether a keystroke is the drawer's own key, as the settings bind it now.
  isToggle(event: KeyboardEvent): boolean;
  openDoc(page: Page, path: string): void;
  report(message: string): void;
  // The page's width changed, opening or closing the drawer: its panes are measured again.
  resized(): void;
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
  keys.textContent = '↑↓ choose · ←→ fold · Enter opens · F2 renames a session · Escape closes';
  element.append(box, list, keys);
  // A click anywhere in the drawer, on a row, a heading or empty space, leaves the keyboard in the box,
  // so the arrows, Enter and Escape still work after Load more or a refused resume. A click in the box
  // itself still places the caret.
  element.addEventListener('mousedown', (event) => {
    if (event.target !== box) event.preventDefault();
  });

  // Only the icon, and on every page, the manager's too, so the title row does not move between tabs.
  const button = iconOnlyButton('project drawer-toggle', 'drawer', 'Docs & sessions', () => toggle());
  // A click leaves the keyboard where it was until the drawer takes it.
  button.addEventListener('mousedown', (event) => event.preventDefault());

  // Open or closed is one value for the whole app, not each page's (drawer-decision-4): open, it stays
  // open on every tab until it is closed. Not kept across a restart.
  let isOpen = false;
  let shownFor: Page | null = null;
  let docs: DocEntry[] = [];
  // The folders opened in each page's tree, by their path as the rows name it, by the page's path. Kept
  // while the drawer is closed, so it opens on the tree as it was left there.
  const openFolders = new Map<string, ReadonlySet<string>>();
  const foldersOpen = (projectPath: string): ReadonlySet<string> => openFolders.get(projectPath) ?? new Set<string>();
  let sessions = NO_SESSIONS;
  let count = SESSION_PAGE_SIZE;
  let rows: DrawerRow[] = [];
  let items: HTMLElement[] = [];
  let highlighted = 0;
  // Each load is numbered, so an answer that arrives after the drawer moved to another page, or after a
  // newer load of the same list, is dropped. The docs and the sessions count apart: a folder opened while
  // Load more is in flight must not lose its rows to the sessions' answer, nor the other way round.
  let docLoads = 0;
  let sessionLoads = 0;

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
    if ('depth' in row) item.style.paddingLeft = `${10 + row.depth * 16}px`;
    const name = document.createElement('span');
    name.className = 'drawer-name';
    const detail = document.createElement('span');
    detail.className = 'drawer-detail';
    if (row.kind === 'folder') {
      name.textContent = row.name;
      item.append(icon(row.open ? 'collapse' : 'expand'), icon('folder'), name);
    } else if (row.kind === 'doc') {
      name.textContent = row.label;
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
    rows = drawerRows(docs, foldersOpen(projectPath), sessions, box.value, projectPath);
    highlighted = clampIndex(highlighted, rows.length - 1);
    items = rows.map((row, index) => rowElement(row, index, projectPath));
    const docCount = rows.filter((row) => row.kind === 'doc' || row.kind === 'folder').length;
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

  // What the drawer lists, read again: on opening it both, on Load more and a rename the sessions, on
  // opening a folder the docs, which the manager's page reads a folder at a time.
  function load(withDocs: boolean, withSessions = true): void {
    const page = shownFor;
    if (page === null) return;
    const failed = (error: unknown): void => ports.report(`Could not read the drawer: ${failureText(error)}`);
    if (withDocs) {
      const ticket = ++docLoads;
      ports.bridge.listDocs(page.project.path, [...foldersOpen(page.project.path)]).then((next) => {
        if (ticket !== docLoads) return;
        docs = next;
        draw();
      }, failed);
    }
    if (withSessions) {
      const ticket = ++sessionLoads;
      ports.bridge.listSessions(page.project.path, count).then((next) => {
        if (ticket !== sessionLoads) return;
        sessions = next;
        draw();
      }, failed);
    }
  }

  // In or out of sight; the panes are measured again only when that changes.
  function setShown(shown: boolean): void {
    if (element.hidden !== shown) return;
    element.hidden = !shown;
    ports.resized();
  }

  // The page the drawer lists now, read afresh: on opening it, and when another page comes in front of
  // it open. Only opening takes the keyboard; after a tab switch it stays where the switch put it.
  function show(page: Page): void {
    shownFor = page;
    docs = [];
    sessions = NO_SESSIONS;
    count = SESSION_PAGE_SIZE;
    highlighted = 0;
    box.value = '';
    setShown(true);
    draw();
    load(true);
  }

  function open(page: Page): void {
    isOpen = true;
    button.classList.add('active');
    show(page);
    box.focus();
  }

  // Out of sight and listing nothing, still open or not: a closed drawer, or an open one in front of a
  // project whose folder has gone.
  function conceal(): void {
    shownFor = null;
    docLoads += 1;
    sessionLoads += 1;
    setShown(false);
    docs = [];
    sessions = NO_SESSIONS;
    rows = [];
    items = [];
    list.replaceChildren();
  }

  function hide(): void {
    isOpen = false;
    button.classList.remove('active');
    conceal();
  }

  function close(): void {
    hide();
    ports.closed();
  }

  function toggle(): void {
    if (isOpen) return close();
    const page = ports.page();
    if (page === null) return ports.report('This project\'s folder has gone, so the drawer has nothing to list');
    open(page);
  }

  function act(row: DrawerRow): void {
    const page = shownFor;
    if (page === null) return;
    if (row.kind === 'more') {
      count += SESSION_PAGE_SIZE;
      return load(false);
    }
    if (row.kind === 'folder') return fold(row.path);
    if (row.kind === 'doc') return read(page, row.doc);
    ports.bridge.resumeSession(page.slot, row.session.id).then(
      (reply) => {
        if ('refused' in reply) return ports.report(reply.refused);
        hide();
        ports.resumed(page, reply.index, reply.open);
      },
      (error: unknown) => ports.report(`Could not resume ${row.session.label}: ${failureText(error)}`),
    );
  }

  function fold(folder: string): void {
    if (shownFor === null) return;
    const projectPath = shownFor.project.path;
    const open = toggledFolders(foldersOpen(projectPath), folder);
    openFolders.set(projectPath, open);
    draw();
    if (open.has(folder)) load(true, false);
  }

  // Left and Right in the tree: a folder opened or closed, or the highlight stepped in or out.
  function step(key: 'left' | 'right'): void {
    const { toggle: folder, highlight: next } = treeStep(rows, highlighted, key);
    if (folder === null) return highlight(next);
    highlighted = next;
    fold(folder);
  }

  // The doc, read now so it is shown as it is on the disk, in the viewer over the drawer. Escape there
  // brings the keyboard back to the filter box; Edit puts the drawer away and opens the file in nvim.
  // The manager's page has no nvim, so its viewer has no Edit.
  function read(page: Page, doc: DocEntry): void {
    ports.bridge.readDoc(page.project.path, doc.path).then(
      (reply) => {
        if ('refused' in reply) return ports.report(reply.refused);
        if (shownFor !== page) return;
        const edit = isProjectPage(page) ? () => { close(); ports.openDoc(page, doc.path); } : null;
        docOverlay(doc.name, reply.text, reply.images, edit, (url) => ports.bridge.openExternal(url));
      },
      (error: unknown) => ports.report(`Could not read ${doc.name}: ${failureText(error)}`),
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
    const action = drawerKey(event.key, isModified(event), ports.isToggle(event), row, box.value !== '');
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
      case 'left':
      case 'right': return step(action);
    }
  });

  return {
    button,
    element,
    toggle,
    // Asked on every redraw of the title row: once another page is in front, the open drawer lists it.
    render() {
      const front = ports.page();
      const follow = drawerFollows(isOpen, shownFor, front);
      if (follow === 'show' && front !== null) show(front);
      else if (follow === 'conceal') conceal();
    },
  };
}
