import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sourceFiles } from './src/main/testing/source-files';

// keys-rule-1: a renderer key handler that reads `event.key` asks isModified (or isBareCharacter)
// before it does, or a dialog that is open swallows Ctrl+N mid-word. Each handler is read from the
// source: its parameter's first `.key` must come after the guard's first call on that parameter.

// The handlers that read a key before the guard on purpose, one row per handler, each with the
// reason docs/keys/hard-rules.md gives. A second unguarded handler in one of these files fails.
const EXCEPTIONS = [
  { file: 'src/renderer/app/overlay.ts', reason: 'Tab in a search box: nothing else there takes focus' },
  { file: 'src/renderer/board/filter-dialog.ts', reason: 'Tab in the board filter dialog, for the search box reason' },
  { file: 'src/renderer/notes/notes-view.ts', reason: 'Tab in the notes box, the only key it reads' },
  { file: 'src/renderer/drawer/drawer-view.ts', reason: "Tab, and the drawer's own key, which closes it" },
];
// Two more the rule names pass as they stand. The settings screen's armed row hands the whole event to
// capture() without reading `.key` here, and the manager list asks isBareCharacter, which counts.

// A handler handed over by name rather than written inline, and where the ones it runs are written.
// overlay.ts adds viewerOverlay's `keys` option as a keydown listener; its callers write them.
const FORWARDED: Record<string, { name: string; written: RegExp }> = {
  'src/renderer/app/overlay.ts': { name: 'keys', written: /\bkeys:\s*/g },
};

const KEYDOWN = /addEventListener\(\s*['"]keydown['"]\s*,\s*|\bonkeydown\s*=\s*/g;
// `(event) => {`, `(event: KeyboardEvent) => {`, `event => {`, `function (event) {`, or `() => {`.
const INLINE = /^(?:function\s*\w*\s*)?(?:\(\s*(\w*)\s*(?::[^)]*)?\)|(\w+))\s*(?:=>)?\s*\{/;

type Handler = { file: string; line: number; problem: 'unguarded' | 'unreadable' };

// Comments go first, so a brace or an `event.key` in one is not read as code.
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' ')).replace(/\/\/.*$/gm, '');
}

function bodyFrom(source: string, open: number): string {
  let depth = 0;
  for (let at = open; at < source.length; at++) {
    if (source[at] === '{') depth++;
    else if (source[at] === '}' && --depth === 0) return source.slice(open, at + 1);
  }
  return source.slice(open);
}

function guarded(body: string, parameter: string): boolean {
  const reads = body.search(new RegExp(`\\b${parameter}\\.key\\b`));
  if (reads === -1) return true;
  const guard = body.search(new RegExp(`\\b(?:isModified|isBareCharacter)\\(\\s*${parameter}\\s*\\)`));
  return guard !== -1 && guard < reads;
}

function handlersIn(file: string, source: string, starts: RegExp, forwarded?: string): Handler[] {
  const found: Handler[] = [];
  for (const start of source.matchAll(starts)) {
    const after = start.index + start[0].length;
    const line = source.slice(0, after).split('\n').length;
    const inline = INLINE.exec(source.slice(after));
    if (inline === null) {
      // Named, not written here: fine only when it is the one this file forwards.
      const named = /^(\w+)\s*\)/.exec(source.slice(after))?.[1];
      if (named === undefined || named !== forwarded) found.push({ file, line, problem: 'unreadable' });
      continue;
    }
    const parameter = inline[1] ?? inline[2];
    const body = bodyFrom(source, after + inline[0].length - 1);
    if (parameter !== '' && !guarded(body, parameter)) found.push({ file, line, problem: 'unguarded' });
  }
  return found;
}

function keyHandlers(): { files: number; problems: Handler[] } {
  const files = sourceFiles('src/renderer').map((file) => ({ file, source: withoutComments(readFileSync(file, 'utf8')) }));
  const problems = files.flatMap(({ file, source }) => handlersIn(file, source, KEYDOWN, FORWARDED[file]?.name));
  for (const { written } of Object.values(FORWARDED)) {
    problems.push(...files.flatMap(({ file, source }) => handlersIn(file, source, written)).filter((handler) => handler.problem !== 'unreadable'));
  }
  return { files: files.filter(({ source }) => source.search(KEYDOWN) !== -1).length, problems };
}

describe('renderer key handlers', () => {
  const { files, problems } = keyHandlers();
  const where = (handler: Handler): string => `${handler.file}:${handler.line}`;

  it('ask isModified before reading event.key, except the named ones', () => {
    const unguarded = problems.filter((handler) => handler.problem === 'unguarded');
    expect(unguarded.map((handler) => handler.file).sort(), unguarded.map(where).join('\n'))
      .toEqual(EXCEPTIONS.map((exception) => exception.file).sort());
  });

  it('are all written inline, so the test can read them', () => {
    expect(problems.filter((handler) => handler.problem === 'unreadable').map(where)).toEqual([]);
  });

  it('finds the handlers the app has, so an empty scan cannot pass', () => {
    expect(files).toBeGreaterThan(10);
  });
});

describe('the handler reader', () => {
  const read = (source: string): string[] => handlersIn('probe.ts', withoutComments(source), KEYDOWN).map((handler) => handler.problem);

  it('passes a guard before the key, and a handler that reads no key', () => {
    expect(read("a.addEventListener('keydown', (event) => { if (isModified(event)) return; go(event.key); });")).toEqual([]);
    expect(read("a.onkeydown = (e: KeyboardEvent) => { if (!isBareCharacter(e) || e.key !== ' ') return; };")).toEqual([]);
    expect(read("a.addEventListener('keydown', () => { remember(); });")).toEqual([]);
  });

  it('fails a key read before the guard, or with none', () => {
    expect(read("a.addEventListener('keydown', (event) => { act(event.key, isModified(event)); });")).toEqual(['unguarded']);
    expect(read("a.addEventListener('keydown', (event) => { if (event.key === 'Tab') stop(); });")).toEqual(['unguarded']);
  });

  it('does not take a guard written in a comment', () => {
    expect(read("a.addEventListener('keydown', (event) => {\n // isModified(event)\n go(event.key); });")).toEqual(['unguarded']);
  });

  it('cannot read a handler passed by name', () => {
    expect(read("a.addEventListener('keydown', onKey);")).toEqual(['unreadable']);
  });
});
