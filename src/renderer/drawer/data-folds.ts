import hljs from 'highlight.js/lib/common';
import { isCollection, isMap, isSeq, parseAllDocuments, type ParsedNode } from 'yaml';
import { failureText } from '../../shared/errors/failure';
import { escapeHtml } from '../chat/chat-markdown';

// A YAML or JSON doc for the viewer: its lines highlighted, which of them fold and what is open. The
// DOM is data-viewer.ts's; every rule with a branch is here.
//
// JSON is pretty-printed with a two-space indent and read again as YAML, which it is a subset of, so
// one walk finds the folds of both. YAML is shown as written, its comments kept.

// One object or array (a YAML mapping or sequence) that spans more than one line: `header` is the line
// that names it, the key or the `-` it is the value of, and stays in sight when it folds; `from`..`to`
// are the lines it hides. A flow collection, `{ ... }` or `[ ... ]`, keeps its closing line in sight.
export type Fold = { header: number; from: number; to: number };

// The doc as drawn: one line of HTML per line, and its folds. A doc that does not parse is its text as
// written, with no folds, and `failure` saying where reading it stopped.
export type DataView = { lines: string[]; folds: Fold[]; failure: string | null };

// Longer than this and the doc opens with every fold closed: the top level in sight and nothing under it.
export const OPEN_LINE_LIMIT = 60;

// The line an offset in `text` is on.
function lineAt(text: string, offset: number): number {
  let line = 0;
  for (let index = 0; index < offset && index < text.length; index++) if (text[index] === '\n') line++;
  return line;
}

// The line of the last character a node covers that is not white space, so a block collection's fold
// ends at its last entry rather than the blank line after it.
function lastLine(text: string, end: number): number {
  let last = Math.min(end, text.length) - 1;
  while (last > 0 && /\s/.test(text[last])) last--;
  return lineAt(text, last);
}

function foldsOf(text: string, root: ParsedNode | null): Fold[] {
  const folds: Fold[] = [];
  const add = (node: ParsedNode, headerOffset: number): void => {
    const header = lineAt(text, headerOffset);
    const end = lastLine(text, node.range[1]);
    const to = 'flow' in node && node.flow ? end - 1 : end;
    if (to > header) folds.push({ header, from: header + 1, to });
    walk(node);
  };
  const walk = (node: ParsedNode): void => {
    if (isMap(node)) {
      for (const pair of node.items) {
        const value = pair.value as ParsedNode | null;
        const key = pair.key as ParsedNode | null;
        if (value !== null && isCollection(value)) add(value, key?.range[0] ?? value.range[0]);
      }
    } else if (isSeq(node)) {
      for (const item of node.items as ParsedNode[]) if (isCollection(item)) add(item, item.range[0]);
    }
  };
  // The root itself never folds: folded, it would hide the whole doc behind its first line.
  if (root !== null) walk(root);
  // By header, so the walk below meets an outer fold before the folds inside it.
  return folds.sort((one, other) => one.header - other.header);
}

// hljs leaves a span open across a line break (a block scalar, a comment run), so each line closes
// what is open at its end and the next opens it again; every line is then whole HTML on its own.
export function splitLines(html: string): string[] {
  const lines: string[] = [];
  const open: string[] = [];
  let line = '';
  for (const [token] of html.matchAll(/<span[^>]*>|<\/span>|\n|[^<\n]+/g)) {
    if (token === '\n') {
      lines.push(line + '</span>'.repeat(open.length));
      line = open.join('');
    } else {
      if (token.startsWith('<span')) open.push(token);
      else if (token === '</span>') open.pop();
      line += token;
    }
  }
  lines.push(line);
  return lines;
}

// The first line of a parser's message, the one that says where: the yaml package follows it with the
// source and a caret.
const firstLine = (message: string): string => message.split('\n')[0];

export function dataView(text: string, kind: 'yaml' | 'json'): DataView {
  const plain = (failure: string): DataView => ({ lines: text.split('\n').map(escapeHtml), folds: [], failure });
  let shown = text;
  if (kind === 'json') {
    try {
      shown = JSON.stringify(JSON.parse(text), null, 2);
    } catch (error: unknown) {
      return plain(`Not valid JSON: ${firstLine(failureText(error))}`);
    }
  }
  const documents = parseAllDocuments(shown);
  const docs = Array.isArray(documents) ? documents : [];
  const error = docs.flatMap((doc) => doc.errors)[0];
  if (error !== undefined) return plain(`Not valid YAML: ${firstLine(error.message)}`);
  return {
    lines: splitLines(hljs.highlight(shown, { language: kind }).value),
    folds: docs.flatMap((doc) => foldsOf(shown, doc.contents as ParsedNode | null)),
    failure: null,
  };
}

