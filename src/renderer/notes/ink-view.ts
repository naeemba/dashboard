import type { DashboardBridge } from '../../shared/app/bridge';
import type { InkCommand } from '../../shared/keys/actions';
import { failureText } from '../../shared/errors/failure';
import { strokeHit, strokeOutline, type InkPoint, type Stroke } from './ink-geometry';
import { addStroke, clearAll, eraseStrokes, startHistory, undo, type InkHistory } from './ink-history';
import { INK_COLORS, INK_WIDTHS, parseInk, serializeInk } from './ink-svg';
import {
  isStranded,
  mayRead,
  mayWrite,
  readFailed,
  readLanded,
  strandedMessage,
  UNREAD_NOTES,
  writeLanded,
  type NotesState,
} from './notes-state';

export type InkOptions = {
  bridge: DashboardBridge;
  projectPath: string;
  // The status bar's error span, with the same meaning as the text box's: a write or a read that lands
  // clears whatever it replaces.
  onError(message: string): void;
};

export type InkView = {
  element: HTMLElement;
  // Arriving: the strokes not yet written go to disk first, then the file is read back, on the same
  // terms as the text box's open(). Never rejects — a failure reports itself through onError.
  open(): Promise<void>;
  // Another screen wrote this page. Read again the way open() does, but only when the page is this
  // view's own, and without taking the keyboard.
  reload(projectPath: string): Promise<void>;
  // One of the handwriting page's own keys, which the window's one lookup has already decided.
  command(command: InkCommand): void;
};

// The same wait as the text box, for the same reason: a write per stroke would be fine, but one per
// stroke of a quick sketch, each carrying the whole page, is not.
const SAVE_DELAY_MS = 400;

// How far the eraser reaches, in pixels, beyond the ink itself. A fingertip-sized target: the eraser is
// dragged across strokes, not placed on a hairline.
const ERASER_RADIUS = 8;

// A pen reports a pressure; a mouse and a finger report nothing useful, and one half is what
// pressureFactor turns into exactly the chosen width.
const FLAT_PRESSURE = 0.5;

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

type Tool = 'pen' | 'eraser';

// The state of one drag, which is either a stroke being drawn or an eraser being dragged. Held in one
// place so a second finger or a stray pointer is ignored by asking one question.
type Drag =
  | { kind: 'draw'; pointerId: number; stroke: Stroke; path: SVGPathElement }
  // `base` is the history as the drag began and `hit` the indices into its strokes the eraser has
  // crossed: the drag is applied once, when it ends, so it is one undo step however long it was.
  | { kind: 'erase'; pointerId: number; base: InkHistory; hit: Set<number> };

