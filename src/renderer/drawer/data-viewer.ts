import { icon } from '../app/icons';
import { viewerOverlay } from '../app/overlay';
import { isModified } from '../keys/shortcuts';
import { dataKey, dataStep, dataView, shownLines, startClosed, toggled, type DataRow } from './data-folds';
import { editRow } from './doc-viewer';

// A YAML or JSON doc, highlighted, on the sheet the markdown viewer uses, with every object and array
// that spans lines foldable. The rows the arrows walk are the Edit row, when there is one, and the lines
// that fold; Enter edits on the first and folds or unfolds on the others, Right and Left unfold and fold,
// A folds or unfolds them all. A click on a fold line moves the highlight there and folds it, as Enter
// does (conventions-rule-1). What folds, what is open and what each key does is data-folds.ts's.
export function dataOverlay(name: string, text: string, kind: 'yaml' | 'json', edit: (() => void) | null): void {
  const view = dataView(text, kind);
  const headers = new Set(view.folds.map((fold) => fold.header));
  let closed: ReadonlySet<number> = startClosed(view);
  let current: DataRow | null = edit === null ? (view.folds[0]?.header ?? null) : 'edit';
  let items = new Map<number, HTMLElement>();

  const keysLine = `${edit === null ? 'Enter folds' : 'Enter edits or folds'} · ↑↓ walk · ←→ fold · A folds all · Escape closes`;
  const top = edit === null ? document.createElement('div') : editRow(name, keysLine);
  if (edit === null) {
    top.className = 'doc-viewer-edit drawer-detail';
    top.textContent = keysLine;
  }
  const body = document.createElement('pre');
  body.className = 'data-viewer-text';
  const shown = document.createElement('div');
  shown.append(top);
  if (view.failure !== null) {
    const failure = document.createElement('p');
    failure.className = 'data-viewer-failure';
    failure.textContent = view.failure;
    shown.append(failure);
  }
  shown.append(body);

  function lineElement(line: number): HTMLElement {
    const item = document.createElement('div');
    item.className = 'data-line';
    const marker = document.createElement('span');
    marker.className = 'data-fold';
    const code = document.createElement('span');
    // Escaped by highlight.js, or by escapeHtml for a doc that did not parse.
    code.innerHTML = view.lines[line];
    item.append(marker, code);
    if (!headers.has(line)) return item;
    item.classList.add('foldable');
    marker.append(icon(closed.has(line) ? 'expand' : 'collapse'));
    if (closed.has(line)) {
      const folded = document.createElement('span');
      folded.className = 'data-folded';
      folded.textContent = ' …';
      code.append(folded);
    }
    item.addEventListener('click', () => {
      current = line;
      fold(toggled(closed, line));
    });
    return item;
  }

  function draw(): void {
    items = new Map(shownLines(view, closed).map((line) => [line, lineElement(line)]));
    body.replaceChildren(...items.values());
    highlight();
  }

  function highlight(): void {
    top.classList.toggle('highlighted', current === 'edit');
    for (const [line, item] of items) item.classList.toggle('highlighted', line === current);
    (typeof current === 'number' ? items.get(current) : top)?.scrollIntoView({ block: 'nearest' });
  }

  function fold(next: ReadonlySet<number>): void {
    if (next === closed) return highlight();
    closed = next;
    draw();
  }

  const editing = (): void => {
    close();
    edit?.();
  };
  const enter = (): void => {
    if (current === 'edit') editing();
    else if (current !== null) fold(toggled(closed, current));
  };
  // With no Edit row and nothing that folds, Enter closes the viewer as Escape does.
  const close = viewerOverlay('doc-viewer', shown, current === null ? {} : { enter });
  top.addEventListener('click', () => {
    if (edit !== null) editing();
  });
  draw();

  // The sheet's dialog holds the keyboard, so the keys are read there; Enter and Escape are viewerOverlay's.
  shown.parentElement?.addEventListener('keydown', (event) => {
    const action = dataKey(event.key, isModified(event));
    if (action === 'ignore') return;
    event.preventDefault();
    const next = dataStep(view, closed, edit !== null, current, action);
    current = next.current;
    fold(next.closed);
  });
}