// The headers of the folds that start closed: all of them in a long doc, none in a short one.
export function startClosed(view: DataView): Set<number> {
  return new Set(view.lines.length > OPEN_LINE_LIMIT ? view.folds.map((fold) => fold.header) : []);
}

// The lines in sight, in order: every line not hidden by a closed fold.
export function shownLines(view: DataView, closed: ReadonlySet<number>): number[] {
  const shown: number[] = [];
  let hiddenTo = -1;
  const folds = new Map(view.folds.map((fold) => [fold.header, fold]));
  for (let line = 0; line < view.lines.length; line++) {
    if (line <= hiddenTo) continue;
    shown.push(line);
    const fold = folds.get(line);
    if (fold !== undefined && closed.has(line)) hiddenTo = fold.to;
  }
  return shown;
}

// The fold-all key: with any fold open it closes them all, otherwise it opens them all.
export function allToggled(view: DataView, closed: ReadonlySet<number>): Set<number> {
  const headers = view.folds.map((fold) => fold.header);
  return new Set(headers.some((header) => !closed.has(header)) ? headers : []);
}

// The fold a line sits inside, innermost first, for Left on a fold that is already closed.
export function enclosingHeader(view: DataView, line: number): number | null {
  const around = view.folds.filter((fold) => fold.from <= line && line <= fold.to);
  return around.length === 0 ? null : around.reduce((inner, fold) => (fold.from > inner.from ? fold : inner)).header;
}

// What a key does in the viewer; a modified key does nothing here (keys-rule-1).
export type DataKey = 'next' | 'previous' | 'open' | 'close' | 'all' | 'ignore';

export function dataKey(key: string, modified: boolean): DataKey {
  if (modified) return 'ignore';
  switch (key) {
    case 'ArrowDown': return 'next';
    case 'ArrowUp': return 'previous';
    case 'ArrowRight': return 'open';
    case 'ArrowLeft': return 'close';
    case 'a': return 'all';
    default: return 'ignore';
  }
}

// One of the rows the arrows walk: the Edit row or a fold, by its header line.
export type DataRow = 'edit' | number;

// The rows the arrows walk, in order: the Edit row when there is one, then each fold line in sight.
export function walkedRows(view: DataView, closed: ReadonlySet<number>, hasEdit: boolean): DataRow[] {
  const headers = new Set(view.folds.map((fold) => fold.header));
  return [...(hasEdit ? ['edit' as const] : []), ...shownLines(view, closed).filter((line) => headers.has(line))];
}

// A fold whose line a fold-all just hid hands the highlight out to the fold now in sight around it.
export function inSight(view: DataView, closed: ReadonlySet<number>, current: DataRow | null): DataRow | null {
  const shown = new Set(shownLines(view, closed));
  let row = current;
  while (typeof row === 'number' && !shown.has(row)) row = enclosingHeader(view, row);
  return row;
}

// A fold opened if it was closed and closed if it was open.
export function toggled(closed: ReadonlySet<number>, header: number): Set<number> {
  const next = new Set(closed);
  if (!next.delete(header)) next.add(header);
  return next;
}

// What a key leaves folded and highlighted. The arrows walk the rows round; Right opens a closed fold;
// Left closes an open one, or on one already closed steps out to the fold around it.
export function dataStep(
  view: DataView, closed: ReadonlySet<number>, hasEdit: boolean, current: DataRow | null, action: Exclude<DataKey, 'ignore'>,
): { closed: ReadonlySet<number>; current: DataRow | null } {
  if (action === 'all') {
    const next = allToggled(view, closed);
    return { closed: next, current: inSight(view, next, current) };
  }
  if (action === 'next' || action === 'previous') {
    const rows = walkedRows(view, closed, hasEdit);
    if (rows.length === 0) return { closed, current };
    const step = action === 'next' ? 1 : -1;
    const at = current === null ? -1 : rows.indexOf(current);
    const from = at === -1 ? (step === 1 ? -1 : 0) : at;
    return { closed, current: rows[(from + step + rows.length) % rows.length] };
  }
  if (typeof current !== 'number') return { closed, current };
  if (action === 'open') return { closed: closed.has(current) ? toggled(closed, current) : closed, current };
  if (!closed.has(current)) return { closed: toggled(closed, current), current };
  return { closed, current: enclosingHeader(view, current) ?? current };
}
