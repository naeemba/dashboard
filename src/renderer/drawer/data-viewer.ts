import { icon } from '../app/icons';
import { viewerOverlay } from '../app/overlay';
import { isModified } from '../keys/shortcuts';
import { matchesBinding } from '../../shared/keys/binding';
import { dataKey, dataKeysLine, dataStep, dataView, shownLines, startClosed, type DataRow } from './data-folds';
import type { DataKind } from '../../shared/drawer/drawer';
import { editRow } from './doc-viewer';

// A YAML or JSON doc, highlighted, on the sheet the markdown viewer uses, with every object and array
// that spans lines foldable. The rows the arrows walk are the Edit row, when there is one, and the lines
// that fold; Enter edits on the first and folds or unfolds on the others, Right and Left unfold and fold,
// A folds or unfolds them all. A click on a fold line moves the highlight there and folds it, as Enter
// does (conventions-rule-1). What folds, what is open and what each key does is data-folds.ts's.
// `extra` is a key of the caller's that the viewer hears and names on its keys line: `<binding> <label>`.
export type ViewerKey = { binding: string; label: string; run(): void };
export function dataOverlay(
  name: string, text: string, kind: DataKind, edit: (() => void) | null, extra?: ViewerKey,
): void {
  const view = dataView(text, kind);
  const hasFolds = view.folds.size > 0;
  let closed: ReadonlySet<number> = startClosed(view);
  let current: DataRow | null = edit === null ? (view.folds.keys().next().value ?? null) : 'edit';

  const keysLine = dataKeysLine(hasFolds, edit !== null) + (extra === undefined ? '' : ` · ${extra.binding} ${extra.label}`);
  const top = edit === null ? keysRow(keysLine) : editRow(name, keysLine);
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

  // Each line is built once, the first time it is in sight; a fold re-sets only the fold lines' markers.
  const items = new Map<number, { item: HTMLElement; marker: HTMLElement; folded: HTMLElement }>();
  function lineElement(line: number): HTMLElement {
    const built = items.get(line);
    if (built !== undefined) return built.item;
    const item = document.createElement('div');
    item.className = 'data-line';
    const marker = document.createElement('span');
    marker.className = 'data-fold';
    const code = document.createElement('span');
    // Escaped by highlight.js, or by escapeHtml for a doc that did not parse.
    code.innerHTML = view.lines[line];
    const folded = document.createElement('span');
    folded.className = 'data-folded';
    item.append(marker, code, folded);
    if (view.folds.has(line)) {
      item.classList.add('foldable');
      item.addEventListener('click', () => {
        current = line;
        step('toggle');
      });
    }
    items.set(line, { item, marker, folded });
    return item;
  }

  function draw(): void {
    // Through a fragment, not spread as arguments: a doc of a few hundred thousand lines overflows the stack.
    const fragment = document.createDocumentFragment();
    for (const line of shownLines(view, closed)) fragment.append(lineElement(line));
    body.replaceChildren(fragment);
    for (const header of view.folds.keys()) {
      const built = items.get(header);
      if (built === undefined) continue;
      built.marker.replaceChildren(icon(closed.has(header) ? 'expand' : 'collapse'));
      built.folded.textContent = closed.has(header) ? ' …' : '';
    }
    highlight();
  }

  let lit: HTMLElement | null = null;
  function highlight(): void {
    lit?.classList.remove('highlighted');
    lit = current === 'edit' ? top : typeof current === 'number' ? (items.get(current)?.item ?? null) : null;
    lit?.classList.add('highlighted');
    lit?.scrollIntoView({ block: 'nearest' });
  }

  function step(action: Parameters<typeof dataStep>[4]): void {
    const next = dataStep(view, closed, edit !== null, current, action);
    current = next.current;
    if (next.closed === closed) return highlight();
    closed = next.closed;
    draw();
  }

  const editing = (): void => {
    close();
    edit?.();
  };
  // With no Edit row and nothing that folds, Enter closes the viewer as Escape does.
  const close = viewerOverlay('doc-viewer', shown, {
    enter: current === null ? undefined : () => (current === 'edit' ? editing() : step('toggle')),
    keys: (event) => {
      if (extra !== undefined && matchesBinding(event, extra.binding)) {
        event.preventDefault();
        return extra.run();
      }
      const action = dataKey(event.key, isModified(event), hasFolds);
      if (action === 'ignore') return;
      event.preventDefault();
      step(action);
    },
  });
  top.addEventListener('click', () => {
    if (edit !== null) editing();
  });
  draw();
}

// The manager's viewer has no Edit row, so the keys line stands alone where it would be.
function keysRow(keysLine: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'doc-viewer-edit drawer-detail';
  row.textContent = keysLine;
  return row;
}