// The screen's second page: the same notes written by hand. A scrolling surface under a one-line strip,
// holding one live SVG that is the page. Everything around the drawing has a key (notes-decision-3) —
// the tool, the colour, the width, undo, clear and the way back to the text — so the strip is a
// display and nothing on it is clicked.
//
// What is saved is `serializeInk` of the strokes, and the safety rules are the text box's own, over that
// string: notes-state.ts is text-agnostic, so a file that was never read is never written over, a stroke
// a write did not take is not read over, and a file this page cannot read — one edited by hand — is a
// failed read, so the first stroke after it cannot replace it with a page of its own.
export function createInkView(options: InkOptions): InkView {
  const element = document.createElement('div');
  element.className = 'ink-view';
  // Focusable so the page can hold the keyboard while its keys are heard, but not a Tab stop: nothing
  // here takes Tab, and the manager's section names above it would otherwise be one Tab away.
  element.tabIndex = -1;

  const strip = document.createElement('div');
  strip.className = 'ink-strip';
  const toolLabel = document.createElement('span');
  const swatch = document.createElement('span');
  swatch.className = 'ink-swatch';
  const widthLabel = document.createElement('span');
  // The keys as shipped. They can be rebound in the settings screen, and the help dialog always lists
  // the current ones; this is a reminder, not the table.
  const hints = document.createElement('span');
  hints.className = 'ink-hints';
  hints.textContent = 'P pen · E eraser · C colour · W width · Z undo · Shift+X clear';
  strip.append(toolLabel, swatch, widthLabel, hints);

  const surface = document.createElement('div');
  surface.className = 'ink-surface';
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  svg.setAttribute('class', 'ink-canvas');
  surface.append(svg);
  element.append(strip, surface);

  let history: InkHistory = startHistory();
  // One path per stroke of history.strokes, in the same order, so an erase can take a path off the
  // screen by the index it hit.
  let paths: SVGPathElement[] = [];
  let tool: Tool = 'pen';
  let colorIndex = 0;
  let widthIndex = 1;
  let drag: Drag | undefined;

  let pending: number | undefined;
  let state: NotesState = UNREAD_NOTES;
  let latestRead = 0;

  function showStrip(): void {
    toolLabel.textContent = tool === 'pen' ? 'Pen' : 'Eraser';
    swatch.style.background = INK_COLORS[colorIndex];
    widthLabel.textContent = `${INK_WIDTHS[widthIndex]}px`;
    element.dataset.tool = tool;
  }

  // Always a screen of room below the lowest stroke, so there is somewhere to write next, and never less
  // than the screen itself so the surface is not a short strip at the top of a tall window.
  function layout(): void {
    const viewport = surface.clientHeight;
    // A loop rather than Math.max(...points): a long page holds tens of thousands of points, and that
    // many arguments overflow the call stack.
    let lowest = 0;
    for (const stroke of history.strokes) for (const point of stroke.points) lowest = Math.max(lowest, point.y);
    svg.style.height = `${Math.max(viewport, lowest + viewport)}px`;
  }

  function makePath(stroke: Stroke): SVGPathElement {
    const path = document.createElementNS(SVG_NAMESPACE, 'path');
    path.setAttribute('fill', stroke.color);
    path.setAttribute('d', strokeOutline(stroke.points, stroke.width));
    return path;
  }

  // The whole page again, for the changes that are not a stroke being drawn: a read, an undo, a clear, an
  // erase. A stroke being drawn updates its own path instead, which is what keeps drawing cheap.
  function render(): void {
    paths = history.strokes.map(makePath);
    svg.replaceChildren(...paths);
    layout();
  }

  // Asked here and not only where the timer is set, for the text box's reason: a read can fail while the
  // wait is running, and the page it shuts is the page this write would send.
  function write(): Promise<void> {
    if (!mayWrite(state)) return Promise.resolve();
    // The page as it goes out, not as it is when the write answers: you keep drawing while it is away.
    const text = serializeInk(history.strokes);
    return options.bridge.writeInk(options.projectPath, text).then(
      () => {
        state = writeLanded(state, text);
        if (mayWrite(state)) options.onError('');
      },
      (error: unknown) => {
        options.onError(`Handwriting not saved: ${failureText(error)}`);
      },
    );
  }

  function flush(): Promise<void> {
    if (pending === undefined) return Promise.resolve();
    window.clearTimeout(pending);
    pending = undefined;
    return write();
  }

  function schedule(): void {
    window.clearTimeout(pending);
    pending = window.setTimeout(() => {
      pending = undefined;
      void write();
    }, SAVE_DELAY_MS);
  }

  function sayIfStranded(): void {
    if (isStranded(state, serializeInk(history.strokes))) options.onError(strandedMessage(state));
  }

  async function read(): Promise<void> {
    await flush();
    const token = ++latestRead;
    // A stroke is being drawn right now, and a read would take the page out from under the pen. A reload
    // another screen asked for is not worth that; the next arrival reads.
    if (drag !== undefined) return;
    if (!mayRead(state, serializeInk(history.strokes))) {
      sayIfStranded();
      return;
    }
    let text: string;
    try {
      text = await options.bridge.readInk(options.projectPath);
    } catch (error: unknown) {
      if (token === latestRead) {
        state = readFailed(state);
        options.onError(`Handwriting not read, so nothing is written: ${failureText(error)}`);
      }
      return;
    }
    if (token !== latestRead || drag !== undefined) return;
    if (!mayRead(state, serializeInk(history.strokes))) {
      sayIfStranded();
      return;
    }
    const strokes = parseInk(text);
    if (strokes === undefined) {
      // A file somebody edited, or drew elsewhere: it is read as a failure, so nothing is written from
      // here on and the first stroke does not replace it.
      state = readFailed(state);
      options.onError('Handwriting not read, so nothing is written: the file is not in the format this page saves.');
      return;
    }
    history = startHistory(strokes);
    render();
    // The canonical form of what was read, so the comparison mayRead makes later is between two strings
    // this page made, and a file that is only differently spaced does not look like unsaved work.
    state = readLanded(serializeInk(strokes));
    options.onError('');
  }

  // Where the pointer is on the page: relative to the svg, which scrolls with the surface, so the
  // scroll is already counted.
  function pointOf(event: PointerEvent): InkPoint {
    const box = svg.getBoundingClientRect();
    return {
      x: event.clientX - box.left,
      y: event.clientY - box.top,
      pressure: event.pointerType === 'pen' ? event.pressure : FLAT_PRESSURE,
    };
  }

  function eraseAt(active: Extract<Drag, { kind: 'erase' }>, point: InkPoint): void {
    active.base.strokes.forEach((stroke, index) => {
      if (active.hit.has(index) || !strokeHit(stroke, point.x, point.y, ERASER_RADIUS)) return;
      active.hit.add(index);
      // Off the screen at once, so the eraser is seen working. Nothing is decided until the drag ends.
      paths[index]?.remove();
    });
  }

  svg.addEventListener('pointerdown', (event) => {
    if (drag !== undefined) return;
    // The pen's own eraser end reports button 5 and buttons bit 32, and erases whichever tool is picked.
    const penEraser = event.button === 5 || (event.buttons & 32) !== 0;
    if (event.button !== 0 && !penEraser) return;
    event.preventDefault();
    element.focus();
    svg.setPointerCapture(event.pointerId);
    const point = pointOf(event);
    if (tool === 'eraser' || penEraser) {
      drag = { kind: 'erase', pointerId: event.pointerId, base: history, hit: new Set() };
      eraseAt(drag, point);
      return;
    }
    const stroke: Stroke = { color: INK_COLORS[colorIndex], width: INK_WIDTHS[widthIndex], points: [point] };
    const path = makePath(stroke);
    svg.append(path);
    drag = { kind: 'draw', pointerId: event.pointerId, stroke, path };
  });

  svg.addEventListener('pointermove', (event) => {
    if (drag === undefined || event.pointerId !== drag.pointerId) return;
    // A fast pen moves many times between two frames and the browser folds those into one event;
    // the coalesced ones are the samples between, and a curve drawn from the folded ones alone has
    // corners.
    const events = event.getCoalescedEvents?.() ?? [];
    const samples = events.length > 0 ? events : [event];
    for (const sample of samples) {
      const point = pointOf(sample);
      if (drag.kind === 'erase') eraseAt(drag, point);
      else drag.stroke.points.push(point);
    }
    if (drag.kind === 'draw') drag.path.setAttribute('d', strokeOutline(drag.stroke.points, drag.stroke.width));
  });

  function endDrag(event: PointerEvent): void {
    if (drag === undefined || event.pointerId !== drag.pointerId) return;
    const finished = drag;
    drag = undefined;
    if (finished.kind === 'draw') {
      history = addStroke(history, finished.stroke);
      // The path drawn live is the stroke's; it joins the list the erase indexes into.
      paths.push(finished.path);
    } else {
      history = eraseStrokes(finished.base, [...finished.hit]);
      if (history === finished.base) return;
      render();
    }
    layout();
    schedule();
  }
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  // Everything but drawing, which is pointer input by nature (notes-decision-3). Each takes effect on a
  // page nobody is drawing on: a key pressed mid-stroke would change what the stroke is made of.
  function command(name: InkCommand): void {
    if (drag !== undefined) return;
    switch (name) {
      case 'pen': tool = 'pen'; break;
      case 'eraser': tool = 'eraser'; break;
      case 'color': colorIndex = (colorIndex + 1) % INK_COLORS.length; tool = 'pen'; break;
      case 'width': widthIndex = (widthIndex + 1) % INK_WIDTHS.length; tool = 'pen'; break;
      case 'undo':
      case 'clear': {
        const next = name === 'undo' ? undo(history) : clearAll(history);
        if (next !== history) {
          history = next;
          render();
          schedule();
        }
        break;
      }
    }
    showStrip();
  }

  // The surface's height is the window's, and the window can be resized with the page showing.
  new ResizeObserver(layout).observe(surface);
  showStrip();

  return {
    element,
    open(): Promise<void> {
      // Focus before the read, the way the text box takes it: the page you came from is hidden already,
      // and until this has the keyboard the next key lands nowhere.
      element.focus();
      layout();
      return read();
    },
    reload: (projectPath) => (projectPath === options.projectPath ? read() : Promise.resolve()),
    command,
  };
}
