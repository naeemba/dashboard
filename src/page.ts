import { Terminal } from '@xterm/xterm';
import type { ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { createBoardView, type BoardView } from './board-view';
import type { DashboardBridge } from './bridge';
import type { CommandView } from './command-view';
import type { ManagerView } from './manager-view';
import type { Mode } from './modes';
import { createNotesView, type NotesView } from './notes-view';
import type { Pane } from './pane';
import { PANE_SCROLLBACK, paneScreen } from './pane';
import type { Project } from './projects';
import type { SectionStrip } from './section-strip';
import type { Settings } from './settings';
import { quoteForShell } from './shell';
import { EDITOR_INDEX, TERMINAL_COUNT, paneIds, paneLabel, paneName, terminalId } from './terminals';
import { isRinging, looksBusy, marksWaiting, raisesNotification, redrawsForBell } from './waiting';
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
  // Whether the manager's list is the screen in front, which is the one screen a repeat bell has
  // something new to say to. waiting.ts holds why.
  managerInFront(): boolean;
  // A ship leaves a new worktree behind, and the badges are drawn from the list of them.
  worktrees(): readonly WorktreeEntry[];
};

// Every pane in the window by its terminal id, filled as pages are built. The bytes from a pty, an
// exit and a keystroke sent to a pane all arrive naming an id and nothing else, so this is how any of
// them finds the terminal it belongs to.
export const panesById = new Map<string, Pane>();

// Every pane of one slot, let go for good: the verdict its bell has pending, the terminal itself, and
// its place in the map above. What a closed project's panes need, and the map is why it lives here —
// a second place deleting from it is a second place that could leave a pane in it. The timer matters
// as much as the terminal: a bell rung a moment before the close still has a second to wait, and it
// would wake to read a screen nobody can see and raise a banner naming a project that is gone.
export function discardPanes(slot: number): void {
  for (const id of paneIds(slot)) {
    const pane = panesById.get(id);
    // A project whose folder had gone was drawn as a page with no panes at all, so there is nothing
    // under any of its ids.
    if (pane === undefined) continue;
    window.clearTimeout(pane.bellTimer);
    pane.terminal.dispose();
    panesById.delete(id);
  }
}

// How long a bell waits before it is believed. Long enough that an agent handed more work has drawn
// its spinner again, short enough that a real question is on the tab strip before you look up.
const BELL_SETTLE_MS = 1000;

export type Page = {
  project: Project;
  element: HTMLElement;
  // Only the views this page actually has. A project has three; the manager has one; a dead project
  // has none, and that is what stops the mode keys switching it to a view that was never built.
  views: Partial<Record<Mode, HTMLElement>>;
  mode: Mode;
  panes: Pane[];
  focused: number;
  slot: number;
  editor: Pane | null;
  editorStarted: boolean;
  board: BoardView | null;
  // A project's page of notes. Null on the manager page and on a dead project, for the same reason
  // their boards are: there is no folder to keep a notes.md in.
  notes: NotesView | null;
  // Only the manager page has one, the way only a project page has a board.
  manager: ManagerView | null;
  // Only the manager page has these two either — the strip above the sections and the screen one of
  // them shows.
  command: CommandView | null;
  strip: SectionStrip | null;
};

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

// Measures the grid's five panes again. xterm only tells a pty a new size when it is measured, so a
// pane that changed shape keeps drawing at the old size until this runs.
export function fitPanes(page: Page): void {
  for (const pane of page.panes) pane.fit.fit();
}

// Builds the page for one project: its four views, its five shells and its editor — or, for a project
// whose folder has gone, a page saying so and nothing else. A factory, so the handful of things a pane
// needs from the renderer are handed over once rather than on every call.
export function createPageBuilder(options: PageOptions): (project: Project, slot: number) => Page {
  function buildPane(view: HTMLElement, id: string, page: Page, index: number, onFocus?: () => void): Pane {
    const container = document.createElement('div');
    container.className = 'pane';
    view.append(container);

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
    terminal.loadAddon(fit);
    // A URL in the output underlines under the pointer and opens in the real browser when clicked; main
    // decides what is safe to hand the operating system.
    terminal.loadAddon(new WebLinksAddon((_event, uri) => options.bridge.openExternal(uri)));
    terminal.open(container);

    const pane: Pane = { terminal, fit, exited: false, bell: 'quiet', lastPrintedAt: 0 };
    terminal.onData((data) => {
      if (!pane.exited) {
        options.bridge.sendInput(id, data);
        return;
      }
      if (data === '\r') {
        pane.exited = false;
        terminal.reset();
        options.bridge.restart(id);
        options.bridge.resize(id, terminal.cols, terminal.rows);
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
        if (!isRinging(pane.bell)) pane.bell = 'waiting';
        if (redraws) options.onChanged();
        // Read again rather than reused from above: the banner is only worth raising if the window is
        // still behind something else now, which is when it would actually appear.
        if (raisesNotification(document.hasFocus(), pane.bell)) {
          pane.bell = 'notified';
          options.bridge.notify(page.project.name, `${paneLabel(index, undefined, paneName(pane))} is waiting`, id);
        }
      }, BELL_SETTLE_MS);
    });
    // Arriving at the pane is the answer to whatever it was asking, so the mark comes off here rather
    // than in the focus handlers: this fires for every way in, including landing back on the pane the
    // page already called focused, which the caller's onFocus deliberately ignores.
    // onFocus first: it is what sets page.focused, and the redraw writes the session file, so redrawing
    // before it would save a session naming the pane you just left.
    terminal.textarea?.addEventListener('focus', () => {
      const wasRinging = isRinging(pane.bell);
      pane.bell = 'quiet';
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
      if (view.classList.contains('zoom')) fitPanes(page);
    });
    return pane;
  }

  function buildPage(project: Project, slot: number): Page {
    const element = document.createElement('section');
    element.className = 'page';
    const views: Record<'terminals' | 'nvim' | 'board' | 'notes', HTMLElement> = {
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
      project, element, views, mode: 'terminals', panes: [], focused: 0, slot, editor: null,
      editorStarted: false, board: null, notes: null, manager: null, command: null, strip: null,
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
    for (let terminalIndex = 0; terminalIndex < TERMINAL_COUNT; terminalIndex++) {
      const id = terminalId(slot, terminalIndex);
      const pane = buildPane(views.terminals, id, page, terminalIndex, () => {
        if (page.focused === terminalIndex) return;
        page.focused = terminalIndex;
        options.onChanged();
      });
      page.panes.push(pane);
      panesById.set(id, pane);
    }
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
      worktrees: options.worktrees,
    });
    views.board.append(page.board.element);
    page.notes = createNotesView({
      projectPath: project.path,
      read: (projectPath) => options.bridge.readNotes(projectPath),
      write: (projectPath, text) => options.bridge.writeNotes(projectPath, text),
      // A slot each, like the board's, so one project's notes never clear another one's failure.
      onError: (message) => options.onError(`notes:${slot}`, message),
    });
    views.notes.append(page.notes.element);
    return page;
  }

  return buildPage;
}
