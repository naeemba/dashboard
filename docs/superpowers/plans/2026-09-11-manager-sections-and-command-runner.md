# Manager Sections and Command Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the manager page a named strip along the top — general, board,
command — and build the command section behind it: type a command once, run it
in the projects you mark, read the answers one row per project.

**Architecture:** Three pure modules carry the decisions (`tasks.ts`,
`manager-sections.ts`, and a new predicate in `actions.ts`), one view draws the
command screen, one draws the strip, and main gains a process-per-project
runner that is not a pty and borrows no pane. An action's scope gains one value
— `manager-page` — so two keys can be heard on all three sections without
being bound twice.

**Tech Stack:** TypeScript, Electron, node-pty (not used here — this runner
uses plain `child_process.spawn`), vitest, xterm.js.

**Spec:** `docs/superpowers/specs/2026-09-11-manager-sections-and-command-runner-design.md`

## Global Constraints

- **No file over 600 lines of code.** `renderer.ts` is at 817 and must not grow
  materially; new drawing goes in new files. Comments and blank lines do not
  count.
- **Every `<input>` and `<textarea>` gets `dir = 'auto'` in the same change
  that adds it.** The command box is the only new one here.
- **Every dialog reading `event.key` checks `if (isModified(event)) return;`
  first.** The command view reads `event.key` for Space, so it asks
  `isBareCharacter`, which is the same list of modifiers.
- **IPC channels are `<noun>:<verb>`** — `task:run`, `task:cancel`,
  `task:update`.
- **A refusal or a rule is explained where it is decided.** Export the
  predicate; never write the condition twice.
- **`src/help.ts` is part of the change.** A key, a mode or a screen that
  changes updates the help dialog in the same commit.
- **Never quit, kill, restart or rebuild the running Dashboard app.** Building
  into `out/` or `.vite/` is fine. After the work, say it needs a rebuild and
  restart, and stop.
- **No self-reference in commits or code.** No mention of any AI tool.
- Three checks must pass before the pull request: `npm test`,
  `npx tsc --noEmit`, `npx eslint .`.

---

### Task 1: What a command did, and how a row says it

**Files:**
- Create: `src/tasks.ts`
- Test: `src/tasks.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type TaskState = 'idle' | 'running' | 'done' | 'cancelled'`
  - `type TaskResult = { projectPath: string; state: TaskState; exitCode: number | null; lastLine: string; tail: string[] }`
  - `printableLines(output: string): string[]`
  - `lastPrintableLine(output: string): string`
  - `taskSummary(result: TaskResult): string`

`tail` is the last five lines an opened row shows. It is built by main from
`printableLines`, passed through `tailLines` — the one already exported from
`manager.ts`, which is where "five lines, blanks dropped" is decided for the
manager's pane rows. Do not write a second copy of that rule here.

- [ ] **Step 1: Write the failing test**

Create `src/tasks.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { lastPrintableLine, printableLines, taskSummary, type TaskResult } from './tasks';

function result(fields: Partial<TaskResult>): TaskResult {
  return { projectPath: '/p', state: 'done', exitCode: 0, lastLine: '', tail: [], ...fields };
}

describe('printableLines', () => {
  it('resolves a redrawn line to what it finally said', () => {
    expect(printableLines('one\nbuilding 10%\rdone\n')).toEqual(['one', 'done', '']);
  });

  it('strips the colours a tool writes round its own words', () => {
    expect(printableLines('\u001B[31mfailed\u001B[0m')).toEqual(['failed']);
  });
});

describe('lastPrintableLine', () => {
  it('takes the last line with anything in it', () => {
    expect(lastPrintableLine('one\ntwo\n\n  \n')).toBe('two');
  });

  it('strips the colours a tool writes round its own words', () => {
    expect(lastPrintableLine('\u001B[31mfound 3 vulnerabilities\u001B[0m\n'))
      .toBe('found 3 vulnerabilities');
  });

  it('takes what a redrawn line finally said, not the first draft', () => {
    expect(lastPrintableLine('building 10%\rbuilding 90%\rdone\n')).toBe('done');
  });

  it('answers nothing for a command that printed nothing', () => {
    expect(lastPrintableLine('')).toBe('');
    expect(lastPrintableLine('\n\n')).toBe('');
  });
});

describe('taskSummary', () => {
  it('says nothing has been run yet', () => {
    expect(taskSummary(result({ state: 'idle', exitCode: null }))).toBe('—');
  });

  it('says a run is going', () => {
    expect(taskSummary(result({ state: 'running', exitCode: null }))).toBe('running');
  });

  it('says a run was stopped', () => {
    expect(taskSummary(result({ state: 'cancelled', exitCode: null }))).toBe('cancelled');
  });

  it('puts the exit code in front of what the command last said', () => {
    expect(taskSummary(result({ exitCode: 1, lastLine: '3 high, 0 moderate' })))
      .toBe('exit 1 · 3 high, 0 moderate');
  });

  it('is the exit code alone when the command printed nothing', () => {
    expect(taskSummary(result({ exitCode: 0, lastLine: '' }))).toBe('exit 0');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/tasks.test.ts`
Expected: FAIL — `Failed to resolve import "./tasks"`.

- [ ] **Step 3: Write `src/tasks.ts`**

