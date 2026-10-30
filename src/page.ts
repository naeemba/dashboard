import { Terminal } from '@xterm/xterm';
import type { ILink, ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { createBoardView, type BoardView } from './board-view';
import type { DashboardBridge } from './bridge';
import { createChatView, type ChatView } from './chat-view';
import type { CommandView } from './command-view';
import type { LogView } from './log-view';
import { fileLinksIn, webLinksIn, type FileLink, type LinkSpan } from './file-links';
import type { ManagerView } from './manager-view';
import type { Mode, ProjectMode } from './modes';
import { createNotesView, type NotesView } from './notes-view';
import type { Pane } from './pane';
import { PANE_SCROLLBACK, paneScreen } from './pane';
import { erasedLine, printWidths } from './print-widths';
import { linksTouching } from './wrapped-links';
import type { Project } from './projects';
import type { SectionStrip } from './section-strip';
import type { Settings } from './settings';
import { quoteForShell } from './shell';
import { EDITOR_INDEX, MAIN_INDEX, isWorker, paneFromId, paneLabel, paneName, terminalId } from './terminals';
import { icon, type IconName } from './icons';
import type { WorkerState } from './session-cli';
import { isRinging, looksBusy, markRings, marksWaiting, raisesNotification, redrawsForBell } from './waiting';
import type { WorktreeEntry } from './worktree-store';

// A page and the panes on it: what one is, how one is built, and how its panes are measured. Split out
// of renderer.ts when that file reached its 600-line ceiling, along the seam the file itself named.
// What is left there is the plumbing — which page is in front, what the status bar says, what the
// session file holds — and none of it builds a terminal.
//
// Everything this needs from the renderer arrives as `PageOptions`, the bridge included — nothing here
// reaches for the window. Every one that can change while the app runs is a function rather than a
// value: the settings and the shell do, and a page built an hour ago must draw the current ones rather
// than a copy taken when it was built.

export type PageOptions = {
  // Handed over like everything else here rather than read off the window, so a pane's bell can be
  // tested against a fake one.
  bridge: DashboardBridge;
  settings(): Settings;
  // What a dropped path is quoted for; main decides which family of shell is in force.
  shellCommand(): string;
  // Redraws the status bar and, when it is in front, the manager's list.
  onChanged(): void;
  // The status bar's error span, which only the owner that wrote a message may clear.
  onError(owner: string, message: string): void;
  // The same span for what is not a failure, which the log leaves out. status-error.ts says why.
  onNotice(owner: string, message: string): void;
  // Whether the manager's list is the screen in front, which is the one screen a repeat bell has
  // something new to say to. waiting.ts holds why.
  managerInFront(): boolean;
  // A ship leaves a new worktree behind, and the badges are drawn from the list of them.
  worktrees(): readonly WorktreeEntry[];
  // A file path clicked in one of the page's panes, which the renderer opens in the page's nvim.
  openFile(page: Page, index: number, link: FileLink): void;
  // The button above the worker list, which does what the new-pane key does.
  addPane(page: Page): void;
  // A worker's close button, which does what the close key does.
  closePane(page: Page, index: number): void;
};

// Every pane in the window by its terminal id, filled as pages are built. The bytes from a pty, an
// exit and a keystroke sent to a pane all arrive naming an id and nothing else, so this is how any of
// them finds the terminal it belongs to.
export const panesById = new Map<string, Pane>();
// The same for the Claude screens, by slot: a chat event names the page's slot and nothing else.
const chatsBySlot = new Map<number, ChatView>();
// What each pane does when its worker's hooks report, by terminal id, the way a pty's bytes find it.
const markersById = new Map<string, (state: WorkerState) => void>();

// One pane let go of for good: the verdict its bell has pending, the terminal itself, and its place in
// the maps above. The timer matters as much as the terminal: a bell rung a moment before the close still
// has a second to wait, and it would wake to read a screen nobody can see and raise a banner naming a
// pane that is gone.
function discardPane(id: string, pane: Pane): void {
  window.clearTimeout(pane.bellTimer);
  pane.terminal.dispose();
  pane.element.remove();
  panesById.delete(id);
  markersById.delete(id);
}

// Every pane of one slot, let go for good. What a closed project's panes need, and the maps are why it
// lives here — a second place deleting from them is a second place that could leave a pane in one. A
// project whose folder had gone was drawn as a page with no panes at all, so nothing is under its slot.
export function discardPanes(slot: number): void {
  chatsBySlot.delete(slot);
  for (const [id, pane] of [...panesById]) if (paneFromId(id).slot === slot) discardPane(id, pane);
}

// How long a bell waits before it is believed. Long enough that an agent handed more work has drawn
// its spinner again, short enough that a real question is on the tab strip before you look up.
const BELL_SETTLE_MS = 1000;

export type Page = {
  project: Project;
  element: HTMLElement;
  // Only the views this page actually has. A project has four and so does the manager, though not the
  // same four; a dead project has none, and that is what stops the mode keys switching it to a view
  // that was never built.
  views: Partial<Record<Mode, HTMLElement>>;
  mode: Mode;
  // The open workers in the order they are drawn, by number. Main is the Claude screen, `chat`, not one
  // of these. `focused` is the number of the one with the keyboard, MAIN_INDEX for main, never a place
  // in this list.
  panes: Pane[];
  focused: number;
  // The scrolling list on the right that the workers are drawn in. Null on a page with no terminals.
  workers: HTMLElement | null;
  slot: number;
  editor: Pane | null;
  editorStarted: boolean;
  board: BoardView | null;
  // The page's notes. Null only on a dead project, for the same reason its board is: there is no
  // folder to keep a notes.md in. The manager has one — its file sits in the home directory instead.
  notes: NotesView | null;
  // Only the manager page has one, the way only a project page has a board.
  manager: ManagerView | null;
  // Only the manager page has these two either — the strip above the sections and the screen one of
  // them shows.
  command: CommandView | null;
  strip: SectionStrip | null;
  // Only the manager has one: it is the app's log, not a project's.
  log: LogView | null;
  // The Claude screen. Null where the board is: the manager and a dead project have no folder to run
  // a session in.
  chat: ChatView | null;
};

// The pane with the keyboard, or the one that last had it. Undefined on a page with no terminals, and
// while main has it: main is the Claude screen, not a pane.
export function focusedPane(page: Page): Pane | undefined {
  return page.panes.find((pane) => pane.index === page.focused);
}

// Whether main, the Claude screen, is where the terminals view's keyboard is.
export function mainHasKeyboard(page: Page): boolean {
  return page.focused === MAIN_INDEX && page.chat !== null;
}

// A worker folded to its name, or opened again. The workers left open share the room, so every pane
// is measured again. A folded pane takes no keyboard: if it had it, by key or by its button, the
// keyboard goes to main.
export function toggleFold(page: Page, index: number): void {
  const pane = page.panes.find((each) => each.index === index);
  if (!pane || !isWorker(index)) return;
  pane.folded = !pane.folded;
  pane.element.classList.toggle('folded', pane.folded);
  pane.element.dataset.label = paneLabel(index, undefined, paneName(pane));
  fitPanes(page);
  if (pane.folded && pane.element.contains(document.activeElement)) {
    page.focused = MAIN_INDEX;
    focusTerminals(page);
  }
}

// The keyboard back on whichever of main and the workers last had it.
export function focusTerminals(page: Page): void {
  if (mainHasKeyboard(page)) page.chat?.focus();
  else focusedPane(page)?.terminal.focus();
}

// The numbers of the terminals view's places in drawn order, main first, which is what pane-layout.ts
// moves the keyboard by.
export function openIndices(page: Page): number[] {
  return [...(page.chat ? [MAIN_INDEX] : []), ...page.panes.map((pane) => pane.index)];
}

// The names typed on the terminals, by pane number, which is what session.ts keeps: `null` for a pane
// nobody named and for a number no pane holds.
export function typedNames(page: Page): (string | null)[] {
  return Array.from({ length: Math.max(-1, ...openIndices(page)) + 1 }, (_value, index) => (
    page.panes.find((pane) => pane.index === index)?.typedName ?? null
  ));
}

// Switching mode is per page, so each project keeps the view you left it on. A dead project has no
// views to switch between and ignores the keys.
// The mode and which view is on screen are one fact, so they only ever move together. Restoring a page
// sets them without arriving at it, and a page is built that way too, which is why this is not simply
// the top of the renderer's setMode.
export function showMode(page: Page, mode: Mode): void {
  page.mode = mode;
  for (const [name, view] of Object.entries(page.views)) if (view) view.hidden = name !== mode;
  page.strip?.render(mode);
}

function fontFamily(settings: Settings): string {
  return `"${settings.font.name}", Menlo, Monaco, monospace`;
}

// Every pane's own palette, font and size, written again after a settings change. The chrome's colours
// are the renderer's half of the same save — both have to move together or the board sits on one
// background while the shell beside it sits on another. Here because this is where the panes are, and
// a second map of them somewhere else is one that could come to hold a pane this one has let go of.
export function restylePanes(settings: Settings): void {
  for (const pane of panesById.values()) {
    // A plain record of hex strings on the way in; xterm names the colours it knows. parseSettings
    // has already dropped anything that is not one of them, so the shapes agree.
    pane.terminal.options.theme = settings.theme as ITheme;
    pane.terminal.options.fontFamily = fontFamily(settings);
    pane.terminal.options.fontSize = settings.font.size;
  }
}

// Measures the page's terminals again. xterm only tells a pty a new size when it is measured, so a
// pane that changed shape keeps drawing at the old size until this runs.
// A folded worker is left at its last size: measured in its 26px bar it would tell its shell, and
// whatever full-screen program runs there, it has one row.
export function fitPanes(page: Page): void {
  for (const pane of page.panes) if (!pane.folded) pane.fit.fit();
}

// Every pty of one page: its terminals and the editor. What a page needs the moment it reaches the
// screen, because until it is measured no pane has told main how big it is, and main spawns the page's
// shells at whatever it was last told. Separate from fitPanes because the zoom key wants only the
// terminals — the editor is on a view of its own and never carries the zoom class.
export function fitPage(page: Page): void {
  fitPanes(page);
  page.editor?.fit.fit();
}

// Zooming is one class on the view; which pane it lands on is the CSS's to answer from what has the
// keyboard. Nothing is remembered across a restart — the panes come back as the grid they are.
// The fit is unconditional here, unlike the one in `buildPane`'s focus handler: on the way out of
// zoom the class is already gone, and the pane that shrank still has to be told.
export function toggleZoom(page: Page): void {
  // The CSS grows whichever pane holds the keyboard, so the key has to make sure one does. A click on
  // the status bar or on a pane's border leaves the keyboard on the body, and the class would then have
  // nothing to grow and the key would look broken. The class moves first so that the fit the focus
  // handler runs is already measuring the size the pane is going to keep. The other half is left alone
  // on purpose: such a click still drops the zoom off the screen until you press something, because the
  // zoomed pane is read from focus rather than remembered.
  page.views.terminals?.classList.toggle('zoom');
  focusTerminals(page);
  fitPanes(page);
}

// What the builder hands back: a page for a project, and the step that makes a page's terminals the
// ones main says it has open.
export type PageBuilder = {
  build(project: Project, slot: number, open: readonly number[]): Page;
  syncPanes(page: Page, open: readonly number[]): void;
};

// Builds the page for one project: its views, its terminals and its editor — or, for a project whose
// folder has gone, a page saying so and nothing else. A factory, so the handful of things a pane needs
// from the renderer are handed over once rather than on every call.
export function createPageBuilder(options: PageOptions): PageBuilder {
  options.bridge.onChat((slot, event) => chatsBySlot.get(slot)?.receive(event));
  options.bridge.onPaneMark((id, state) => markersById.get(id)?.(state));
  // `parent` is where the box goes: the nvim view for the editor, the worker list for a worker.
  function buildPane(parent: HTMLElement, id: string, page: Page, index: number, onFocus?: () => void): Pane {
    const container = document.createElement('div');
    container.className = 'pane';
    parent.append(container);
    // A worker's two buttons in its top right corner, the twins of the fold and close keys.
    if (isWorker(index)) {
      const controls = document.createElement('div');
      controls.className = 'pane-controls';
      const button = (glyph: IconName, title: string, act: () => void) => {
        const made = document.createElement('button');
        made.type = 'button';
        made.title = title;
        made.append(icon(glyph));
        made.addEventListener('mousedown', (event) => event.preventDefault());
        made.addEventListener('click', (event) => {
          event.stopPropagation();
          act();
        });
        return made;
      };
      controls.append(
        button('collapse', 'Fold', () => toggleFold(page, index)),
        button('reset', 'Close', () => options.closePane(page, index)),
      );
      container.append(controls);
      // A folded worker opens again on a click anywhere on its bar.
      container.addEventListener('click', () => {
        if (container.classList.contains('folded')) toggleFold(page, index);
      });
    }

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: options.settings().font.size,
      fontFamily: fontFamily(options.settings()),
      theme: options.settings().theme as ITheme,
      drawBoldTextInBrightColors: false,
      scrollback: PANE_SCROLLBACK,
      // Option+key sends Esc+key, the way every terminal on macOS does. Without it xterm hands the pane
      // the composed character instead — Option+L arrives as "Â¬", and nvim's <A-l> never fires. The
      // cost is that Option no longer types accented characters into a pane.
      macOptionIsMeta: true,
    });
    const fit = new FitAddon();
    const cursorLine = () => terminal.buffer.active.baseY + terminal.buffer.active.cursorY;
    const widths = printWidths({
      cols: () => terminal.cols,
      cursorLine,
      mark: (line) => terminal.registerMarker(line - cursorLine()),
      isNormalBuffer: () => terminal.buffer.active.type === 'normal',
    });
    terminal.onResize(() => widths.resized());
    terminal.buffer.onBufferChange(() => widths.resized());
    // A program redrawing a live frame erases its rows before writing them again. The handlers run before
    // xterm's own erase, with the cursor on the row being erased, and return false so xterm still erases.
    const erasing = (final: 'K' | 'J') => (params: ReadonlyArray<number | number[]>) => {
      widths.rowErased(erasedLine(final, Number(params[0] ?? 0), terminal.buffer.active.baseY, cursorLine()));
      return false;
    };
    terminal.parser.registerCsiHandler({ final: 'K' }, erasing('K'));
    terminal.parser.registerCsiHandler({ final: 'J' }, erasing('J'));
    terminal.loadAddon(fit);
    // A link underlines under the pointer: a URL opens in the real browser, where main decides what is
    // safe to hand the operating system, and a file path in this project's nvim. file-links.ts decides
    // what reads as either, wrapped-links.ts which rows one spans. xterm counts columns and rows from 1,
    // and the end column is the last cell.
    const linksOn = <T extends LinkSpan>(row: number, find: (text: string) => T[], open: (link: T, text: string) => void): ILink[] => (
      // nvim lays out its own rows, so only a row the terminal wrapped carries on there.
      linksTouching(terminal.buffer.active, row - 1, index === EDITOR_INDEX ? () => Infinity : widths.at, find).map((placed) => ({
        range: {
          start: { x: placed.start.column + 1, y: placed.start.row + 1 },
          end: { x: placed.end.column, y: placed.end.row + 1 },
        },
        text: placed.text,
        activate: () => open(placed.link, placed.text),
      }))
    );
    // File paths in the shells only: a click in nvim is nvim's, and a link there would swap the buffer
    // you were editing.
    terminal.registerLinkProvider({
      provideLinks: (row, callback) => callback([
        ...linksOn(row, webLinksIn, (_link, url) => options.bridge.openExternal(url)),
        ...(index === EDITOR_INDEX ? [] : linksOn(row, fileLinksIn, (link) => options.openFile(page, index, link))),
      ]),
    });
    terminal.open(container);

    const pane: Pane = {
      index, element: container, terminal, fit, exited: false, bell: 'quiet', lastPrintedAt: 0, printWidths: widths,
    };
    terminal.onData((data) => {
      if (!pane.exited) {
        options.bridge.sendInput(id, data);
        return;
      }
      if (data === '\r') {
        pane.exited = false;
        terminal.reset();
        widths.reset();
        options.bridge.restart(id);
      }
    });
    // Dropping files types their absolute paths at the prompt, quoted, the way a terminal is expected to
    // take them. It goes through terminal.input so a dead pane ignores the drop like any other keystroke.
    // The trailing space is what every terminal appends, so a second drop starts a new word instead of
    // gluing itself onto the first path.
    container.addEventListener('drop', (event) => {
      const paths = [...event.dataTransfer?.files ?? []].map((file) => options.bridge.getPathForFile(file));
      if (paths.length === 0) return;
      terminal.focus();
      terminal.input(`${paths.map((entry) => quoteForShell(entry, options.shellCommand())).join(' ')} `);
    });
    terminal.onResize(({ cols, rows }) => options.bridge.resize(id, cols, rows));
    // The other thing a program in a pane can say about itself, and as cheap to listen for as the bell:
    // the title escape sequence, which every shell writes on every prompt and which an agent can be told
    // to set to whatever it is working on. It is only a hint — paneName is where it loses to a name you
    // typed — so this stores it and nothing more.
    //
    // Redrawn only when the label actually moves. A shell sets the title twice per command, at the
    // prompt and again when the command starts, and most of those say what it already said; without this
    // the status bar and the manager's list rebuild on every keystroke that ends in Enter.
    terminal.onTitleChange((title) => {
      const before = paneName(pane);
      pane.title = title;
      if (paneName(pane) !== before) options.onChanged();
    });
    // The bell is the only thing a program in a pane can ring to say it wants you, and it costs nothing
    // to listen for: no reading the output, no guessing from how long it has been quiet.
    // The pane you are looking at is the one whose keystrokes go to xterm's hidden textarea, so asking
    // the document who has focus answers both "is this page in front" and "is this the focused pane" at
    // once, and answers it right on the board, where no pane has the keyboard at all. What the states of
    // the bell mean is waiting.ts's job; this only reads them and draws the answer.
    // Where you are is asked at both ends of the wait, because you can move either way inside it: leave
    // the pane in the second that follows, or arrive at it.
    // What the bell meant is the part that has to wait — a moment later the screen says whether the
    // agent asked you something or went back to work.
    terminal.onBell(() => {
      if (!marksWaiting(document.hasFocus(), terminal.textarea === document.activeElement)) return;
      // One verdict per wait, not one per ring. An agent can ring every second, and without this each
      // ring leaves its own timer behind to read the whole screen again for the same answer.
      if (pane.bellTimer !== undefined) return;
      pane.bellTimer = window.setTimeout(() => {
        pane.bellTimer = undefined;
        // What counts as still working is waiting.ts's to answer; this hands it the screen.
        if (looksBusy(paneScreen(terminal))) return;
        // Asked again rather than reused from when the bell rang, the way the banner below is: you may
        // have arrived at the pane inside the wait, and where you are now is what waiting.ts is being
        // asked about.
        if (!marksWaiting(document.hasFocus(), terminal.textarea === document.activeElement)) return;
        // Whether a repeat bell is worth a redraw is waiting.ts's to answer; this reads which page is in
        // front and draws what it says.
        const redraws = redrawsForBell(pane.bell, options.managerInFront());
        ring('is waiting');
        if (redraws) options.onChanged();
      }, BELL_SETTLE_MS);
    });
    // The pane marked as asking, and its banner if one is due. The bell and a worker's permission prompt
    // both come here, so the two banners name the pane the same way. The focus is read again rather
    // than reused: the banner is only worth raising if the window is still behind something else now,
    // which is when it would actually appear.
    function ring(saying: string): void {
      if (!isRinging(pane.bell)) pane.bell = 'waiting';
      if (!raisesNotification(document.hasFocus(), pane.bell)) return;
      pane.bell = 'notified';
      options.bridge.notify(page.project.name, `${paneLabel(index, undefined, paneName(pane))} ${saying}`, id);
    }
    // Arriving at the pane is the answer to whatever it was asking, so the mark comes off here rather
    // than in the focus handlers: this fires for every way in, including landing back on the pane the
    // page already called focused, which the caller's onFocus deliberately ignores.
    // onFocus first: it is what sets page.focused, and the redraw writes the session file, so redrawing
    // before it would save a session naming the pane you just left.
    terminal.textarea?.addEventListener('focus', () => {
      // Arriving at a folded worker opens it: the keyboard never types into a pane you cannot see.
      if (pane.folded) toggleFold(page, index);
      const wasRinging = isRinging(pane.bell);
      pane.bell = 'quiet';
      delete container.dataset.mark;
      // A worker down a scrolled list is brought into sight; the list only scrolls as far as it must.
      container.scrollIntoView({ block: 'nearest' });
      onFocus?.();
      if (wasRinging) options.onChanged();
      // While the panes are zoomed the keyboard moving is the zoom moving: the pane arrived at has grown to
      // the whole grid and the one left behind is back in its cell. xterm only tells the pty a new size
      // when it is measured, so both have to be fit or the shell you just zoomed keeps drawing at the size
      // of a sixth of the window. Here rather than in focusTerminal because this fires for every way in —
      // a click on a pane never goes through focusTerminal at all, and neither does coming back from the
      // board, which lands on the pane the page already called focused. The pane's own view is what is
      // asked, so focusing the editor — built by this same function with the same page — does not refit
      // the grid behind it: the nvim view never carries the class.
      if (container.closest('.view')?.classList.contains('zoom')) fitPanes(page);
    });
    // A worker's hooks. Blocked is a question waiting on you, so it rings the way a bell that turned
    // out to be a question does; done is drawn on the box and nothing more — main is the one it is
    // for. The pane you are looking at is not marked, for the reason marksWaiting gives. Running is the
    // worker back at work, which takes either mark off wherever you are looking.
    markersById.set(id, (state) => {
      if (state === 'running') delete container.dataset.mark;
      else if (marksWaiting(document.hasFocus(), terminal.textarea === document.activeElement)) container.dataset.mark = state;
      else return;
      if (markRings(state)) ring('is waiting on a permission');
      options.onChanged();
    });
    return pane;
  }

  // The keyboard landing on main or a worker: the page remembers where, and the status bar follows.
  function arrived(page: Page, index: number): void {
    if (page.focused === index) return;
    page.focused = index;
    options.onChanged();
  }

  // One worker onto the page, in the list in number order. Main is the Claude screen, built with the page.
  function addPane(page: Page, index: number): void {
    if (!page.workers) return;
    const id = terminalId(page.slot, index);
    const pane = buildPane(page.workers, id, page, index, () => arrived(page, index));
    // buildPane appended it last; a worker numbered below one already open goes ahead of it.
    page.panes.find((other) => other.index > index)?.element.before(pane.element);
    page.panes.push(pane);
    page.panes.sort((first, second) => first.index - second.index);
    panesById.set(id, pane);
  }

  // The page's terminals made to match main's list: a worker main opened is built, one it closed goes.
  // Closing the pane that had the keyboard hands it to main, since there is nowhere else it is sure to
  // be; the page with the keyboard is in front, so the move is one you can see.
  function syncPanes(page: Page, open: readonly number[]): void {
    const have = page.panes.map((pane) => pane.index);
    if (have.length === open.length && open.every((index) => have.includes(index))) return;
    let lostFocus = false;
    for (const pane of [...page.panes]) {
      if (open.includes(pane.index)) continue;
      lostFocus ||= pane.element.contains(document.activeElement);
      page.panes.splice(page.panes.indexOf(pane), 1);
      discardPane(terminalId(page.slot, pane.index), pane);
    }
    for (const index of open) if (!page.panes.some((pane) => pane.index === index)) addPane(page, index);
    if (!page.panes.some((pane) => pane.index === page.focused)) page.focused = MAIN_INDEX;
    if (lostFocus) focusTerminals(page);
    fitPanes(page);
  }

  function buildPage(project: Project, slot: number, open: readonly number[]): Page {
    const element = document.createElement('section');
    element.className = 'page';
    const views: Record<ProjectMode, HTMLElement> = {
      terminals: document.createElement('div'),
      nvim: document.createElement('div'),
      board: document.createElement('div'),
      notes: document.createElement('div'),
    };
    for (const [mode, view] of Object.entries(views)) {
      view.className = `view view-${mode}`;
      view.hidden = mode !== 'terminals';
    }
    const page: Page = {
      project, element, views, mode: 'terminals', panes: [], focused: MAIN_INDEX, workers: null, slot, editor: null,
      editorStarted: false, board: null, notes: null, manager: null, command: null, strip: null, log: null, chat: null,
    };
    // Deliberate insurance against one race: the picker only offers folders that exist, so the sole way here
    // is deleting the folder between the dialog closing and the existence check. Then you get this page
    // instead of a blank one with no shells.
    if (project.missing) {
      element.classList.add('missing');
      element.textContent = `Directory not found: ${project.path}`;
      // A dead project has no views: there is nothing to run nvim in and nowhere to keep a board or
      // a page of notes.
      page.views = {};
      return page;
    }
    element.append(...Object.values(views));
    // Main on the left, full height; down the right, the button that opens another worker and under it
    // the workers in a list that scrolls once there are more than fit. The button sits outside the list,
    // so scrolling never takes it off the screen.
    const column = document.createElement('div');
    column.className = 'worker-column';
    const add = document.createElement('button');
    add.className = 'add-pane';
    add.textContent = '+ New pane';
    add.addEventListener('click', () => options.addPane(page));
    page.workers = document.createElement('div');
    page.workers.className = 'workers';
    column.append(add, page.workers);
    views.terminals.append(column);
    for (const index of open) addPane(page, index);
    const editorId = terminalId(slot, EDITOR_INDEX);
    page.editor = buildPane(views.nvim, editorId, page, EDITOR_INDEX);
    panesById.set(editorId, page.editor);
    page.board = createBoardView({
      projectPath: project.path,
      slot,
      bridge: options.bridge,
      onChanged: options.onChanged,
      // A slot each, so one project's board never clears another one's failure.
      onError: (message) => options.onError(`board:${slot}`, message),
      onNotice: (message) => options.onNotice(`board:${slot}`, message),
      worktrees: options.worktrees,
    });
    views.board.append(page.board.element);
    page.notes = createNotesView({
      bridge: options.bridge,
      projectPath: project.path,
      placeholder: 'Notes for this project. Saved to .dashboard/notes.md as you type.',
      // A slot each, like the board's, so one project's notes never clear another one's failure.
      onError: (message) => options.onError(`notes:${slot}`, message),
    });
    views.notes.append(page.notes.element);
    // Main, the project's Claude session, in the terminals view's left column. Its history is read
    // now, so it is there the first time you look.
    const chat = createChatView({
      bridge: options.bridge,
      slot,
      projectName: project.name,
      paneId: terminalId(slot, MAIN_INDEX),
      onError: (message) => options.onError(`chat:${slot}`, message),
      onNotice: (message) => options.onNotice(`chat:${slot}`, message),
      onWaiting: options.onChanged,
    });
    page.chat = chat;
    const main = document.createElement('div');
    main.className = 'main-chat';
    main.append(chat.element);
    main.addEventListener('focusin', () => arrived(page, MAIN_INDEX));
    views.terminals.prepend(main);
    chatsBySlot.set(slot, chat);
    chat.open();
    return page;
  }

  return { build: buildPage, syncPanes };
}
