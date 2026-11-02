import type { DashboardBridge } from '../../shared/app/bridge';
import type { InkCommand } from '../../shared/keys/actions';
import { strokeHit, strokeOutline, type InkPoint, type Stroke } from './ink-geometry';
import { addStroke, clearAll, eraseStrokes, readInto, startHistory, undo, type InkHistory } from './ink-history';
import { pointerAction, pointerPressure, type InkTool } from './ink-pointer';
import { INK_COLORS, INK_WIDTHS, parseInk, serializeInk } from './ink-svg';
import { createSavedPage } from './saved-page';

export type InkOptions = {
  bridge: DashboardBridge;
  projectPath: string;
  // The status bar's error span, with the same meaning as the text box's: a write or a read that lands
  // clears whatever it replaces.
  onError(message: string): void;
  // The key an action is bound to now, so the strip and the bar name the keys as they are set.
  binding(actionName: string): string;
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

// How far the eraser reaches, in pixels, beyond the ink itself. A fingertip-sized target: the eraser is
// dragged across strokes, not placed on a hairline.
const ERASER_RADIUS = 8;

// Room kept right of the rightmost stroke, so a stroke at the edge is not drawn against it.
const RIGHT_MARGIN = 16;

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

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
  // The keys as they are bound now, written again with the rest of the strip.
  const hints = document.createElement('span');
  hints.className = 'ink-hints';
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
  let tool: InkTool = 'pen';
  let colorIndex = 0;
  let widthIndex = 1;
  let drag: Drag | undefined;

  function showStrip(): void {
    toolLabel.textContent = tool === 'pen' ? 'Pen' : 'Eraser';
    swatch.style.background = INK_COLORS[colorIndex];
    widthLabel.textContent = `${INK_WIDTHS[widthIndex]}px`;
    element.dataset.tool = tool;
    const key = (name: string): string => options.binding(`ink-${name}`);
    hints.textContent = `${key('pen')} pen · ${key('eraser')} eraser · ${key('color')} colour · `
      + `${key('width')} width · ${key('undo')} undo · ${key('clear')} clear`;
  }

  // Always a screen of room below the lowest stroke, so there is somewhere to write next, and never less
  // than the screen itself so the surface is not a short strip at the top of a tall window. As wide as
  // the ink too, because an svg clips what lies outside its box: a page written on a wide window and
  // opened on a narrow one scrolls sideways instead of losing its right half.
  function layout(): void {
    const viewport = surface.clientHeight;
    // A loop rather than Math.max(...points): a long page holds tens of thousands of points, and that
    // many arguments overflow the call stack.
    let lowest = 0;
    let rightmost = 0;
    for (const stroke of history.strokes) {
      for (const point of stroke.points) {
        lowest = Math.max(lowest, point.y);
        rightmost = Math.max(rightmost, point.x);
      }
    }
    svg.style.height = `${Math.max(viewport, lowest + viewport)}px`;
    svg.style.width = `${Math.max(surface.clientWidth, rightmost + RIGHT_MARGIN)}px`;
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

  // The wait, the flush on arrival and the rules about when the page may be read over or written out
  // are saved-page.ts's, shared with the text box, over the string serializeInk makes.
  const page = createSavedPage({
    name: 'Handwriting',
    text: () => serializeInk(history.strokes),
    show: (text) => {
      const strokes = parseInk(text);
      if (strokes === undefined) return undefined;
      const read = readInto(history, strokes);
      if (read !== history) {
        history = read;
        render();
      }
      // The canonical form of what was read, so the comparison mayRead makes later is between two
      // strings this page made, and a file that is only differently spaced does not look like unsaved
      // work.
      return serializeInk(strokes);
    },
    load: () => options.bridge.readInk(options.projectPath),
    save: (text) => options.bridge.writeInk(options.projectPath, text),
    // A stroke is being drawn right now, and a read would take the page out from under the pen. A
    // reload another screen asked for is not worth that; the next arrival reads.
    busy: () => drag !== undefined,
    strandedWords: () => ({
      neverRead: 'Handwriting was drawn before the file was read: nothing here is saved. '
        + `Clear the page with ${options.binding('ink-clear')} to read the file.`,
      afterFailedRead: 'Handwriting was drawn after a failed read: nothing here is saved. '
        + `Undo with ${options.binding('ink-undo')} back to the page that was here.`,
    }),
    onError: options.onError,
  });

  // Where the pointer is on the page: relative to the svg, which scrolls with the surface, so the
  // scroll is already counted.
  function pointOf(event: PointerEvent): InkPoint {
    const box = svg.getBoundingClientRect();
    return {
      x: event.clientX - box.left,
      y: event.clientY - box.top,
      pressure: pointerPressure(event),
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
    const action = pointerAction(event, tool);
    if (action === 'ignore') return;
    event.preventDefault();
    element.focus();
    svg.setPointerCapture(event.pointerId);
    const point = pointOf(event);
    if (action === 'erase') {
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
    page.changed();
  }
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);
  // Capture lost any other way — the window losing the pointer, or the page hidden mid-stroke — ends the
  // drag too, or the page would ignore the pointer and every key until a restart.
  svg.addEventListener('lostpointercapture', endDrag);

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
          page.changed();
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
      // The strip again too: a key may have been rebound while the page was away.
      showStrip();
      layout();
      return page.read();
    },
    reload: (projectPath) => (projectPath === options.projectPath ? page.read() : Promise.resolve()),
    command,
  };
}