```ts
// What one command did in one project. The state is the whole of what a row draws from, so a row never
// has to read "running" out of a missing exit code — a command that really exits with no code and one
// that has not finished are different things and say so.
export type TaskState = 'idle' | 'running' | 'done' | 'cancelled';

export type TaskResult = {
  projectPath: string;
  state: TaskState;
  // Null until it has finished. A cancelled run has none either: it was killed, not answered.
  exitCode: number | null;
  // What the command last said, already stripped of escape codes. Empty when it said nothing.
  lastLine: string;
  // The last few lines, for the row you have opened. Built by main through the same tailLines the
  // manager's pane rows use, so both screens mean the same thing by "the last few lines".
  tail: string[];
};

// The sequences a command writes to colour a word or move the cursor: the CSI ones every tool uses,
// and the OSC ones that set a terminal title. Stripped rather than drawn, because a row is one line of
// plain text and a raw `\u001B[2K` in the middle of it reads as a bug in this app.
const ESCAPE_SEQUENCE = /\u001B\[[0-9;?]*[A-Za-z]|\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)/g;

// Raw output as lines a person could read: escape codes gone, and every line resolved to what it
// finally said. A progress bar redraws one line forever with carriage returns, so what survives is
// whatever followed the last one — right for a bar that finished, stale for one that was killed
// mid-sweep. Blank lines are kept here and dropped by whoever is counting, because dropping them this
// early would make "the last five lines" mean different things in different callers.
export function printableLines(output: string): string[] {
  return output
    .replaceAll(ESCAPE_SEQUENCE, '')
    .split('\n')
    .map((line) => (line.split('\r').at(-1) ?? '').trim());
}

// What the command last said. A tool whose final act is a blank separator has its real message one
// line further up, so blanks are skipped rather than counted.
export function lastPrintableLine(output: string): string {
  return printableLines(output).filter((line) => line !== '').at(-1) ?? '';
}

// What a project's row says to the right of its name. One place, so the row and the status bar cannot
// word the same result two ways.
export function taskSummary(result: TaskResult): string {
  if (result.state === 'idle') return '—';
  if (result.state === 'running') return 'running';
  if (result.state === 'cancelled') return 'cancelled';
  const exit = `exit ${result.exitCode ?? 0}`;
  return result.lastLine === '' ? exit : `${exit} · ${result.lastLine}`;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/tasks.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/tasks.ts src/tasks.test.ts
git commit -m "command: what a run did in one project, and the line a row prints"
```

---

### Task 2: The sections, and where Alt+H and Alt+L land

**Files:**
- Create: `src/manager-sections.ts`
- Test: `src/manager-sections.test.ts`
- Modify: `src/modes.ts`

**Interfaces:**
- Consumes: `Mode` from `./modes`.
- Produces:
  - `SECTIONS: readonly { name: string; mode: Mode }[]`
  - `sectionIndex(mode: Mode): number` — `-1` when the mode is not a section
  - `nextSectionMode(mode: Mode, direction: 'previous' | 'next'): Mode`
  - `MODES` in `modes.ts` gains `'command'`

- [ ] **Step 1: Add the mode**

In `src/modes.ts`, change the `MODES` line to include `command`, and add the
sentence saying why it has no key. The file becomes:

```ts
// A page shows one of these at a time. A project opens as terminals and moves between the first three;
// the manager page has only its own three and never leaves them.
export const MODES = ['terminals', 'nvim', 'board', 'manager', 'command'] as const;
export type Mode = typeof MODES[number];

// Not what the handler reads any more — the three mode actions in actions.ts can be rebound, and
// mapShortcut matches those. This is what session.ts checks a saved mode against before restoring it,
// which is why manager is not here: only projects are saved, and no key selects it. Nor is command,
// for the same reason and one more — it has no key at all. You reach it from the manager's strip,
// which is the point of having a strip.
export const MODE_KEYS: Record<string, Mode> = { t: 'terminals', n: 'nvim', b: 'board' };
```

- [ ] **Step 2: Write the failing test**

Create `src/manager-sections.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SECTIONS, nextSectionMode, sectionIndex } from './manager-sections';

describe('SECTIONS', () => {
  it('is the order the strip prints, general first', () => {
    expect(SECTIONS.map((section) => section.name)).toEqual(['general', 'board', 'command']);
  });
});

describe('sectionIndex', () => {
  it('finds the section a mode is showing', () => {
    expect(sectionIndex('manager')).toBe(0);
    expect(sectionIndex('command')).toBe(2);
  });

  it('answers -1 for a mode that is no section of the manager', () => {
    expect(sectionIndex('terminals')).toBe(-1);
    expect(sectionIndex('nvim')).toBe(-1);
  });
});

describe('nextSectionMode', () => {
  it('walks right and left along the strip', () => {
    expect(nextSectionMode('manager', 'next')).toBe('board');
    expect(nextSectionMode('board', 'next')).toBe('command');
    expect(nextSectionMode('command', 'previous')).toBe('board');
  });

  it('does not wrap at either end', () => {
    expect(nextSectionMode('manager', 'previous')).toBe('manager');
    expect(nextSectionMode('command', 'next')).toBe('command');
  });

  it('leaves a mode that is no section of the manager where it is', () => {
    expect(nextSectionMode('terminals', 'next')).toBe('terminals');
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run src/manager-sections.test.ts`
Expected: FAIL — `Failed to resolve import "./manager-sections"`.

- [ ] **Step 4: Write `src/manager-sections.ts`**

```ts
import { clampIndex } from './clamp-index';
import type { Mode } from './modes';

// The named views along the top of the manager page, in the order the strip prints them.
//
// This array is the order, and nothing else decides it: the strip draws it, Alt+H and Alt+L walk it,
// and a fourth section is a fourth row here and a view in the renderer. Which section is showing is
// asked of the page's mode rather than kept beside it, because the mode and the view on screen are
// already one fact — a second copy of "which section" is a second thing to keep in step, and it would
// be the one that goes stale.
export const SECTIONS: readonly { name: string; mode: Mode }[] = [
  { name: 'general', mode: 'manager' },
  { name: 'board', mode: 'board' },
  { name: 'command', mode: 'command' },
];

// Where this mode sits on the strip, or -1 for a mode the manager never shows. Board is a mode the
// manager shares with every project, so this alone does not say you are on the manager — the scope of
// the keys does that, and this only says where they land.
export function sectionIndex(mode: Mode): number {
  return SECTIONS.findIndex((section) => section.mode === mode);
}

// Where Alt+H and Alt+L land. The strip does not wrap: Alt+H on the first section stays on it, the way
// the manager's own list stops at its last row rather than carrying you back to the top. Holding a key
// to get to the end should stop at the end.
export function nextSectionMode(mode: Mode, direction: 'previous' | 'next'): Mode {
  const index = sectionIndex(mode);
  if (index === -1) return mode;
  return SECTIONS[clampIndex(index + (direction === 'next' ? 1 : -1), SECTIONS.length - 1)].mode;
}
```

- [ ] **Step 5: Run it and watch it pass**

Run: `npx vitest run src/manager-sections.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Run the whole suite and the type check**

Run: `npx vitest run && npx tsc --noEmit`

Expected: `tsc` FAILS, and this is the point of running it now. Adding
`'command'` to `MODES` breaks every `Record<Mode, …>` that does not have a
`command` key — `MODE_NAMES` and `BLURBS` in `src/help.ts`. Add both now,
because a half-typed repo is not a place to stop:

In `src/help.ts`, `MODE_NAMES` becomes:

```ts
export const MODE_NAMES: Record<Mode, string> = {
  terminals: 'Terminals', nvim: 'nvim', board: 'Board', manager: 'Manager', command: 'Command',
};
```

and `BLURBS` gains a `command` entry. Write the real blurb now — a placeholder
here is a help dialog that lies, and Task 8 has nothing left to add if this one
is right:

```ts
  command: 'One command, run in the projects you mark, with the answers side by side. Type it once — '
    + '`npm audit`, `npm outdated`, the test suite — press Enter, and every marked project gets its own '
    + 'process. Not a pane: a command run here never touches the five shells, so whatever was in them '
    + 'is still there. Each row shows how its project exited and the last line it printed, and Enter on '
    + 'a finished row shows the last few lines under it. Escape stops a run. '
    + 'The last line is a guess and this screen does not pretend otherwise: a command whose final act '
    + 'is to redraw a progress bar shows that bar. Reading `npm audit` properly — three high, none '
    + 'moderate — would need a parser per tool, and every tool words it differently. '
    + 'The command you typed lasts while the app is running and is gone on restart, and so are the '
    + 'results: a run answers a question you are asking now, and is not a record of anything.',
```

Then run `npx tsc --noEmit` again.
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modes.ts src/manager-sections.ts src/manager-sections.test.ts src/help.ts
git commit -m "manager: three named sections, and a command mode to hold the third"
```

---

### Task 3: A scope that means "any section of the manager"

**Files:**
- Modify: `src/actions.ts` (the `ActionScope` type, and a new `scopesOverlap`)
- Modify: `src/shortcuts.ts` (`hears`, `mapShortcut`)
- Modify: `src/settings.ts:137` (`holderOfBinding`)
- Modify: `src/renderer.ts:667` (the one `mapShortcut` call)
- Modify: `src/actions.test.ts:36`, `src/shortcuts.test.ts:132,141`
- Test: `src/shortcuts.test.ts`, `src/settings.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `ActionScope` gains `'manager-page'`
  - `scopesOverlap(one: ActionScope, other: ActionScope): boolean` in `actions.ts`
  - `hears(scope: ActionScope, mode: Mode, onManagerPage: boolean): boolean`
  - `mapShortcut(input, keys, mode, onManagerPage: boolean): Action | null`

Why this exists, in one sentence for the implementer: the two strip keys must
be heard on `manager`, `board` and `command`, an action names one scope, a
scope is a mode, and two rows sharing one binding is what this app treats as a
corrupted settings file.

- [ ] **Step 1: Write the failing tests**

Add to `src/shortcuts.test.ts`:

```ts
describe('hears, on the manager page', () => {
  it('hears a manager-page key on every section the manager has', () => {
    expect(hears('manager-page', 'manager', true)).toBe(true);
    expect(hears('manager-page', 'board', true)).toBe(true);
    expect(hears('manager-page', 'command', true)).toBe(true);
  });

  it('does not hear it on a project, including on a project board', () => {
    expect(hears('manager-page', 'board', false)).toBe(false);
    expect(hears('manager-page', 'terminals', false)).toBe(false);
  });

  it('leaves every other scope deciding by mode alone', () => {
    expect(hears('board', 'board', false)).toBe(true);
    expect(hears('board', 'manager', true)).toBe(false);
    expect(hears('global', 'terminals', false)).toBe(true);
  });
});
```

Add to `src/settings.test.ts`:

```ts
describe('holderOfBinding, across overlapping scopes', () => {
  it('sees a manager-page key and a board key as holding the same key', () => {
    // They really do collide: the manager's board is board mode on the manager page, so both are
    // heard there at once.
    expect(scopesOverlap('manager-page', 'board')).toBe(true);
    expect(scopesOverlap('board', 'manager-page')).toBe(true);
  });

  it('sees two screens that are never on at once as free of each other', () => {
    expect(scopesOverlap('terminals', 'board')).toBe(false);
    expect(scopesOverlap('terminals', 'manager-page')).toBe(false);
  });

  it('has global colliding with everything', () => {
    expect(scopesOverlap('global', 'terminals')).toBe(true);
    expect(scopesOverlap('manager-page', 'global')).toBe(true);
  });
});
```

Add `scopesOverlap` to the imports at the top of `src/settings.test.ts` from
`./actions`, and `hears` is already imported in `src/shortcuts.test.ts`.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/shortcuts.test.ts src/settings.test.ts`
Expected: FAIL — `scopesOverlap is not exported`, and `hears` takes two
arguments.

- [ ] **Step 3: Widen the scope in `src/actions.ts`**

Replace the `ActionScope` declaration and its comment with:

```ts
// Which screens hear the key. `global` is heard everywhere, including while a shell has the keyboard.
// `terminals`, `board`, `manager` and `command` are each heard only on their own screen, so the
// board's bare `D` never reaches a terminal.
//
// `manager-page` is the one that is not a mode: it means any section of the manager, whichever of its
// three views is showing. The strip keys need it, because they have to work on all three and an action
// may name only one scope — two rows sharing a binding is what this app already treats as a
// hand-edited settings file. It cannot be answered from the mode alone, because `board` is a mode the
// manager shares with every project, so `hears` is told which page you are on.
export type ActionScope = 'global' | 'terminals' | 'board' | 'manager' | 'command' | 'manager-page';
```

Add, just below it:

```ts
// Whether two actions can be heard at the same moment, which is the whole of what "these two want the
// same key" means. Exported because two places ask it and they must not each hold their own idea of
// it: `hears` decides whether a key fires, and the settings screen decides whether to warn you that
// something else already has it. Let those drift and the screen offers you a key that silently loses
// to another one — or warns about a clash that cannot happen.
//
// Scopes are not a flat list of equals: `global` is heard everywhere, and `manager-page` covers the
// three modes the manager shows.
export function scopesOverlap(one: ActionScope, other: ActionScope): boolean {
  if (one === 'global' || other === 'global' || one === other) return true;
  const pair = [one, other];
  return pair.includes('manager-page')
    && pair.some((scope) => scope !== 'manager-page' && sectionIndex(scope as Mode) !== -1);
}
```

and at the top of `src/actions.ts` add to the imports:

```ts
import { sectionIndex } from './manager-sections';
import type { Mode } from './modes';
```

`actions.ts` already imports `projectPosition` from `./manager`; `Mode` is
already imported there as `import type { Mode } from './modes';` — check
before adding a duplicate import line.

- [ ] **Step 4: Teach `hears` and `mapShortcut` which page you are on**

In `src/shortcuts.ts`, replace `hears` and the loop in `mapShortcut`:

```ts
// `global` is heard on every screen, including while a shell has the keyboard. A scope named after a
// mode is heard only on that screen, which is what lets the board keep a bare D that a terminal never
// sees. `manager-page` is the exception that needs more than the mode: the manager shows three views
// and one of them is board mode, which every project also has, so the page has to say whether it is
// the manager. The renderer knows — the manager is the page holding MANAGER_SLOT.
export function hears(scope: ActionScope, mode: Mode, onManagerPage: boolean): boolean {
  if (scope === 'global') return true;
  if (scope === 'manager-page') return onManagerPage && sectionIndex(mode) !== -1;
  return scope === mode;
}

export function mapShortcut(
  input: KeyInput,
  keys: Settings['keys'],
  mode: Mode = 'terminals',
  onManagerPage = false,
): Action | null {
  for (const entry of ACTIONS) {
    if (!hears(entry.scope, mode, onManagerPage)) continue;
    ...
```

Add `import { sectionIndex } from './manager-sections';` to `shortcuts.ts`.
Leave the rest of `mapShortcut` untouched.

- [ ] **Step 5: Have the settings screen ask the same question**

In `src/settings.ts`, `holderOfBinding` currently ends with a line comparing
scopes. Replace that comparison with the exported predicate:

```ts
    if (!scopesOverlap(one.scope, other.scope)) continue;
```

Match the surrounding shape of the function — it is a loop over `ACTIONS`
around line 137, so read it before editing. Add `scopesOverlap` to the existing
`./actions` import at the top of the file.

- [ ] **Step 6: Fix the three existing callers**

- `src/renderer.ts:667` — `mapShortcut(event, settings.keys, pages[activeIndex].mode)` gains a fourth
  argument. The manager is the page holding `MANAGER_SLOT`, and `isProjectPage`
  in `manager.ts` is the one place that already answers this, so ask it rather
  than comparing the slot here:

```ts
  const page = pages[activeIndex];
  const action = mapShortcut(event, settings.keys, page.mode, !isProjectPage(page));
```

  `isProjectPage` is already imported in `renderer.ts` — check line 30 before
  adding it.

- `src/actions.test.ts:36` — `hears(entry.scope, mode)` becomes
  `hears(entry.scope, mode, true)`. Read the test around it first: if it is
  walking every scope on every mode, `true` is the right value because it makes
  the manager-page rows reachable; if it is asserting something narrower, keep
  its meaning and pass what that meaning needs.
- `src/shortcuts.test.ts:132,141` — the loop drives each screen-scoped key from
  its own scope. A `manager-page` entry has no mode to drive it from, so give
  the loop a line that maps the scope to a mode and a flag:

```ts
    // manager-page is not a mode: it is every section of the manager. Driven from its first section,
    // with the flag the renderer passes when the page you are on is the manager.
    const mode = entry.scope === 'manager-page' ? 'manager' : entry.scope;
    const onManagerPage = entry.scope === 'manager-page';
    expect(mapShortcut(pressed, keys, mode, onManagerPage), entry.name).toEqual(entry.action);
```

- [ ] **Step 7: Run everything**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add src/actions.ts src/shortcuts.ts src/settings.ts src/renderer.ts src/actions.test.ts src/shortcuts.test.ts src/settings.test.ts
git commit -m "keys: a scope that means any section of the manager, not one mode"
```

---

### Task 4: The keys — two for the strip, four for the command screen

**Files:**
- Modify: `src/actions.ts` (six new rows, one new `Action` kind group)
- Modify: `src/help.ts` (`UNBOUND_SHORTCUTS.command`)
- Test: `src/shortcuts.test.ts` (already drives every row; no new test needed)

**Interfaces:**
- Consumes: `ActionScope` gaining `'manager-page'` (Task 3), `Mode` gaining `'command'` (Task 2).
- Produces: `Action` gains
  - `{ kind: 'section-move'; direction: 'previous' | 'next' }`
  - `{ kind: 'command-select'; direction: 'up' | 'down' }`
  - `{ kind: 'command-open' }`
  - `{ kind: 'command-cancel' }`
  and `ActionGroup` gains `'command'`.

- [ ] **Step 1: Add the action kinds and the group**

In `src/actions.ts`, add to the `Action` union:

```ts
  | { kind: 'section-move'; direction: 'previous' | 'next' }
  | { kind: 'command-select'; direction: 'up' | 'down' }
  | { kind: 'command-open' }
  | { kind: 'command-cancel' }
```

and add `'command'` to `ActionGroup`.

- [ ] **Step 2: Add the six rows**

Append to `ACTIONS`, after the manager rows:

```ts
  // The strip along the top of the manager page. manager-page scope, because they have to work on all
  // three sections and one of those is board mode, which every project also has — a project's board
  // must not hear these.
  //
  // Alt+H and Alt+L are the vim directions, the same two letters terminal-move already uses for left
  // and right. That is not a clash: those are terminals scope and the manager has no terminals.
  // The arrows are deliberately not bound here. On the board they move between cards, and a pair of
  // keys that works on two sections out of three is worse to learn than one pair that always works.
  {
    name: 'section-previous', description: 'The section to the left, along the top',
    group: 'manager', scope: 'manager-page',
    action: { kind: 'section-move', direction: 'previous' }, mac: 'Alt+H', other: 'Alt+H',
  },
  {
    name: 'section-next', description: 'The section to the right, along the top',
    group: 'manager', scope: 'manager-page',
    action: { kind: 'section-move', direction: 'next' }, mac: 'Alt+L', other: 'Alt+L',
  },
  // The command screen. Bare arrows, a bare Enter and Escape, heard on this screen only. Nothing here
  // is forwarded to a pane — this is not the manager's list — so a bare key costs nothing.
  // Space is deliberately absent: it has to reach the command box as a space, and the view sends it to
  // a mark only when the selection has left that box. help.ts lists it under UNBOUND_SHORTCUTS.
  ...(['up', 'down'] as const).map((direction): ActionEntry => ({
    name: `command-select-${direction}`, description: `Move the selection ${direction}`,
    group: 'command', scope: 'command',
    action: { kind: 'command-select', direction },
    mac: ARROW_KEYS[direction === 'up' ? 'up' : 'down'], other: ARROW_KEYS[direction === 'up' ? 'up' : 'down'],
  })),
  {
    name: 'command-open', description: 'Run it, or show what a project printed',
    group: 'command', scope: 'command', action: { kind: 'command-open' }, mac: 'Enter', other: 'Enter',
  },
  {
    name: 'command-cancel', description: 'Stop a run',
    group: 'command', scope: 'command', action: { kind: 'command-cancel' },
    mac: 'Escape', other: 'Escape',
  },
```

Simplify the `ARROW_KEYS` lookup to `ARROW_KEYS[direction]` if `Direction`
already covers `'up' | 'down'` — it does, `DIRECTIONS` is
`['left','down','up','right']` — so write `mac: ARROW_KEYS[direction], other: ARROW_KEYS[direction],`.

- [ ] **Step 3: Tell the help dialog about Space**

In `src/help.ts`, `UNBOUND_SHORTCUTS` gains:

```ts
  command: [{ keys: 'Space', action: 'Mark or unmark the project under the selection' }],
```

- [ ] **Step 4: Run everything**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`

Expected: `tsc` FAILS on `renderer.ts` — `apply()`'s switch does not handle the
four new action kinds, and its `default:` branch hands them to a view that has
no `runAction` for them. That is Task 7's job. If the switch has no
exhaustiveness check and `tsc` passes, that is fine too — run the tests and
move on.

Expected from `npx vitest run`: PASS. `shortcuts.test.ts` drives every row in
the table from its own scope and now covers the six new ones.

- [ ] **Step 5: Commit**

```bash
git add src/actions.ts src/help.ts
git commit -m "keys: the strip's two, and the command screen's four"
```

---

### Task 5: Running the command — one process per project, no pane touched

**Files:**
- Modify: `src/shell.ts` (add `taskArguments`)
- Test: `src/shell.test.ts`
- Modify: `src/main.ts` (the runner and two handlers)
- Modify: `src/bridge.ts`, `src/preload.ts` (three channels)

**Interfaces:**
- Consumes: `TaskResult`, `lastPrintableLine` from `./tasks` (Task 1).
- Produces:
  - `taskArguments(shellCommand: string, command: string): string[]`
  - bridge: `runTask(command: string, projectPaths: string[]): void`,
    `cancelTasks(): void`,
    `onTaskUpdate(listener: (result: TaskResult) => void): void`

- [ ] **Step 1: Write the failing test for the shell arguments**

Add to `src/shell.test.ts`:

```ts
describe('taskArguments', () => {
  it('runs the command through a login, interactive POSIX shell', () => {
    expect(taskArguments('/bin/zsh', 'npm audit')).toEqual(['-lic', 'npm audit']);
  });

  it('uses PowerShell’s own flag where that is the shell', () => {
    expect(taskArguments('pwsh', 'npm audit')).toEqual(['-Command', 'npm audit']);
  });

  it('does not exec: the shell is the process whose exit code the row prints', () => {
    expect(taskArguments('/bin/zsh', 'npm audit')[1]).not.toContain('exec');
  });
});
```

Add `taskArguments` to the `./shell` import at the top of that file.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/shell.test.ts`
Expected: FAIL — `taskArguments is not exported`.

- [ ] **Step 3: Add `taskArguments` to `src/shell.ts`**

Append to the file:

```ts
// A command run across projects goes through the user's shell, login and interactive, for the same
// reason spelled out above editorArguments: an app launched from the Dock inherits almost no PATH, so
// `npm` is not found unless the shell's own startup files have run. `-l` is where Homebrew is and `-i`
// is where fnm, nvm, rbenv, pyenv and mise are, and a command needs both.
//
// No `exec`, unlike the panes. Nothing is taking this process over — the shell is the thing whose exit
// code a row prints, and it has to survive to report it.
//
// `-i` with no terminal attached is the one thing here that is new: a shell started interactive
// without a tty can complain about job control on stderr, and that complaint is then part of the
// output a row takes its last line from. If it turns out to be, the fix is to prefer the last line of
// stdout and fall back to stderr only when stdout is empty.
export function taskArguments(shellCommand: string, command: string): string[] {
  return isPowerShell(shellCommand) ? ['-Command', command] : ['-lic', command];
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/shell.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the runner to `src/main.ts`**

Add `spawn` to the existing `node:child_process` import (the file already
imports `execFile` on line 2), add
`import { lastPrintableLine, printableLines, type TaskResult } from './tasks';`,
add `tailLines` to the existing `./manager` import if there is one — otherwise
`import { tailLines } from './manager';` — and add `taskArguments` to the
existing `./shell` import.

Then add, near the other `ipcMain` handlers:

```ts
// Every process the current run started, each beside the project it is running in. The path is kept
// here because cancelling has to name every project it stopped — a row told nothing sits on `running`
// forever, and the process it was waiting for is already dead.
let runningTasks: { child: ReturnType<typeof spawn>; run: number; projectPath: string }[] = [];
// Which run a process belongs to. Without it, killing run 3 and starting run 4 in the same breath lets
// run 3's dying processes report "cancelled" for projects run 4 has already marked "running" — the
// row goes backwards in front of you and stays wrong until the next run.
let currentRun = 0;

function killTask(child: ReturnType<typeof spawn>): void {
  try {
    // The negative pid is the process group, which is what `detached` bought: `npm audit` spawns
    // children, and killing only the shell leaves them running with nothing on screen naming them.
    // Windows has no process groups to kill this way, so the child goes on its own there.
    if (process.platform === 'win32' || child.pid === undefined) child.kill();
    else process.kill(-child.pid, 'SIGTERM');
  } catch {
    // Already gone.
  }
}

function stopTasks(): void {
  for (const task of runningTasks) killTask(task.child);
  runningTasks = [];
}

function sendTask(result: TaskResult): void {
  mainWindow?.webContents.send('task:update', result);
}

ipcMain.on('task:run', (_event, command: string, projectPaths: string[]) => {
  stopTasks();
  currentRun += 1;
  const run = currentRun;
  for (const projectPath of projectPaths) {
    sendTask({ projectPath, state: 'running', exitCode: null, lastLine: '', tail: [] });
    // Not a pty and not one of the five panes: a command that borrows a shell throws away whatever was
    // in it, which is the whole reason this screen exists rather than sending keystrokes to panes.
    const child = spawn(shellCommand, taskArguments(shellCommand, command), {
      cwd: projectPath, detached: process.platform !== 'win32',
      env: process.env as Record<string, string>,
    });
    // Both streams into one buffer. A tool that reports on stderr — most of them, for a summary — would
    // otherwise leave the row showing the last thing it happened to say on stdout.
    let output = '';
    child.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr?.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    // The shell itself could not be started. There is no exit code for that, so the row says the one
    // a shell says for a command it cannot find, and the message is what the last line shows.
    child.on('error', (error: Error) => {
      if (run !== currentRun) return;
      runningTasks = runningTasks.filter((task) => task.child !== child);
      sendTask({ projectPath, state: 'done', exitCode: 127, lastLine: error.message, tail: [error.message] });
    });
    child.on('close', (code: number | null, signal: string | null) => {
      if (run !== currentRun) return;
      runningTasks = runningTasks.filter((task) => task.child !== child);
      sendTask({
        projectPath,
        // A signal rather than a code is this app killing it, which is the only thing that sends one
        // here. A command that dies of its own signal is rare enough to read as cancelled.
        state: signal === null ? 'done' : 'cancelled',
        exitCode: code,
        lastLine: lastPrintableLine(output),
        // The same five lines, chosen by the same rule, as the manager's pane rows.
        tail: tailLines(printableLines(output)),
      });
    });
    runningTasks.push({ child, run, projectPath });
  }
});

ipcMain.on('task:cancel', () => {
  // Every stopped project is named back. A row told nothing sits on `running` for as long as the app
  // is open, waiting for a process that is already dead.
  //
  // The paths are read before the processes are killed, and the run number moves with them, so each
  // project is told "cancelled" exactly once — from here, rather than a second time as its own close
  // event arrives with a signal on it.
  const paths = runningTasks.map((task) => task.projectPath);
  stopTasks();
  currentRun += 1;
  for (const projectPath of paths) {
    sendTask({ projectPath, state: 'cancelled', exitCode: null, lastLine: '', tail: [] });
  }
});
```

Find how `mainWindow` is named in this file before using it — it may be
`window` or held differently. Match what `notification:click` already does to
send to the renderer.

- [ ] **Step 6: Add the three channels**

In `src/bridge.ts`, add to `DashboardBridge`:

```ts
  // One command, run in each of these projects at once, each in its own process. Not a pty and not a
  // pane: a command that borrows a shell throws away whatever was in it.
  runTask(command: string, projectPaths: string[]): void;
  // Stop whatever is still going. Every project that was stopped is named back through onTaskUpdate.
  cancelTasks(): void;
  // One per project, twice: when it starts and when it finishes. Per project rather than one answer at
  // the end, because a row still saying `running` beside four that have answered is the point of the
  // screen.
  onTaskUpdate(listener: (result: TaskResult) => void): void;
```

and `import type { TaskResult } from './tasks';` at the top.

In `src/preload.ts`, add to the bridge object:

```ts
  runTask: (command, projectPaths) => ipcRenderer.send('task:run', command, projectPaths),
  cancelTasks: () => ipcRenderer.send('task:cancel'),
  onTaskUpdate: (listener) =>
    ipcRenderer.on('task:update', (_event, result) => listener(result)),
```

- [ ] **Step 7: Run everything**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: PASS, apart from whatever `renderer.ts` still owes from Task 4.

- [ ] **Step 8: Commit**

```bash
git add src/shell.ts src/shell.test.ts src/main.ts src/bridge.ts src/preload.ts
git commit -m "command: one process per project, through the shell that has a PATH"
```

---

### Task 6: The command screen

**Files:**
- Create: `src/command-view.ts`
- Modify: nothing else

**Interfaces:**
- Consumes: `TaskResult`, `taskSummary`, `lastPrintableLine` (Task 1);
  `Action` kinds `command-select`, `command-open`, `command-cancel` (Task 4);
  `isBareCharacter` from `./shortcuts`; `clampIndex`, `heldIndex` from
  `./clamp-index`.
- Produces:

```ts
export type CommandOptions = {
  projects(): readonly { name: string; path: string }[];
  runTask(command: string, projectPaths: string[]): void;
  cancelTasks(): void;
  onChanged(): void;
};

export type CommandView = {
  element: HTMLElement;
  render(): void;
  statusLabel(): string;
  runAction(action: Action): void;
  // One result in, from main. The view redraws itself and tells the renderer, so the status bar moves
  // with it.
  update(result: TaskResult): void;
  focus(): void;
};

export function createCommandView(options: CommandOptions): CommandView;
```

The shape deliberately mirrors `ManagerView` — same fields, same four calls —
so `renderer.ts` holds it the way it already holds the other two.

- [ ] **Step 1: Write `src/command-view.ts`**

```ts
import type { Action } from './actions';
import { clampIndex } from './clamp-index';
import { isBareCharacter } from './shortcuts';
import { taskSummary, type TaskResult } from './tasks';

export type CommandProject = { name: string; path: string };

export type CommandOptions = {
  // Every open project, asked for again on every arrival rather than handed over once, so a project
  // opened since you were last here has a row.
  projects(): readonly CommandProject[];
  runTask(command: string, projectPaths: string[]): void;
  cancelTasks(): void;
  // Redraws the status bar, which names what the selection is on.
  onChanged(): void;
};

export type CommandView = {
  element: HTMLElement;
  render(): void;
  statusLabel(): string;
  runAction(action: Action): void;
  update(result: TaskResult): void;
  focus(): void;
};

// The command box is the first thing the selection walks over, and the project rows follow it.
const COMMAND_ROW = 0;

// What each project answered, keyed by path — which is what a result names. The result carries its own
// tail, so how many lines an opened row shows is main's answer and this file holds no second opinion
// about it.

export function createCommandView(options: CommandOptions): CommandView {
  const element = document.createElement('div');
  element.className = 'view view-command';
  // Focusable, so the selection can leave the command box and Space stops being a space. That is the
  // whole mechanism: while the box has the keyboard a space is typed into it, and while this element
  // has it a space is a mark. Nothing has to decide which — whichever has focus answers.
  element.tabIndex = -1;

  const label = document.createElement('label');
  label.className = 'command-label';
  label.textContent = 'Command';
  const input = document.createElement('input');
  input.className = 'command-input';
  input.type = 'text';
  input.placeholder = 'npm audit';
  // Every box you type into carries this. Without it a Persian command runs away from the caret and
  // Home and End go to the opposite ends of what you see.
  input.dir = 'auto';
  label.append(input);

  const list = document.createElement('ul');
  list.className = 'command-list';
  const empty = document.createElement('p');
  empty.textContent = 'No project is open, so there is nothing to run a command in.';
  const keys = document.createElement('p');
  keys.className = 'command-keys';
  keys.textContent = 'Enter runs it · Space marks a project · Escape cancels';
  element.append(label, list, empty, keys);

  // Which projects a run covers. Everything starts marked, so a command typed and Enter pressed runs
  // everywhere — the common case costs no marking at all. Held by path rather than by position: a
  // project opened in front of another must not hand its mark to somebody else.
  const unmarked = new Set<string>();
  // Which rows are showing their output. Same reasoning, same shape.
  const opened = new Set<string>();
  const results = new Map<string, TaskResult>();
  let selected = COMMAND_ROW;
  let running = false;

  function projects(): readonly CommandProject[] {
    return options.projects();
  }

  function rowCount(): number {
    return projects().length + 1;
  }

  // The project the selection is on, or null when it is on the command box.
  function selectedProject(): CommandProject | null {
    return selected === COMMAND_ROW ? null : projects()[selected - 1] ?? null;
  }

  function resultFor(path: string): TaskResult {
    return results.get(path)
      ?? { projectPath: path, state: 'idle', exitCode: null, lastLine: '', tail: [] };
  }

  // The keyboard follows the selection between the box and the list, which is what makes Space two
  // different keys without a branch deciding it.
  function focusSelection(): void {
    if (selected === COMMAND_ROW) input.focus();
    else element.focus();
  }

  function move(direction: 'up' | 'down'): void {
    selected = clampIndex(selected + (direction === 'down' ? 1 : -1), rowCount() - 1);
    render();
    focusSelection();
    options.onChanged();
  }

  function toggleMark(project: CommandProject): void {
    if (unmarked.has(project.path)) unmarked.delete(project.path);
    else unmarked.add(project.path);
  }

  function run(): void {
    const command = input.value.trim();
    if (command === '') return;
    const paths = projects().map((project) => project.path).filter((path) => !unmarked.has(path));
    if (paths.length === 0) return;
    running = true;
    // Last run's answers go as this one starts. A row showing yesterday's exit code beside four that
    // say `running` is a row you will read as this run's.
    for (const path of paths) results.delete(path);
    options.runTask(command, paths);
    render();
    options.onChanged();
  }

  // Enter: run it from the box, or open what a project printed from a row. One key, and what it does
  // is whatever the row it is on does — the same arrangement the manager's list has.
  function open(): void {
    const project = selectedProject();
    if (project === null) return run();
    // A row with nothing under it does not open. The selection has already moved here by now, so the
    // click that landed on it still did its half of the job.
    if (resultFor(project.path).tail.length === 0) return;
    if (opened.has(project.path)) opened.delete(project.path);
    else opened.add(project.path);
    render();
    options.onChanged();
  }

  function cancel(): void {
    if (!running) return;
    options.cancelTasks();
  }

  function projectRow(project: CommandProject, index: number): HTMLElement {
    const item = document.createElement('li');
    item.className = 'command-project';
    const mark = document.createElement('span');
    mark.className = 'command-mark';
    // A span of its own, so the name beside it holds a folder's name and nothing else — a marker
    // sharing that span crosses to the far side of a Persian name and stops lining up.
    mark.textContent = unmarked.has(project.path) ? '▢ ' : '▣ ';
    const name = document.createElement('span');
    name.className = 'command-name';
    name.textContent = project.name;
    const summary = document.createElement('span');
    summary.className = 'command-summary';
    summary.textContent = taskSummary(resultFor(project.path));

    const lines = resultFor(project.path).tail;
    const tail = document.createElement('pre');
    tail.className = 'command-tail';
    tail.textContent = lines.join('\n');
    tail.hidden = !opened.has(project.path) || lines.length === 0;
    item.append(mark, name, summary, tail);

    // A click moves the selection to the row first and then does what Enter does there.
    item.addEventListener('click', () => {
      selected = index + 1;
      render();
      focusSelection();
      open();
      options.onChanged();
    });
    if (selected === index + 1) item.classList.add('highlighted');
    return item;
  }

  function render(): void {
    const rows = projects();
    selected = clampIndex(selected, rowCount() - 1);
    empty.hidden = rows.length > 0;
    label.classList.toggle('highlighted', selected === COMMAND_ROW);
    keys.textContent = running
      ? 'Escape stops it'
      : 'Enter runs it · Space marks a project · Escape cancels';
    list.replaceChildren(...rows.map((project, index) => projectRow(project, index)));
  }

  // Everything the window did not claim. Only Space, and only once the selection has left the command
  // box — while the box has the keyboard this listener never sees it, because the space is typed.
  // isBareCharacter is what keeps a modified key out; shortcuts.ts says why.
  element.addEventListener('keydown', (event) => {
    if (!isBareCharacter(event) || event.key !== ' ') return;
    const project = selectedProject();
    if (project === null) return;
    event.preventDefault();
    toggleMark(project);
    render();
    options.onChanged();
  });

  return {
    element,
    render,
    statusLabel(): string {
      const project = selectedProject();
      if (project === null) {
        return running ? 'command · running · Escape stops it' : 'command · Enter runs it';
      }
      const marked = unmarked.has(project.path) ? 'not marked' : 'marked';
      return `${project.name} · ${marked} · ${taskSummary(resultFor(project.path))}`;
    },
    runAction(action: Action): void {
      if (action.kind === 'command-select') return move(action.direction);
      if (action.kind === 'command-open') return open();
      if (action.kind === 'command-cancel') return cancel();
    },
    update(result: TaskResult): void {
      results.set(result.projectPath, result);
      // Whether anything is still going, asked of the results rather than counted as they arrive: a
      // cancel answers every project at once, and a tally kept by hand would have to be right about
      // how many of those it had already seen.
      running = [...results.values()].some((entry) => entry.state === 'running');
      // A row whose output has just gone shuts itself, rather than staying open over nothing and
      // leaving a gap under the name.
      if (result.tail.length === 0) opened.delete(result.projectPath);
      render();
      options.onChanged();
    },
    focus(): void {
      focusSelection();
    },
  };
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint src/command-view.ts`
Expected: PASS for `command-view.ts` itself. `renderer.ts` may still owe Task 7.

- [ ] **Step 3: Commit**

```bash
git add src/command-view.ts
git commit -m "command: the screen — a box, the projects, and what each one answered"
```

---

### Task 7: The strip, and wiring the screen into the manager page

**Files:**
- Create: `src/section-strip.ts`
- Modify: `src/renderer.ts` (`buildManagerPage`, `apply`, `focusMode`, the views record)
- Modify: `src/status.ts` (`StatusPage`, `modeLabel`)
- Test: `src/status.test.ts`

**Interfaces:**
- Consumes: `SECTIONS`, `nextSectionMode` (Task 2); `createCommandView` (Task 6);
  action kinds `section-move`, `command-*` (Task 4).
- Produces:
  - `createSectionStrip(onPick: (mode: Mode) => void): { element: HTMLElement; render(mode: Mode): void }`
  - `StatusPage` gains `commandStatusLabel: string`

- [ ] **Step 1: Write `src/section-strip.ts`**

```ts
import { SECTIONS } from './manager-sections';
import type { Mode } from './modes';

export type SectionStrip = { element: HTMLElement; render(mode: Mode): void };

// The names along the top of the manager page. It sits above the views rather than inside one, because
// it has to be on screen whichever of the three is showing — a strip that vanished with its own
// section would be a strip you could only see from one place.
//
// It holds no state. Which section is current is the page's mode, which the renderer already keeps, so
// this is handed the answer on every redraw rather than keeping a second copy to go stale.
export function createSectionStrip(onPick: (mode: Mode) => void): SectionStrip {
  const element = document.createElement('nav');
  element.className = 'section-strip';
  const names = SECTIONS.map((section) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'section-name';
    item.textContent = section.name;
    // A click goes to that section, which is what the key does. Every control in this app answers the
    // keyboard first and the pointer to the same place.
    item.addEventListener('click', () => onPick(section.mode));
    element.append(item);
    return { item, mode: section.mode };
  });

  return {
    element,
    render(mode: Mode): void {
      for (const name of names) name.item.classList.toggle('current', name.mode === mode);
    },
  };
}
```

- [ ] **Step 2: Build it into the manager page**

In `renderer.ts`, in `buildManagerPage`, after `createCardsView(...)`:

```ts
  const command = createCommandView({
    projects: () => projectPages().map((entry) => ({
      name: entry.project.name, path: entry.project.path,
    })),
    runTask: (text, paths) => bridge.runTask(text, paths),
    cancelTasks: () => bridge.cancelTasks(),
    onChanged: renderStatus,
  });
  // Above the three views rather than inside one, so it is on screen whichever section is showing.
  const strip = createSectionStrip((mode) => setMode(mode));
  element.append(strip.element, manager.element, cards.element, command.element);
```

Change the `Page` literal so the views record and the page carry it:

```ts
    views: { manager: manager.element, board: cards.element, command: command.element },
    ...
    board: cards, manager, command, strip,
```

and add `command: CommandView | null;` and `strip: SectionStrip | null;` to the
`Page` type near line 67, beside `manager`, with a comment saying only the
manager page has them.

`buildPage` (the project pages) sets both to `null`.

- [ ] **Step 3: Redraw the strip whenever the mode moves**

`showMode` is where the mode and the view on screen are set together, so the
strip is redrawn there — one place, and a page restored without being arrived
at gets a correct strip too:

```ts
function showMode(page: Page, mode: Mode): void {
  page.mode = mode;
  for (const [name, view] of Object.entries(page.views)) if (view) view.hidden = name !== mode;
  page.strip?.render(mode);
}
```

- [ ] **Step 4: Give the command screen the keyboard and a fresh draw on arrival**

In `focusMode`, add beside the `manager` line:

```ts
  if (page.mode === 'command' && page.command) {
    // Re-read on arrival, the way the board is: a project opened since you were last here needs a row.
    if (entering) page.command.render();
    page.command.focus();
  }
```

- [ ] **Step 5: Dispatch the four new actions**

In `apply`, before the `default:` line:

```ts
    case 'section-move': return setMode(nextSectionMode(page.mode, action.direction));
    case 'command-select':
    case 'command-open':
    case 'command-cancel': return page.command?.runAction(action);
```

Import `nextSectionMode` from `./manager-sections` and `createCommandView`,
`type CommandView` from `./command-view`, `createSectionStrip`,
`type SectionStrip` from `./section-strip`.

- [ ] **Step 6: Feed results back in**

Near the other `bridge.on*` listeners at the bottom of `renderer.ts`:

```ts
// Results arrive one project at a time, from whichever run is going. The manager page is built before
// the first one can land, so there is always a view to hand it to.
bridge.onTaskUpdate((result) => {
  pages.find((page) => page.command)?.command?.update(result);
});
```

- [ ] **Step 7: The status bar**

In `src/status.ts`, add to `StatusPage`:

```ts
  commandStatusLabel: string;
```

and to `modeLabel`, beside the `manager` branch:

```ts
  if (page.mode === 'command') return page.commandStatusLabel;
```

In `renderer.ts`, `renderStatus` builds the `StatusPage` — add
`commandStatusLabel: page.command?.statusLabel() ?? '',` beside the existing
`managerStatusLabel` line at 165.

Add to `src/status.test.ts`:

```ts
  it('lets the command screen name what the selection is on', () => {
    expect(modeLabel(statusPage({ mode: 'command', commandStatusLabel: 'api · marked · exit 0' })))
      .toBe('api · marked · exit 0');
  });
```

Read the existing helper in that file that builds a `StatusPage` and use it;
add `commandStatusLabel: ''` to its defaults so every other test still compiles.

- [ ] **Step 8: Run everything**

Run: `npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add src/section-strip.ts src/renderer.ts src/status.ts src/status.test.ts
git commit -m "manager: a named strip above the three sections, and the command screen behind it"
```

---

### Task 8: The look of it, and the help dialog telling the truth

**Files:**
- Modify: `src/index.css`
- Modify: `src/help.ts` (the `manager` blurb)
- Modify: `CLAUDE.md` (the `dir="auto"` count)

- [ ] **Step 1: Style the strip and the screen**

Add to `src/index.css`, following the shapes already in the file — read
`.manager-list`, `.manager-project`, `.manager-name`, `.manager-summary` and
`.manager-tail` and match their spacing, colours and variables rather than
inventing new ones:

```css
.section-strip { display: flex; gap: 1.5rem; padding: 0.75rem 1rem 0; }
.section-name {
  background: none; border: 0; padding: 0 0 0.35rem; cursor: pointer;
  color: var(--muted); font: inherit; border-bottom: 2px solid transparent;
}
.section-name.current { color: var(--foreground); border-bottom-color: var(--accent); }

.view-command { padding: 1rem; overflow-y: auto; }
.command-label { display: flex; align-items: center; gap: 0.75rem; }
.command-label.highlighted { outline: 2px solid var(--accent); outline-offset: 4px; }
.command-input { flex: 1; font: inherit; }
.command-list { list-style: none; margin: 1rem 0; padding: 0; }
.command-project { display: grid; grid-template-columns: auto 12rem 1fr; gap: 0.5rem; padding: 0.2rem 0.4rem; }
.command-project.highlighted { background: var(--selection); }
.command-tail { grid-column: 1 / -1; margin: 0.3rem 0 0.6rem; white-space: pre-wrap; color: var(--muted); }
.command-keys, .command-summary { color: var(--muted); }
```

Use the variable names this file actually defines. If `--selection`,
`--muted` or `--accent` are not among them, use whichever the manager rows
already use for the same job.

- [ ] **Step 2: Rewrite the manager blurb**

The `manager` blurb in `src/help.ts` says the page "has two views" and that
"the board key shows the other one". Both are now wrong. Replace that opening
with:

```ts
  manager: 'The first tab, and the only page that is not a project: no folder and no shells, so the '
    + 'terminal and nvim keys do nothing here. It is where the window lands when nothing was open last '
    + 'time. Three sections are named along the top — general, board, command — and Alt+H and Alt+L '
    + 'walk between them, from any of the three. The arrows are not those keys: on the board they move '
    + 'between cards. The board key still comes straight here to the board. '
    + 'This one lists every open project and what its panes want from you — one asking a question, one that '
    + 'has died and needs starting again. Enter on a project shows those panes by name, each with the '
    + 'last few lines it printed, so the question can be read from here. Enter on a pane takes you '
```

Keep the rest of the existing sentence from `'last few lines it printed'`
onward exactly as it is — read the file and splice, do not retype it from
here.

- [ ] **Step 3: Update the `dir="auto"` count in CLAUDE.md**

That section says "Four boxes have it today" and lists them. There are five
now. Change the count and add the command box:

```
Five boxes have it today: the card title in `board-view.ts`, the description in
`board-detail.ts`, the picker's search box, the settings screen's text fields,
and the command box in `command-view.ts`.
```

- [ ] **Step 4: Run everything**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: all three PASS.

- [ ] **Step 5: Read Ctrl+H's own words back**

Not a command — a read. Open `src/help.ts` and check three things are true:
the `Manager` blurb describes a strip and names Alt+H and Alt+L; the `Command`
blurb describes what that screen is; `UNBOUND_SHORTCUTS.command` lists Space.
A help dialog describing the version before yours is worse than none, because
it is believed.

- [ ] **Step 6: Commit**

```bash
git add src/index.css src/help.ts CLAUDE.md
git commit -m "command: the look of the strip and the screen, and help that matches"
```

---

### Task 9: Move the card, open the pull request

- [ ] **Step 1: Run the three checks one last time**

Run: `npm test && npx tsc --noEmit && npx eslint .`

If any of them fails and you cannot fix it: stop. Do not open the pull request.
Say what failed in the card's `notes` and leave the card in `Doing`.

- [ ] **Step 2: Move the card to Done**

Edit `.dashboard/board.json` **in this checkout only**. Find the card with id
`0e2bc483-3151-40b0-95ec-fd45709c8d84`, move it from `Doing` to `Done`, set its
`branch` to `run-a-task-across-projects`, and write in its `notes` what shipped
and what was left out. Set `pullRequest` once the number exists.

Write the file with the same shape the app writes: two-space indent, a trailing
newline, and characters left as themselves — `json.dump(..., ensure_ascii=False)`
if you use Python, or the diff fills with `—` for every em-dash in every
other card.

- [ ] **Step 3: Push and open the pull request**

```bash
git push -u origin run-a-task-across-projects
gh pr create --title "A command run across projects, and a named strip to reach it" --body "..."
```

The body says what the screen does, names the one scope change and why it was
needed, and names what was deliberately left out: saved task names, results
surviving a restart, and any history of runs.

- [ ] **Step 4: Commit the card**

```bash
git add .dashboard/board.json
git commit -m 'board: "Run a task across projects and collect the results" is ready'
git push
```

- [ ] **Step 5: Say the app needs a rebuild**

Do not rebuild it, do not restart it, do not quit it. Say that the installed
app needs a rebuild and a restart to pick this up, and stop.
