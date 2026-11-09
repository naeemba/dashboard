import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { sourceFiles } from './src/main/testing/source-files';

// keys-rule-1: a renderer key handler that reads `event.key` asks isModified (or isBareCharacter)
// before it does, or a dialog that is open swallows Ctrl+N mid-word. Each handler is parsed from the
// source: its parameter's first `.key` must come after the guard's first call on that parameter.

// The files holding a handler that reads a key before the guard on purpose, one row per file, for the
// reasons docs/keys/hard-rules.md gives. A second unguarded handler in one of these files passes.
const EXCEPTIONS = [
  'src/renderer/app/overlay.ts', // Tab in a search box: nothing else there takes focus
  'src/renderer/board/filter-dialog.ts', // Tab in the board filter dialog, for the same reason
  'src/renderer/notes/notes-view.ts', // Tab in the notes box, the only key it reads
  'src/renderer/drawer/drawer-view.ts', // Tab, and the drawer's own key, which closes it
];
// Two more the rule names pass as they stand. The settings screen's armed row hands the whole event to
// capture() without reading `.key` there, and the manager list asks isBareCharacter, which counts.

// overlay.ts adds viewerOverlay's `keys` option as a listener by name; its callers write each one
// inline as `keys: (event) => …`, and those are read instead.
const FORWARDS_KEYS = 'src/renderer/app/overlay.ts';

const GUARDS = new Set(['isModified', 'isBareCharacter']);

type Handler = { file: string; line: number };
type Found = { seen: number; unguarded: Handler[]; unreadable: Handler[] };

// Whether the handler's first read of its parameter's key (`.key`, `['key']`, `const { key } =`) comes
// after a guard call on it. Undefined when there is no single plain parameter to follow. Only the
// handler's own body is read: a function it hands the event to is trusted, and a guard counts by
// where it is written, not by whether it returns.
function guarded(handler: ts.ArrowFunction | ts.FunctionExpression): boolean | undefined {
  const [parameter] = handler.parameters;
  if (parameter === undefined) return true;
  if (!ts.isIdentifier(parameter.name)) return undefined;
  const name = parameter.name.text;
  const isParameter = (node: ts.Node): boolean => ts.isIdentifier(node) && node.text === name;
  let firstRead = Infinity;
  let firstGuard = Infinity;
  const readsKey = (node: ts.Node): boolean =>
    (ts.isPropertyAccessExpression(node) && node.name.text === 'key' && isParameter(node.expression))
    || (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)
      && node.argumentExpression.text === 'key' && isParameter(node.expression))
    || (ts.isVariableDeclaration(node) && node.initializer !== undefined && isParameter(node.initializer)
      && ts.isObjectBindingPattern(node.name)
      && node.name.elements.some((element) => (element.propertyName ?? element.name).getText() === 'key'));
  const visit = (node: ts.Node): void => {
    if (readsKey(node)) firstRead = Math.min(firstRead, node.getStart());
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && GUARDS.has(node.expression.text)
      && node.arguments.some(isParameter)) {
      firstGuard = Math.min(firstGuard, node.getStart());
    }
    ts.forEachChild(node, visit);
  };
  visit(handler.body);
  return firstRead === Infinity || firstGuard < firstRead;
}

// Whether a `keys` value sits in an object literal passed straight to viewerOverlay.
function isViewerOption(value: ts.Expression): boolean {
  const object = value.parent.parent;
  const call = object?.parent;
  return ts.isObjectLiteralExpression(object) && call !== undefined && ts.isCallExpression(call)
    && ts.isIdentifier(call.expression) && call.expression.text === 'viewerOverlay';
}

// Every keydown listener, `onkeydown` and viewer `keys` option in one file.
function handlersIn(file: string, source: string): Found {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const found: Found = { seen: 0, unguarded: [], unreadable: [] };
  const check = (handler: ts.Expression, viewerOption = false): void => {
    const inline = ts.isArrowFunction(handler) || ts.isFunctionExpression(handler);
    // A `keys:` that is not a function is some other object's field, not a handler, unless the
    // object is the option passed to viewerOverlay.
    if (viewerOption && !inline && !isViewerOption(handler)) return;
    found.seen++;
    const answer = inline ? guarded(handler) : undefined;
    if (answer === true) return;
    const forwarded = file === FORWARDS_KEYS && ts.isIdentifier(handler) && handler.text === 'keys';
    if (forwarded) return;
    const line = tree.getLineAndCharacterOfPosition(handler.getStart()).line + 1;
    found[answer === false ? 'unguarded' : 'unreadable'].push({ file, line });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'addEventListener') {
      const [event, handler] = node.arguments;
      if (event !== undefined && ts.isStringLiteralLike(event) && event.text === 'keydown' && handler !== undefined) check(handler);
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isPropertyAccessExpression(node.left) && node.left.name.text === 'onkeydown') check(node.right);
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === 'keys') check(node.initializer, true);
    if (ts.isShorthandPropertyAssignment(node) && node.name.text === 'keys') check(node.name, true);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
}

describe('renderer key handlers', () => {
  const found = sourceFiles('src/renderer').map((file) => handlersIn(file, readFileSync(file, 'utf8')));
  const unguarded = found.flatMap((file) => file.unguarded);
  const where = (handler: Handler): string => `${handler.file}:${handler.line}`;

  it('ask isModified before reading event.key, except the named ones', () => {
    expect(unguarded.map((handler) => handler.file).sort(), unguarded.map(where).join('\n')).toEqual([...EXCEPTIONS].sort());
  });

  it('are all written inline, so the test can read them', () => {
    expect(found.flatMap((file) => file.unreadable).map(where)).toEqual([]);
  });

  it('finds the handlers the app has, so an empty scan cannot pass', () => {
    expect(found.reduce((total, file) => total + file.seen, 0)).toBeGreaterThan(20);
  });
});

describe('the handler reader', () => {
  const read = (source: string): string[] => {
    const { unguarded, unreadable } = handlersIn('probe.ts', source);
    return [...unguarded.map(() => 'unguarded'), ...unreadable.map(() => 'unreadable')];
  };

  it('passes a guard before the key, and a handler that reads no key', () => {
    expect(read("a.addEventListener('keydown', (event) => { if (isModified(event)) return; go(event.key); });")).toEqual([]);
    expect(read("a.onkeydown = (e: KeyboardEvent) => { if (!isBareCharacter(e) || e.key !== ' ') return; };")).toEqual([]);
    expect(read("a.addEventListener('keydown', () => { remember(); });")).toEqual([]);
  });

  it('fails a key read before the guard, or with none', () => {
    expect(read("a.addEventListener('keydown', (event) => { act(event.key, isModified(event)); });")).toEqual(['unguarded']);
    expect(read("open({ keys: (event) => { if (event.key === 'Tab') stop(); } });")).toEqual(['unguarded']);
    expect(read("a.addEventListener('keydown', (event) => { const { key } = event; go(key); });")).toEqual(['unguarded']);
    expect(read("a.addEventListener('keydown', (event) => { go(event['key']); });")).toEqual(['unguarded']);
  });

  it('cannot read a handler passed by name or destructured', () => {
    expect(read("a.addEventListener('keydown', onKey);")).toEqual(['unreadable']);
    expect(read("a.addEventListener('keydown', ({ key }) => { go(key); });")).toEqual(['unreadable']);
    expect(read("viewerOverlay('x', el, { keys: onKeys });")).toEqual(['unreadable']);
    expect(read("viewerOverlay('x', el, { keys });")).toEqual(['unreadable']);
    expect(read("render({ keys: settings.keys });")).toEqual([]);
  });
});
