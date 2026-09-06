# Settings Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A hand-editable settings file and a keyboard-driven settings screen that together control the shell command, the theme, the font and every keyboard shortcut, all read from one table of actions.

**Architecture:** One table in `src/actions.ts` names every action once — what it does, which screens it fires on, and the key it ships with. `src/binding.ts` turns a written shortcut like `Ctrl+Shift+K` into a physical key plus modifiers and back. `mapShortcut` becomes a lookup over that table; `help.ts` prints from it; a new overlay edits it. Settings live in `~/.config/dashboard/settings.json`, read by the main process and served to the renderer over IPC.

**Tech Stack:** TypeScript, Electron 44, vitest, xterm.js 6. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-06-settings-screen-design.md`

## Global Constraints

- No source file over 600 lines of code. Comments and blank lines do not count. Data-only files (the action table) are exempt.
- Spell identifiers out in full. No abbreviations: `configuration` not `config`, `button` not `btn`. Established acronyms (`id`, `url`, `json`, `css`, `api`) are fine.
- Every action must be reachable from the keyboard alone. A control that only answers a click is unfinished.
- Every keydown handler reaches `if (isModified(event)) return;` before it acts on `event.key`. The one exception this plan adds is the armed capture row in the settings screen, and Task 11 writes that exception into `CLAUDE.md`.
- A refusal is explained where it is decided: export the predicate from the file that enforces it and call it from the file that prints the message.
- `src/help.ts` is part of every change that adds, removes or changes a key, a mode, or what a screen does.
- Never quit, kill, restart or rebuild the running Dashboard app. Building into `out/` or `.vite/` is fine. After the last task, say the installed app needs a rebuild and stop.
- No mention of Claude, Anthropic or any AI tooling in code, comments, docs or commit messages. No `Co-Authored-By` trailer.
- Checks after every task: `npm test`, `npx tsc --noEmit`, `npx eslint .`

---

### Task 1: Binding strings

A binding is written the way a person writes a shortcut — `Ctrl+Shift+K`, `Alt+H`, `d`, `Left` — and matched against the physical key, `event.code`, never the character `event.key` reported. `event.key` lies twice: Option on macOS turns `h` into `˙`, and Shift turns `1` into `!`.

**Files:**
- Create: `src/binding.ts`
- Modify: `src/shortcuts.ts` — `KeyInput` moves out to `binding.ts` and is re-exported from here, so `binding.ts` does not have to import from the file that will shortly import it.
- Test: `src/binding.test.ts`

**Interfaces:**
- Consumes: nothing. This is the bottom of the stack.
- Produces:
  - `type KeyInput = { key: string; code: string; shiftKey: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean }` — moved here from `shortcuts.ts`, which re-exports it so every existing import keeps working.
  - `type Keystroke = { code: string; ctrl: boolean; meta: boolean; alt: boolean; shift: boolean }`
  - `parseBinding(text: string): Keystroke | null`
  - `formatBinding(keystroke: Keystroke): string | null`
  - `keystrokeOf(input: KeyInput): Keystroke`
  - `matchesBinding(input: KeyInput, binding: string | null): boolean`

- [ ] **Step 1: Write the failing tests**

Create `src/binding.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatBinding, keystrokeOf, matchesBinding, parseBinding } from './binding';
import { key } from './test-key';

describe('parseBinding', () => {
  it('reads a letter with modifiers', () => {
    expect(parseBinding('Ctrl+Shift+K'))
      .toEqual({ code: 'KeyK', ctrl: true, meta: false, alt: false, shift: true });
  });

  it('reads a bare letter, a digit, punctuation and a named key', () => {
    expect(parseBinding('D')?.code).toBe('KeyD');
    expect(parseBinding('1')?.code).toBe('Digit1');
    expect(parseBinding(']')?.code).toBe('BracketRight');
    expect(parseBinding('Left')?.code).toBe('ArrowLeft');
    expect(parseBinding('F5')?.code).toBe('F5');
  });

  it('does not care about case or spacing', () => {
    expect(parseBinding('ctrl+k')).toEqual(parseBinding('Ctrl+K'));
    expect(parseBinding(' cmd + left ')).toEqual(parseBinding('Cmd+Left'));
  });

  it('refuses what it cannot name', () => {
    expect(parseBinding('')).toBeNull();
    expect(parseBinding('Ctrl+')).toBeNull();
    expect(parseBinding('Hyper+K')).toBeNull();
    expect(parseBinding('Ctrl+Nonsense')).toBeNull();
  });
});

describe('formatBinding', () => {
  it('writes the canonical form, so a hand-edited file is tidied on the next write', () => {
    expect(formatBinding(parseBinding('ctrl+k')!)).toBe('Ctrl+K');
    expect(formatBinding(parseBinding('shift+alt+cmd+ctrl+1')!)).toBe('Ctrl+Cmd+Alt+Shift+1');
  });

  it('round-trips every form parseBinding accepts', () => {
    for (const text of ['Ctrl+K', 'D', '1', ']', 'Left', 'Shift+Tab', 'Cmd+Backspace', 'F12', 'Space']) {
      expect(formatBinding(parseBinding(text)!)).toBe(text);
    }
  });

  it('gives back nothing for a key it has no name for, so capture can refuse it', () => {
    expect(formatBinding({ code: 'IntlBackslash', ctrl: false, meta: false, alt: false, shift: false }))
      .toBeNull();
  });
});

describe('matchesBinding', () => {
  // The two lies event.key tells. Option+H arrives as "˙" on macOS and Shift+1 as "!";
  // the physical key is KeyH and Digit1 either way.
  it('matches the physical key, not the character the browser reported', () => {
    expect(matchesBinding(key({ code: 'KeyH', key: '˙', altKey: true }), 'Alt+H')).toBe(true);
    expect(matchesBinding(key({ code: 'Digit1', key: '!', shiftKey: true }), 'Shift+1')).toBe(true);
  });

  it('needs every modifier to agree', () => {
    expect(matchesBinding(key({ code: 'KeyK', ctrlKey: true }), 'Ctrl+K')).toBe(true);
    expect(matchesBinding(key({ code: 'KeyK', ctrlKey: true, shiftKey: true }), 'Ctrl+K')).toBe(false);
    expect(matchesBinding(key({ code: 'KeyK' }), 'Ctrl+K')).toBe(false);
  });

  it('never matches an unbound action or an unreadable binding', () => {
    expect(matchesBinding(key({ code: 'KeyK', ctrlKey: true }), null)).toBe(false);
    expect(matchesBinding(key({ code: 'KeyK', ctrlKey: true }), 'Hyper+K')).toBe(false);
  });
});

describe('keystrokeOf', () => {
  it('reads a keystroke off an event', () => {
    expect(keystrokeOf(key({ code: 'KeyK', ctrlKey: true, shiftKey: true })))
      .toEqual({ code: 'KeyK', ctrl: true, meta: false, alt: false, shift: true });
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run src/binding.test.ts`
Expected: FAIL — `Failed to resolve import "./binding"`.

- [ ] **Step 3: Write `src/binding.ts`**

```ts
// What every key handler is given: the browser's KeyboardEvent narrowed to the six fields anything
// here reads. Lived in shortcuts.ts until bindings needed it, and shortcuts.ts still re-exports it.
export type KeyInput = {
  key: string;
  code: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
};

// A keystroke is the key under your finger plus the modifiers held with it. `code`, never `key`:
// hold Option on macOS and `h` arrives as "˙", hold Shift and `1` arrives as "!". The physical key
// is the same either way, so it is the only thing a binding can be matched against honestly.
export type Keystroke = { code: string; ctrl: boolean; meta: boolean; alt: boolean; shift: boolean };

// The keys a binding may name, written the way a person writes them. Letters and digits are spelled
// as themselves; everything else needs a name because `Slash` is not what anyone would type.
const NAMED_KEYS: Record<string, string> = {
  '[': 'BracketLeft', ']': 'BracketRight', ',': 'Comma', '.': 'Period', '/': 'Slash',
  ';': 'Semicolon', "'": 'Quote', '-': 'Minus', '=': 'Equal', '`': 'Backquote',
  LEFT: 'ArrowLeft', RIGHT: 'ArrowRight', UP: 'ArrowUp', DOWN: 'ArrowDown',
  TAB: 'Tab', ENTER: 'Enter', ESCAPE: 'Escape', BACKSPACE: 'Backspace', SPACE: 'Space',
};

// Written out rather than derived, so formatting is a lookup in the other direction and a key with no
// written form has none in either — which is what lets the settings screen refuse to bind it.
const KEY_NAMES = new Map<string, string>(Object.entries(NAMED_KEYS).map(
  ([name, code]) => [code, name.length === 1 ? name : name.charAt(0) + name.slice(1).toLowerCase()],
));

function codeOfName(name: string): string | null {
  const upper = name.toUpperCase();
  if (/^[A-Z]$/.test(upper)) return `Key${upper}`;
  if (/^[0-9]$/.test(upper)) return `Digit${upper}`;
  if (/^F([1-9]|1[0-2])$/.test(upper)) return upper;
  return NAMED_KEYS[upper] ?? NAMED_KEYS[name] ?? null;
}

function nameOfCode(code: string): string | null {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1];
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit) return digit[1];
  if (/^F([1-9]|1[0-2])$/.test(code)) return code;
  return KEY_NAMES.get(code) ?? null;
}

// Ctrl, Cmd, Alt, Shift, always in that order. One order means the file, the settings screen and the
// help dialog all spell a key the same way, and a hand-edited `shift+ctrl+k` is tidied on the next write.
const MODIFIERS = ['Ctrl', 'Cmd', 'Alt', 'Shift'] as const;

export function parseBinding(text: string): Keystroke | null {
  const parts = text.split('+').map((part) => part.trim()).filter((part) => part !== '');
  // A lone "+" splits to nothing, and "Ctrl+" to one part that is a modifier with no key after it.
  if (parts.length === 0) return null;
  const keystroke: Keystroke = { code: '', ctrl: false, meta: false, alt: false, shift: false };
  for (const part of parts.slice(0, -1)) {
    switch (part.toLowerCase()) {
      case 'ctrl': keystroke.ctrl = true; break;
      case 'cmd': keystroke.meta = true; break;
      case 'alt': keystroke.alt = true; break;
      case 'shift': keystroke.shift = true; break;
      // A modifier this file does not know is not a binding. Guessing would give you a shortcut that
      // silently never fires.
      default: return null;
    }
  }
  const code = codeOfName(parts[parts.length - 1]);
  return code === null ? null : { ...keystroke, code };
}

// Null for a key with no written form — a media key, a keyboard's own extra button. The settings
// screen turns that into a refusal rather than storing a binding nobody could read or type back.
export function formatBinding(keystroke: Keystroke): string | null {
  const name = nameOfCode(keystroke.code);
  if (name === null) return null;
  const held = [keystroke.ctrl, keystroke.meta, keystroke.alt, keystroke.shift];
  return [...MODIFIERS.filter((_modifier, index) => held[index]), name].join('+');
}

export function keystrokeOf(input: KeyInput): Keystroke {
  return {
    code: input.code,
    ctrl: input.ctrlKey,
    meta: input.metaKey,
    alt: input.altKey,
    shift: input.shiftKey,
  };
}

// Null is an action with no key, which nothing may match. So is a binding that cannot be read: a typo
// in the file costs you that one shortcut rather than binding it to something arbitrary.
export function matchesBinding(input: KeyInput, binding: string | null): boolean {
  if (binding === null) return false;
  const wanted = parseBinding(binding);
  if (wanted === null) return false;
  const pressed = keystrokeOf(input);
  return wanted.code === pressed.code
    && wanted.ctrl === pressed.ctrl && wanted.meta === pressed.meta
    && wanted.alt === pressed.alt && wanted.shift === pressed.shift;
}
```

- [ ] **Step 4: Move `KeyInput` out of `shortcuts.ts`**

In `src/shortcuts.ts`, delete the `export type KeyInput = { ... }` block and put this in its place, next to the other imports:

```ts
import { type KeyInput } from './binding';

export type { KeyInput };
```

`isModified` stays in `shortcuts.ts` — every dialog imports it from there, and it is about what a handler does with a key rather than about what a binding is.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx vitest run src/binding.test.ts`
Expected: PASS, all cases.

- [ ] **Step 6: Run the whole check set**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: all green. The existing `shortcuts.test.ts` and `help.test.ts` still pass — `KeyInput` only changed address.

- [ ] **Step 7: Commit**

```bash
git add src/binding.ts src/binding.test.ts src/shortcuts.ts
git commit -m "settings: read and write a shortcut the way a person types it

A binding is a string — Ctrl+Shift+K, Alt+H, d, Left — parsed to the physical
key plus its modifiers. Matching reads event.code, because event.key lies twice:
Option turns h into a dead-key glyph and Shift turns 1 into an exclamation mark."
```

---

### Task 2: The action table

Every action named once, with what it does, where it is listed, which screens it fires on, and the key it ships with. Three files read this table — the handler, the help dialog, the settings screen — and today each of them writes its own copy by hand.

**Files:**
- Create: `src/actions.ts`
- Test: `src/actions.test.ts`

**Interfaces:**
- Consumes: `parseBinding` from `src/binding.ts`; `Mode` from `src/modes.ts`; `Direction` from `src/terminals.ts`.
- Produces:
  - `type Action` — the union, moved here from `shortcuts.ts` and widened with the board's kinds.
  - `type ActionName = (typeof ACTIONS)[number]['name']`
  - `type ActionGroup = 'app' | 'modes' | 'projects' | 'terminals' | 'board'`
  - `type ActionEntry = { name: string; description: string; group: ActionGroup; scope: 'global' | 'terminals' | 'board'; action: Action; mac: string | null; other: string | null }`
  - `const ACTIONS: readonly ActionEntry[]`
  - `defaultBinding(entry: ActionEntry, isMac: boolean): string | null`

- [ ] **Step 1: Write the failing test**

Create `src/actions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ACTIONS, defaultBinding } from './actions';
import { formatBinding, parseBinding } from './binding';

describe('the action table', () => {
  it('names every action exactly once, because the name is the key in settings.json', () => {
    const names = ACTIONS.map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('ships every default in a form binding.ts can read and writes it canonically', () => {
    for (const entry of ACTIONS) {
      for (const text of [entry.mac, entry.other]) {
        if (text === null) continue;
        const parsed = parseBinding(text);
        expect(parsed, `${entry.name} ships ${text}`).not.toBeNull();
        expect(formatBinding(parsed!), `${entry.name} ships ${text}`).toBe(text);
      }
    }
  });

  it('gives every action a description, so no help row is blank', () => {
    for (const entry of ACTIONS) expect(entry.description.length, entry.name).toBeGreaterThan(0);
  });

  it('ships no two actions on the same key, on either platform', () => {
    for (const isMac of [true, false]) {
      const taken = new Map<string, string>();
      for (const entry of ACTIONS) {
        const binding = defaultBinding(entry, isMac);
        if (binding === null) continue;
        // Scope keeps a board key and a terminal key apart: neither fires on the other's screen.
        const held = `${entry.scope}:${binding}`;
        expect(taken.get(held), `${entry.name} and ${taken.get(held)} both ship on ${binding}`)
          .toBeUndefined();
        // A global action is heard on every screen, so it clashes with the scoped ones in both
        // directions — whichever row the table happens to list first.
        const alsoHeld = entry.scope === 'global'
          ? ['terminals', 'board'] : ['global'];
        for (const scope of alsoHeld) {
          expect(taken.get(`${scope}:${binding}`), `${entry.name} clashes with ${taken.get(`${scope}:${binding}`)}`)
            .toBeUndefined();
        }
        taken.set(held, entry.name);
        for (const scope of alsoHeld) taken.set(`${scope}:${binding}`, entry.name);
      }
    }
  });

  it('leaves the macOS-only keys unbound elsewhere', () => {
    const focusFirst = ACTIONS.find((entry) => entry.name === 'terminal-focus-1')!;
    expect(defaultBinding(focusFirst, true)).toBe('Cmd+1');
    // Ctrl+1..9 is the projects on every platform, so off macOS there is no modifier left.
    expect(defaultBinding(focusFirst, false)).toBeNull();
    const clearLine = ACTIONS.find((entry) => entry.name === 'terminal-clear-line')!;
    expect(defaultBinding(clearLine, false)).toBeNull();
  });

  it('covers all nine projects, all five terminals and all four directions', () => {
    const names = new Set(ACTIONS.map((entry) => entry.name));
    for (let number = 1; number <= 9; number++) {
      expect(names.has(`project-jump-${number}`)).toBe(true);
      expect(names.has(`project-move-${number}`)).toBe(true);
    }
    for (let number = 1; number <= 5; number++) expect(names.has(`terminal-focus-${number}`)).toBe(true);
    for (const direction of ['left', 'right', 'up', 'down']) {
      expect(names.has(`terminal-move-${direction}`)).toBe(true);
      expect(names.has(`board-select-${direction}`)).toBe(true);
      expect(names.has(`board-move-${direction}`)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run src/actions.test.ts`
Expected: FAIL — `Failed to resolve import "./actions"`.

- [ ] **Step 3: Write `src/actions.ts`**

The `Action` union moves here from `shortcuts.ts` and gains the board's kinds, so that one lookup can answer for every screen.

```ts
import type { Mode } from './modes';
import type { Direction } from './terminals';

// What a shortcut does once it has fired. The renderer answers the first three groups; the board view
// answers the board kinds. Moved here from shortcuts.ts so the table can name the action beside its key.
export type Action =
  | { kind: 'project-next' }
  | { kind: 'project-previous' }
  | { kind: 'project-jump'; index: number }
  | { kind: 'project-move'; index: number }
  | { kind: 'project-picker' }
  | { kind: 'project-last' }
  | { kind: 'help' }
  | { kind: 'settings' }
  | { kind: 'mode-set'; mode: Mode }
  | { kind: 'terminal-focus'; index: number }
  | { kind: 'terminal-next' }
  | { kind: 'terminal-previous' }
  | { kind: 'terminal-move'; direction: Direction }
  | { kind: 'terminal-input'; data: string }
  | { kind: 'board-select'; direction: Direction }
  | { kind: 'board-move'; direction: Direction }
  | { kind: 'board-attach' }
  | { kind: 'board-detach' }
  | { kind: 'board-edit'; field: 'title' | 'notes' }
  | { kind: 'board-open' }
  | { kind: 'board-add' }
  | { kind: 'board-delete' }
  | { kind: 'board-priority' }
  | { kind: 'board-sort' }
  | { kind: 'board-undo' };

// Which screens hear the key. `global` is heard everywhere, including while a shell has the keyboard;
// the other two only on their own screen, so the board's bare `D` never reaches a terminal.
export type ActionScope = 'global' | 'terminals' | 'board';

// Which heading the help dialog and the settings screen list it under. Not the same thing as scope:
// help and settings answer from everywhere but belong under their own heading rather than Projects.
export type ActionGroup = 'app' | 'modes' | 'projects' | 'terminals' | 'board';

export type ActionEntry = {
  // Stable: it is the key in settings.json, so renaming one loses whatever the user had bound to it.
  name: string;
  // The sentence the help dialog prints, written for someone who has not been told.
  description: string;
  group: ActionGroup;
  scope: ActionScope;
  action: Action;
  // What it ships with, per platform. null means it ships unbound.
  mac: string | null;
  other: string | null;
};

const DIRECTIONS: Direction[] = ['left', 'down', 'up', 'right'];
// Option+H/J/K/L, the vim directions, in the same order as DIRECTIONS above.
const VIM_KEYS: Record<Direction, string> = { left: 'H', down: 'J', up: 'K', right: 'L' };
const ARROW_KEYS: Record<Direction, string> = { left: 'Left', down: 'Down', up: 'Up', right: 'Right' };

function range(count: number): number[] {
  return Array.from({ length: count }, (_value, index) => index + 1);
}

// A flat list of rows. It is data, so its length is not a design smell — the file-size rule already
// says so — and every consumer reads it rather than writing its own copy.
export const ACTIONS: readonly ActionEntry[] = [
  {
    name: 'project-picker', description: 'Open the project list', group: 'projects', scope: 'global',
    action: { kind: 'project-picker' }, mac: 'Ctrl+S', other: 'Ctrl+S',
  },
  {
    name: 'project-last', description: 'Back to the last project', group: 'projects', scope: 'global',
    action: { kind: 'project-last' }, mac: 'Ctrl+O', other: 'Ctrl+O',
  },
  {
    name: 'project-next', description: 'Next project', group: 'projects', scope: 'global',
    action: { kind: 'project-next' }, mac: 'Cmd+]', other: 'Ctrl+]',
  },
  {
    name: 'project-previous', description: 'Previous project', group: 'projects', scope: 'global',
    action: { kind: 'project-previous' }, mac: 'Cmd+[', other: 'Ctrl+[',
  },
  ...range(9).map((number): ActionEntry => ({
    name: `project-jump-${number}`, description: `Jump to project ${number}`,
    group: 'projects', scope: 'global',
    action: { kind: 'project-jump', index: number - 1 },
    mac: `Ctrl+${number}`, other: `Ctrl+${number}`,
  })),
  ...range(9).map((number): ActionEntry => ({
    name: `project-move-${number}`, description: `Move this project to position ${number}`,
    group: 'projects', scope: 'global',
    action: { kind: 'project-move', index: number - 1 },
    mac: `Ctrl+Shift+${number}`, other: `Ctrl+Shift+${number}`,
  })),
  {
    name: 'help', description: 'Open this dialog', group: 'app', scope: 'global',
    action: { kind: 'help' }, mac: 'Ctrl+H', other: 'Ctrl+H',
  },
  {
    name: 'settings', description: 'Open the settings screen', group: 'app', scope: 'global',
    action: { kind: 'settings' }, mac: 'Ctrl+,', other: 'Ctrl+,',
  },
  {
    name: 'mode-terminals', description: 'Terminals mode', group: 'modes', scope: 'global',
    action: { kind: 'mode-set', mode: 'terminals' }, mac: 'Ctrl+T', other: 'Ctrl+T',
  },
  {
    name: 'mode-nvim', description: 'nvim mode', group: 'modes', scope: 'global',
    action: { kind: 'mode-set', mode: 'nvim' }, mac: 'Ctrl+N', other: 'Ctrl+N',
  },
  {
    name: 'mode-board', description: 'Board mode', group: 'modes', scope: 'global',
    action: { kind: 'mode-set', mode: 'board' }, mac: 'Ctrl+B', other: 'Ctrl+B',
  },
  // Ctrl+1..9 belongs to the projects on every platform, so off macOS there is no modifier left to
  // reach a pane by number. Shipping unbound is better than shipping a key that cannot work.
  ...range(5).map((number): ActionEntry => ({
    name: `terminal-focus-${number}`, description: `Focus terminal ${number}`,
    group: 'terminals', scope: 'terminals',
    action: { kind: 'terminal-focus', index: number - 1 },
    mac: `Cmd+${number}`, other: null,
  })),
  {
    name: 'terminal-next', description: 'Next terminal', group: 'terminals', scope: 'terminals',
    action: { kind: 'terminal-next' }, mac: 'Cmd+Right', other: 'Ctrl+Right',
  },
  {
    name: 'terminal-previous', description: 'Previous terminal', group: 'terminals', scope: 'terminals',
    action: { kind: 'terminal-previous' }, mac: 'Cmd+Left', other: 'Ctrl+Left',
  },
  ...DIRECTIONS.map((direction): ActionEntry => ({
    name: `terminal-move-${direction}`, description: `Move to the pane ${direction}`,
    group: 'terminals', scope: 'terminals',
    action: { kind: 'terminal-move', direction },
    mac: `Alt+${VIM_KEYS[direction]}`, other: `Alt+${VIM_KEYS[direction]}`,
  })),
  // Ghostty sends Ctrl+U for Cmd+Backspace, so zsh kills the whole line. xterm.js sends a plain
  // backspace, which eats one character. Elsewhere Ctrl+U already reaches the shell on its own, so
  // there is nothing to stand in for and this ships unbound.
  {
    name: 'terminal-clear-line', description: "Clear the shell's current line",
    group: 'terminals', scope: 'terminals',
    action: { kind: 'terminal-input', data: '\x15' }, mac: 'Cmd+Backspace', other: null,
  },
  ...DIRECTIONS.map((direction): ActionEntry => ({
    name: `board-select-${direction}`, description: `Move the selection ${direction}`,
    group: 'board', scope: 'board',
    action: { kind: 'board-select', direction },
    mac: ARROW_KEYS[direction], other: ARROW_KEYS[direction],
  })),
  ...DIRECTIONS.map((direction): ActionEntry => ({
    name: `board-move-${direction}`, description: `Move the card ${direction}`,
    group: 'board', scope: 'board',
    action: { kind: 'board-move', direction },
    mac: `Shift+${ARROW_KEYS[direction]}`, other: `Shift+${ARROW_KEYS[direction]}`,
  })),
  {
    name: 'board-attach', description: 'Make this card a subtask of the one above',
    group: 'board', scope: 'board', action: { kind: 'board-attach' }, mac: 'Tab', other: 'Tab',
  },
  {
    name: 'board-detach', description: 'Cut this card loose from its parent',
    group: 'board', scope: 'board', action: { kind: 'board-detach' }, mac: 'Shift+Tab', other: 'Shift+Tab',
  },
  {
    name: 'board-edit-title', description: "Edit the card's title",
    group: 'board', scope: 'board', action: { kind: 'board-edit', field: 'title' },
    mac: 'Enter', other: 'Enter',
  },
  {
    name: 'board-edit-notes', description: "Edit the card's description",
    group: 'board', scope: 'board', action: { kind: 'board-edit', field: 'notes' }, mac: 'E', other: 'E',
  },
  {
    name: 'board-open', description: 'Open the card: its notes, its parent, its subtasks',
    group: 'board', scope: 'board', action: { kind: 'board-open' }, mac: 'O', other: 'O',
  },
  {
    name: 'board-add', description: 'Add a card',
    group: 'board', scope: 'board', action: { kind: 'board-add' }, mac: 'N', other: 'N',
  },
  {
    name: 'board-delete', description: 'Delete the card and its subtasks, after a confirmation',
    group: 'board', scope: 'board', action: { kind: 'board-delete' }, mac: 'D', other: 'D',
  },
  {
    name: 'board-priority', description: "Cycle the card's priority",
    group: 'board', scope: 'board', action: { kind: 'board-priority' }, mac: 'P', other: 'P',
  },
  {
    name: 'board-sort', description: 'Sort the column, urgent first',
    group: 'board', scope: 'board', action: { kind: 'board-sort' }, mac: 'S', other: 'S',
  },
  {
    name: 'board-undo', description: 'Undo the last board change',
    group: 'board', scope: 'board', action: { kind: 'board-undo' }, mac: 'U', other: 'U',
  },
];

export type ActionName = (typeof ACTIONS)[number]['name'];

export function defaultBinding(entry: ActionEntry, isMac: boolean): string | null {
  return isMac ? entry.mac : entry.other;
}

export function actionByName(name: string): ActionEntry | undefined {
  return ACTIONS.find((entry) => entry.name === name);
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/actions.test.ts`
Expected: PASS. If the clash test fails, two rows ship on the same key — fix the table, not the test.

- [ ] **Step 5: Run the whole check set**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: all green. `shortcuts.ts` still has its own `Action` union; Task 4 removes it.

- [ ] **Step 6: Commit**

```bash
git add src/actions.ts src/actions.test.ts
git commit -m "settings: name every action once, in one table

Fifty-seven rows: what the action does, which screens hear it, and the key it
ships with on each platform. The handler, the help dialog and the settings
screen will all read this instead of keeping their own copy."
```

---

### Task 3: The settings shape, its defaults, and reading the file

Pure. Everything a bad file can do to you is decided here: one unreadable value costs you that value and nothing else, the way `parseSession` already treats `session.json`.

**Files:**
- Create: `src/settings.ts`
- Test: `src/settings.test.ts`

**Interfaces:**
- Consumes: `ACTIONS`, `defaultBinding`, `actionByName` from `src/actions.ts`; `parseBinding` from `src/binding.ts`; `THEME`, `TITLE_BAR_HEIGHT` from `src/theme.ts`.
- Produces:
  - `type Settings = { shellCommand: string; font: { name: string; size: number }; theme: Record<string, string>; keys: Record<string, string | null> }`
  - `defaultSettings(isMac: boolean): Settings`
  - `parseSettings(stored: unknown, isMac: boolean): Settings`
  - `holderOfBinding(settings: Settings, name: string, binding: string): string | null`
  - `bindKey(settings: Settings, name: string, binding: string | null): Settings`
  - `resetKeys(settings: Settings, isMac: boolean): Settings`

- [ ] **Step 1: Write the failing test**

Create `src/settings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  bindKey, defaultSettings, holderOfBinding, parseSettings, resetKeys,
} from './settings';
import { ACTIONS } from './actions';
import { THEME } from './theme';

describe('parseSettings', () => {
  it('gives the defaults for an empty object, a missing file, or rubbish', () => {
    const defaults = defaultSettings(true);
    expect(parseSettings({}, true)).toEqual(defaults);
    expect(parseSettings(null, true)).toEqual(defaults);
    expect(parseSettings('not an object', true)).toEqual(defaults);
    expect(parseSettings([], true)).toEqual(defaults);
  });

  it('gives every action an entry, so nothing downstream deals with a missing key', () => {
    const settings = parseSettings({ keys: { help: 'Ctrl+J' } }, true);
    for (const entry of ACTIONS) expect(settings.keys).toHaveProperty(entry.name);
    expect(settings.keys.help).toBe('Ctrl+J');
    expect(settings.keys['project-picker']).toBe('Ctrl+S');
  });

  it('tells an unbound action apart from a missing one', () => {
    expect(parseSettings({ keys: { help: null } }, true).keys.help).toBeNull();
    expect(parseSettings({ keys: {} }, true).keys.help).toBe('Ctrl+H');
  });

  it('writes a hand-edited binding back in canonical form', () => {
    expect(parseSettings({ keys: { help: 'shift+ctrl+j' } }, true).keys.help).toBe('Ctrl+Shift+J');
  });

  it('costs one setting for one typo, never the whole file', () => {
    const settings = parseSettings({
      keys: { help: 'Hyper+J', 'project-picker': 'Ctrl+G' },
      theme: { red: 'not a colour', green: '#00ff00' },
      font: { name: '', size: 'big' },
      shellCommand: 42,
    }, true);
    expect(settings.keys.help).toBe('Ctrl+H');
    expect(settings.keys['project-picker']).toBe('Ctrl+G');
    expect(settings.theme.red).toBe(THEME.red);
    expect(settings.theme.green).toBe('#00ff00');
    expect(settings.font.name).toBe('JetBrains Mono');
    expect(settings.font.size).toBe(13);
    expect(settings.shellCommand).toBe('');
  });

  it('ignores a colour the theme does not have and a key no action answers to', () => {
    const settings = parseSettings({ theme: { chartreuse: '#7fff00' }, keys: { 'no-such-action': 'Ctrl+Z' } }, true);
    expect(settings.theme).not.toHaveProperty('chartreuse');
    expect(settings.keys).not.toHaveProperty('no-such-action');
  });

  it('ships different key defaults per platform', () => {
    expect(defaultSettings(true).keys['project-next']).toBe('Cmd+]');
    expect(defaultSettings(false).keys['project-next']).toBe('Ctrl+]');
    expect(defaultSettings(false).keys['terminal-focus-1']).toBeNull();
  });
});

describe('holderOfBinding', () => {
  const settings = defaultSettings(true);

  it('names the action already holding the key', () => {
    expect(holderOfBinding(settings, 'board-undo', 'Ctrl+S')).toBe('project-picker');
  });

  it('says nothing about the action asking, or about a free key', () => {
    expect(holderOfBinding(settings, 'project-picker', 'Ctrl+S')).toBeNull();
    expect(holderOfBinding(settings, 'help', 'Ctrl+Shift+F9')).toBeNull();
  });

  // A board key and a terminal key never meet: neither fires on the other's screen.
  it('lets two screens hold the same key', () => {
    expect(holderOfBinding(settings, 'board-undo', 'Alt+H')).toBeNull();
  });

  // A global key is heard everywhere, so it clashes with both screens and they with it.
  it('catches a clash with a global key from either side', () => {
    expect(holderOfBinding(settings, 'board-undo', 'Ctrl+H')).toBe('help');
    expect(holderOfBinding(settings, 'help', 'D')).toBe('board-delete');
  });
});

describe('bindKey', () => {
  it('gives the key to the action and takes it from whoever had it', () => {
    const next = bindKey(defaultSettings(true), 'board-undo', 'Ctrl+S');
    expect(next.keys['board-undo']).toBe('Ctrl+S');
    expect(next.keys['project-picker']).toBeNull();
  });

  it('unbinds with null and leaves everyone else alone', () => {
    const next = bindKey(defaultSettings(true), 'help', null);
    expect(next.keys.help).toBeNull();
    expect(next.keys['project-picker']).toBe('Ctrl+S');
  });

  it('does not empty the action it is binding when it already holds the key', () => {
    expect(bindKey(defaultSettings(true), 'help', 'Ctrl+H').keys.help).toBe('Ctrl+H');
  });
});

describe('resetKeys', () => {
  it('puts every key back and leaves the rest of the settings alone', () => {
    const changed = { ...bindKey(defaultSettings(true), 'help', null), shellCommand: '/bin/fish' };
    const reset = resetKeys(changed, true);
    expect(reset.keys).toEqual(defaultSettings(true).keys);
    expect(reset.shellCommand).toBe('/bin/fish');
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run src/settings.test.ts`
Expected: FAIL — `Failed to resolve import "./settings"`.

- [ ] **Step 3: Write `src/settings.ts`**

```ts
import { ACTIONS, actionByName, defaultBinding, type ActionEntry } from './actions';
import { formatBinding, parseBinding } from './binding';
import { THEME } from './theme';

// Everything the settings file holds. `keys` always has an entry for every action after parsing, so
// nothing downstream has to tell "unbound" apart from "not written down yet" — null is the first,
// and the second cannot happen.
export type Settings = {
  // Empty means "work it out": SHELL_COMMAND, then SHELL, then the platform default. A non-empty
  // value wins over both environment variables.
  shellCommand: string;
  font: { name: string; size: number };
  theme: Record<string, string>;
  keys: Record<string, string | null>;
};

export const DEFAULT_FONT = { name: 'JetBrains Mono', size: 13 };

// The colours the theme has. A file naming one that is not here is ignored rather than added: xterm
// would not read it, and a settings screen row for it would edit nothing.
const THEME_COLORS = Object.keys(THEME);

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value);
}

export function defaultSettings(isMac: boolean): Settings {
  return {
    shellCommand: '',
    font: { ...DEFAULT_FONT },
    theme: Object.fromEntries(THEME_COLORS.map((name) => [name, String(THEME[name as keyof typeof THEME])])),
    keys: Object.fromEntries(ACTIONS.map((entry) => [entry.name, defaultBinding(entry, isMac)])),
  };
}

// A binding written by hand is tidied on the way in, so `shift+ctrl+j` is stored and shown as
// `Ctrl+Shift+J` and the file, the screen and the help dialog all spell it the same way. A string that
// cannot be read is a typo: it costs that one shortcut, which goes back to its default.
function toBinding(stored: unknown, entry: ActionEntry, isMac: boolean): string | null {
  // Explicit null is the user saying "no key at all". Missing is the user saying nothing.
  if (stored === null) return null;
  if (typeof stored !== 'string') return defaultBinding(entry, isMac);
  const parsed = parseBinding(stored);
  return parsed === null ? defaultBinding(entry, isMac) : formatBinding(parsed);
}

export function parseSettings(stored: unknown, isMac: boolean): Settings {
  const defaults = defaultSettings(isMac);
  // Destructuring anything that is not an object gives undefined fields, and every check below already
  // rejects undefined, so the only shape worth guarding against is the one that would throw.
  const raw = (typeof stored === 'object' && stored !== null && !Array.isArray(stored))
    ? stored as Record<string, unknown>
    : {};
  const storedKeys = (typeof raw.keys === 'object' && raw.keys !== null)
    ? raw.keys as Record<string, unknown>
    : {};
  const storedTheme = (typeof raw.theme === 'object' && raw.theme !== null)
    ? raw.theme as Record<string, unknown>
    : {};
  const storedFont = (typeof raw.font === 'object' && raw.font !== null)
    ? raw.font as Record<string, unknown>
    : {};
  return {
    shellCommand: typeof raw.shellCommand === 'string' ? raw.shellCommand : '',
    font: {
      name: typeof storedFont.name === 'string' && storedFont.name.trim() !== ''
        ? storedFont.name : defaults.font.name,
      // A size outside this range gives you a window of unreadable panes and no way to see the screen
      // that would fix it.
      size: typeof storedFont.size === 'number' && Number.isFinite(storedFont.size)
        && storedFont.size >= 6 && storedFont.size <= 72
        ? storedFont.size : defaults.font.size,
    },
    theme: Object.fromEntries(THEME_COLORS.map((name) => [
      name, isHexColor(storedTheme[name]) ? storedTheme[name] : defaults.theme[name],
    ])),
    keys: Object.fromEntries(ACTIONS.map((entry) => [
      entry.name,
      Object.hasOwn(storedKeys, entry.name)
        ? toBinding(storedKeys[entry.name], entry, isMac)
        : defaults.keys[entry.name],
    ])),
  };
}

// Two actions clash when they hear the same key on the same screen. A global action is heard on every
// screen, so it clashes with everything; two screen-scoped actions on different screens never meet,
// which is what lets the board keep a bare D while a terminal keeps its own.
function scopesOverlap(one: ActionEntry, other: ActionEntry): boolean {
  return one.scope === other.scope || one.scope === 'global' || other.scope === 'global';
}

// Exported because the settings screen prints the message and this decides the refusal. Keeping the two
// apart is how you end up with a dialog naming an action that is not the one in the way.
export function holderOfBinding(settings: Settings, name: string, binding: string): string | null {
  const asking = actionByName(name);
  if (asking === undefined) return null;
  for (const entry of ACTIONS) {
    if (entry.name === name) continue;
    if (settings.keys[entry.name] !== binding) continue;
    if (scopesOverlap(asking, entry)) return entry.name;
  }
  return null;
}

// The key moves. Whoever held it is left unbound rather than sharing it — two actions on one key means
// one of them silently never fires, and there would be no message saying which.
export function bindKey(settings: Settings, name: string, binding: string | null): Settings {
  const displaced = binding === null ? null : holderOfBinding(settings, name, binding);
  const keys = { ...settings.keys, [name]: binding };
  if (displaced !== null) keys[displaced] = null;
  return { ...settings, keys };
}

export function resetKeys(settings: Settings, isMac: boolean): Settings {
  return { ...settings, keys: defaultSettings(isMac).keys };
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole check set**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/settings.ts src/settings.test.ts
git commit -m "settings: the shape of the file, and what a bad one costs you

Every field optional, every field checked on its own. A colour that is not a
colour costs that colour; a binding that will not parse costs that shortcut.
An explicit null is an action with no key, which is not the same as one the
file never mentions."
```

---

### Task 4: The file on disk, and the shell that comes from it

The main process reads `settings.json` before the window exists, because it needs the background colour to paint the first frame and the shell command to spawn the first pane. The renderer asks for it over IPC. This task also deletes `SHELL_COMMAND_FLAG`: once the shell is editable, a copy passed as a launch argument goes stale the moment you change it, and a dropped path gets quoted for the shell you used to have.

**Files:**
- Create: `src/settings-store.ts`, `src/settings-store.test.ts`
- Modify: `src/shell.ts` — `pickShell` takes the settings value first; `SHELL_COMMAND_FLAG` removed
- Modify: `src/shell.test.ts` — the `pickShell` cases gain the settings argument
- Modify: `src/main.ts` — read at startup, serve over IPC, paint from the theme, re-resolve the shell on write
- Modify: `src/bridge.ts`, `src/preload.ts` — `getSettings` / `saveSettings`; `shellCommand` leaves the launch argument
- Modify: `src/renderer.ts` — hold the settings and the resolved shell in module state, read at startup

**Interfaces:**
- Consumes: `parseSettings`, `defaultSettings`, `type Settings` from `src/settings.ts`.
- Produces:
  - `settingsFilePath(home: string, xdgConfigHome: string | undefined): string`
  - `readSettings(file: string, isMac: boolean): Settings`
  - `writeSettings(file: string, settings: Settings): void`
  - `pickShell(settings: Settings, environment: Record<string, string | undefined>, platform: string): string`
  - Bridge: `getSettings(): Promise<{ settings: Settings; shellCommand: string }>`, `saveSettings(settings: Settings): void`

- [ ] **Step 1: Write the failing store test**

Create `src/settings-store.test.ts`:

```ts
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readSettings, settingsFilePath, writeSettings } from './settings-store';
import { defaultSettings } from './settings';

function file(): string {
  return join(mkdtempSync(join(tmpdir(), 'dashboard-settings-')), 'settings.json');
}

describe('settingsFilePath', () => {
  it('sits beside the .env file, under XDG_CONFIG_HOME when there is one', () => {
    expect(settingsFilePath('/home/me', '/elsewhere/config'))
      .toBe(join('/elsewhere/config', 'dashboard', 'settings.json'));
    expect(settingsFilePath('/home/me', undefined))
      .toBe(join('/home/me', '.config', 'dashboard', 'settings.json'));
  });
});

describe('readSettings', () => {
  it('gives the defaults for a file that is not there', () => {
    expect(readSettings(file(), true)).toEqual(defaultSettings(true));
  });

  it('gives the defaults for a file that is not json', () => {
    const path = file();
    writeFileSync(path, '{ this is not json');
    expect(readSettings(path, true)).toEqual(defaultSettings(true));
  });

  it('reads what is there and defaults the rest', () => {
    const path = file();
    writeFileSync(path, JSON.stringify({ shellCommand: '/bin/fish' }));
    const settings = readSettings(path, true);
    expect(settings.shellCommand).toBe('/bin/fish');
    expect(settings.keys.help).toBe('Ctrl+H');
  });
});

describe('writeSettings', () => {
  it('makes the directory and writes something readable back', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'dashboard-settings-')), 'nested', 'settings.json');
    const settings = { ...defaultSettings(true), shellCommand: '/bin/fish' };
    writeSettings(path, settings);
    expect(readSettings(path, true)).toEqual(settings);
    // Indented, because the whole point of this file is that a person opens it.
    expect(readFileSync(path, 'utf8')).toContain('\n  "shellCommand"');
  });

  it('swallows a write it cannot do, the way the session file does', () => {
    expect(() => writeSettings('/', defaultSettings(true))).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/settings-store.test.ts`
Expected: FAIL — `Failed to resolve import "./settings-store"`.

- [ ] **Step 3: Write `src/settings-store.ts`**

```ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseSettings, type Settings } from './settings';

// Beside the .env file main already reads, not in Electron's userData directory. userData is
// ~/Library/Application Support/Dashboard on macOS, and the point of this file is that a person opens
// it in an editor — delete it, or empty it to {}, and everything is back to how it shipped.
export function settingsFilePath(home: string, xdgConfigHome: string | undefined): string {
  const configHome = xdgConfigHome || path.join(home, '.config');
  return path.join(configHome, 'dashboard', 'settings.json');
}

// Like the session and recents files, reading and writing alike: a missing or damaged file means the
// defaults, and a write that fails must not take down whatever the caller was doing. Losing a settings
// change is a nuisance; losing the window is not.
export function readSettings(file: string, isMac: boolean): Settings {
  try {
    return parseSettings(JSON.parse(readFileSync(file, 'utf8')), isMac);
  } catch {
    return parseSettings({}, isMac);
  }
}

export function writeSettings(file: string, settings: Settings): void {
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    // Indented and newline-terminated: this is a file people edit by hand.
    writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`);
  } catch {
    // The change is live in this run; it just will not survive a restart.
  }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/settings-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Teach `pickShell` about the settings, and delete the flag**

In `src/shell.ts`, replace `pickShell` and delete `SHELL_COMMAND_FLAG` entirely:

```ts
import type { Settings } from './settings';

const platformDefault: Record<string, string> = {
  darwin: '/bin/zsh',
  win32: 'powershell.exe',
};

// The settings file wins, then the two environment variables, then the platform. An empty
// shellCommand is the file saying "work it out", which is what it holds until someone sets one.
export function pickShell(
  settings: Settings,
  environment: Record<string, string | undefined>,
  platform: string,
): string {
  return (
    settings.shellCommand ||
    environment.SHELL_COMMAND ||
    environment.SHELL ||
    platformDefault[platform] ||
    '/bin/bash'
  );
}
```

Delete the `SHELL_COMMAND_FLAG` export and the comment block above it. `quoteForShell`, `isPowerShell` and `editorArguments` are unchanged.

Update every `pickShell(...)` call in `src/shell.test.ts` to pass settings first — `pickShell(defaultSettings(true), { SHELL: '/bin/bash' }, 'darwin')` — and add one case:

```ts
it('lets the settings file beat both environment variables', () => {
  const settings = { ...defaultSettings(true), shellCommand: '/opt/homebrew/bin/fish' };
  expect(pickShell(settings, { SHELL_COMMAND: '/bin/zsh', SHELL: '/bin/bash' }, 'darwin'))
    .toBe('/opt/homebrew/bin/fish');
});
```

- [ ] **Step 6: Wire the main process**

In `src/main.ts`:

Add to the imports:

```ts
import { readSettings, settingsFilePath, writeSettings } from './settings-store';
import type { Settings } from './settings';
```

Replace the `const shellCommand = pickShell(process.env, process.platform);` line with:

```ts
const settingsFile = settingsFilePath(app.getPath('home'), process.env.XDG_CONFIG_HOME);
// Read before the window exists: the background colour paints the first frame, and the shell command
// spawns the first pane. Both are needed before the renderer has run a line.
let settings = readSettings(settingsFile, process.platform === 'darwin');
let shellCommand = pickShell(settings, process.env, process.platform);
```

`spawnTerminal` already reads the module-level `shellCommand`, so a pane started after a change gets the new shell with no further edit. Add the IPC handlers next to the session ones:

```ts
// The resolved shell travels with the settings, because the renderer needs to know which family of
// shell will receive a dropped path — PowerShell doubles a quote and a POSIX shell escapes it — and
// `shellCommand: ""` in the file does not say which.
ipcMain.handle('settings:read', () => ({ settings, shellCommand }));
ipcMain.on('settings:write', (_event, next: Settings) => {
  settings = next;
  // Panes already running keep the shell they started with. Nothing here kills one: there are
  // long-running jobs in them, and a settings change is not a reason to lose one.
  shellCommand = pickShell(settings, process.env, process.platform);
  writeSettings(settingsFile, settings);
});
```

In `createWindow`, paint from the settings and drop the launch argument:

```ts
    backgroundColor: settings.theme.background,
```

and delete the whole `additionalArguments: [...]` line from `webPreferences`. Remove `SHELL_COMMAND_FLAG` from the `./shell` import. `backgroundColor` was `THEME`'s only use in `main.ts`, so the import becomes `import { TITLE_BAR_HEIGHT } from './theme';`.

- [ ] **Step 7: Wire the bridge and the preload**

In `src/bridge.ts`, delete the `shellCommand: string;` field and its comment, and add:

```ts
  // The settings, and the shell that was resolved from them. One call, because the renderer needs
  // both before it builds a pane and they are decided together.
  getSettings(): Promise<{ settings: Settings; shellCommand: string }>;
  saveSettings(settings: Settings): void;
```

Add `import type { Settings } from './settings';` at the top.

In `src/preload.ts`, delete the `shellCommand` entry and the `SHELL_COMMAND_FLAG` import, and add:

```ts
  getSettings: () => ipcRenderer.invoke('settings:read'),
  saveSettings: (settings) => ipcRenderer.send('settings:write', settings),
```

- [ ] **Step 8: Hold the settings in the renderer**

In `src/renderer.ts`, add the import and the module state near the top, below `const isMac = bridge.platform === 'darwin';`:

```ts
import { defaultSettings, type Settings } from './settings';

// Replaced by the real file in start(), before any pane is built. Held here rather than passed down
// because a settings change has to reach every pane on every page at once.
let settings: Settings = defaultSettings(isMac);
// What a dropped path is quoted for. Resolved by main from the settings, so it follows a shell change
// without a restart.
let shellCommand = '';
```

In `buildPane`'s drop handler, replace `bridge.shellCommand` with `shellCommand`.

In `start()`, read the settings first — before the fonts, because Task 8 makes the font name come from them:

```ts
async function start(): Promise<void> {
  renderStatus();
  const loaded = await bridge.getSettings();
  settings = loaded.settings;
  shellCommand = loaded.shellCommand;
  // Read before anything is on screen, because the first page to open starts saving over it.
  const session = await bridge.getSession();
```

- [ ] **Step 9: Run the whole check set**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: all green. `mapShortcut` is untouched and still works off its own hand-written branches; Task 5 replaces it.

- [ ] **Step 10: Commit**

```bash
git add src/settings-store.ts src/settings-store.test.ts src/shell.ts src/shell.test.ts \
  src/main.ts src/bridge.ts src/preload.ts src/renderer.ts
git commit -m "settings: read the file before the window, and drop the stale shell copy

Main reads ~/.config/dashboard/settings.json at startup, because the background
colour paints the first frame and the shell spawns the first pane. The renderer
asks for both over IPC.

The shell used to reach the renderer as a launch argument. Once it is editable
that copy goes stale on the first change, and a dropped path with a space in it
is quoted for the shell you used to have."
```

---

### Task 5: `mapShortcut` becomes a lookup

The stack of hand-written branches goes away. Given a keystroke, the current mode and the bindings, find the action whose binding matches and whose scope covers this mode. The platform stops being a parameter — it only ever decided which default shipped, and Task 3 settled that.

**Files:**
- Modify: `src/shortcuts.ts` — the whole body is replaced; only `isModified` survives
- Modify: `src/shortcuts.test.ts` — rewritten against the new signature
- Modify: `src/renderer.ts` — the call site, and `apply` gains the `settings` kind and the board kinds
- Modify: `src/help.test.ts` — its `mapShortcut` calls take the new arguments

**Interfaces:**
- Consumes: `ACTIONS`, `type Action`, `type ActionScope` from `src/actions.ts`; `matchesBinding`, `type KeyInput` from `src/binding.ts`; `type Settings` from `src/settings.ts`.
- Produces: `mapShortcut(input: KeyInput, keys: Settings['keys'], mode?: Mode): Action | null`. `isModified` and the `KeyInput` and `Action` re-exports are unchanged in shape.

- [ ] **Step 1: Rewrite `src/shortcuts.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { mapShortcut } from './shortcuts';
import { bindKey, defaultSettings } from './settings';
import { key } from './test-key';

const mac = defaultSettings(true).keys;
const other = defaultSettings(false).keys;

describe('mapShortcut', () => {
  it('cycles projects, with the platform its own default decided', () => {
    expect(mapShortcut(key({ code: 'BracketRight', metaKey: true }), mac))
      .toEqual({ kind: 'project-next' });
    expect(mapShortcut(key({ code: 'BracketLeft', ctrlKey: true }), other))
      .toEqual({ kind: 'project-previous' });
    // The other platform's key is not bound here, so it does nothing rather than doing both.
    expect(mapShortcut(key({ code: 'BracketRight', ctrlKey: true }), mac)).toBeNull();
  });

  it('reads the physical digit, whatever character Shift made of it', () => {
    expect(mapShortcut(key({ code: 'Digit3', key: '3', ctrlKey: true }), mac))
      .toEqual({ kind: 'project-jump', index: 2 });
    expect(mapShortcut(key({ code: 'Digit3', key: '#', ctrlKey: true, shiftKey: true }), mac))
      .toEqual({ kind: 'project-move', index: 2 });
  });

  it('focuses a pane by number on macOS only, and only in terminals mode', () => {
    expect(mapShortcut(key({ code: 'Digit1', metaKey: true }), mac, 'terminals'))
      .toEqual({ kind: 'terminal-focus', index: 0 });
    expect(mapShortcut(key({ code: 'Digit1', metaKey: true }), mac, 'board')).toBeNull();
    expect(mapShortcut(key({ code: 'Digit1', metaKey: true }), other, 'terminals')).toBeNull();
  });

  it('moves between panes on Option+HJKL, whatever character Option made of the key', () => {
    expect(mapShortcut(key({ code: 'KeyH', key: '˙', altKey: true }), mac, 'terminals'))
      .toEqual({ kind: 'terminal-move', direction: 'left' });
    expect(mapShortcut(key({ code: 'KeyH', key: '˙', altKey: true }), mac, 'nvim')).toBeNull();
  });

  // The screen whose keys you cannot remember is the screen you are looking at.
  it('opens help and settings from every mode', () => {
    for (const mode of ['terminals', 'nvim', 'board'] as const) {
      expect(mapShortcut(key({ code: 'KeyH', ctrlKey: true }), mac, mode)).toEqual({ kind: 'help' });
      expect(mapShortcut(key({ code: 'Comma', ctrlKey: true }), mac, mode)).toEqual({ kind: 'settings' });
    }
  });

  // Ctrl+N is nvim's autocomplete and Ctrl+T is the shell's transpose. You leave a mode by naming a
  // different one.
  it('passes the mode key you are already on through to the screen', () => {
    expect(mapShortcut(key({ code: 'KeyN', ctrlKey: true }), mac, 'nvim')).toBeNull();
    expect(mapShortcut(key({ code: 'KeyN', ctrlKey: true }), mac, 'board'))
      .toEqual({ kind: 'mode-set', mode: 'nvim' });
  });

  it('keeps the board keys on the board, so a bare D never reaches a shell', () => {
    expect(mapShortcut(key({ code: 'KeyD' }), mac, 'board')).toEqual({ kind: 'board-delete' });
    expect(mapShortcut(key({ code: 'KeyD' }), mac, 'terminals')).toBeNull();
    expect(mapShortcut(key({ code: 'ArrowUp' }), mac, 'board'))
      .toEqual({ kind: 'board-select', direction: 'up' });
    expect(mapShortcut(key({ code: 'ArrowUp', shiftKey: true }), mac, 'board'))
      .toEqual({ kind: 'board-move', direction: 'up' });
    expect(mapShortcut(key({ code: 'ArrowUp' }), mac, 'terminals')).toBeNull();
  });

  it('follows a rebinding, and the pass-through rule follows it too', () => {
    const rebound = bindKey(defaultSettings(true), 'mode-nvim', 'Ctrl+J').keys;
    expect(mapShortcut(key({ code: 'KeyN', ctrlKey: true }), rebound, 'board')).toBeNull();
    expect(mapShortcut(key({ code: 'KeyJ', ctrlKey: true }), rebound, 'board'))
      .toEqual({ kind: 'mode-set', mode: 'nvim' });
    expect(mapShortcut(key({ code: 'KeyJ', ctrlKey: true }), rebound, 'nvim')).toBeNull();
  });

  it('never fires an action with no key', () => {
    const unbound = bindKey(defaultSettings(true), 'help', null).keys;
    expect(mapShortcut(key({ code: 'KeyH', ctrlKey: true }), unbound, 'board')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/shortcuts.test.ts`
Expected: FAIL — the old `mapShortcut` takes `(input, isMac, mode)`.

- [ ] **Step 3: Replace `src/shortcuts.ts` entirely**

```ts
import { ACTIONS, type Action, type ActionScope } from './actions';
import { matchesBinding, type KeyInput } from './binding';
import type { Mode } from './modes';
import type { Settings } from './settings';

export type { KeyInput, Action };

// What every keydown handler asks before it acts on `event.key`. A key with a modifier held is on its
// way to whoever owns that combination, so a handler that reads `event.key` without asking this first
// steals it. Dialogs included. The single deliberate exception is the armed row in the settings
// screen, which exists to read exactly these keys; CLAUDE.md names it.
export function isModified(input: KeyInput): boolean {
  return input.shiftKey || input.metaKey || input.ctrlKey || input.altKey;
}

// `global` is heard on every screen, including while a shell has the keyboard. The other two are heard
// only on their own, which is what lets the board keep a bare D that a terminal never sees.
function hears(scope: ActionScope, mode: Mode): boolean {
  return scope === 'global' || scope === mode;
}

export function mapShortcut(
  input: KeyInput,
  keys: Settings['keys'],
  mode: Mode = 'terminals',
): Action | null {
  for (const entry of ACTIONS) {
    if (!hears(entry.scope, mode)) continue;
    if (!matchesBinding(input, keys[entry.name] ?? null)) continue;
    // The key naming the mode you are already in belongs to whatever runs there: Ctrl+N completes a
    // word in nvim, Ctrl+T transposes characters in the shell. You leave a mode by naming a different
    // one. Checked on the action rather than the key, so it holds whatever the mode has been rebound to.
    if (entry.action.kind === 'mode-set' && entry.action.mode === mode) return null;
    return entry.action;
  }
  // The table order decides a tie. Two actions can only share a key if the file was hand-edited into
  // it — bindKey never leaves two on one — and then the first row wins rather than both firing.
  return null;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/shortcuts.test.ts`
Expected: PASS.

- [ ] **Step 5: Fix the call site in `src/renderer.ts`**

Change the import `import { mapShortcut, type Action } from './shortcuts';` to keep working — `Action` is re-exported, so it does. Change the window listener:

```ts
  const action = mapShortcut(event, settings.keys, pages[activeIndex]?.mode);
```

`apply` gains the new kinds. Add `settings` beside `help` at the top, and the board kinds at the bottom of the switch:

```ts
function apply(action: Action): void {
  if (action.kind === 'project-picker') return report(showPicker());
  // Before the empty check: not knowing the keys is likeliest with nothing open yet.
  if (action.kind === 'help') return showHelp();
  if (action.kind === 'settings') return showSettings();
  if (pages.length === 0) return;
  const page = pages[activeIndex];
  switch (action.kind) {
    // ... every existing case unchanged ...
    // The board answers its own keys. It is reached from here rather than from its own listener so
    // that one lookup decides every key on every screen.
    default: return page.board?.runAction(action);
  }
}
```

Add a placeholder `showSettings` next to `showHelp` — Task 9 fills it in:

```ts
// Task 9 replaces this with the real overlay.
function showSettings(): void {
  showPage(activeIndex);
}
```

`page.board?.runAction` does not exist yet, so add it to `BoardView` in Task 6. To keep this task's build green, stub it now in `src/board-view.ts` beside `statusLabel`:

```ts
    // Task 6 moves the board's own key handling in here.
    runAction(_action: Action): void {},
```

with `runAction(action: Action): void` added to the `BoardView` type and `import type { Action } from './actions';` at the top.

- [ ] **Step 6: Fix `src/help.test.ts`**

Its `PROJECT_ROWS` cases call `mapShortcut(key(row.press), true, 'board')`. Change each to `mapShortcut(key(row.press), defaultSettings(true).keys, 'board')`, import `defaultSettings` from `./settings`, and change each `press` to name the `code` rather than the `key` — `{ code: 'KeyS', ctrlKey: true }`, `{ code: 'KeyO', ctrlKey: true }`, `{ code: 'Digit1', ctrlKey: true }`, `{ code: 'Digit1', ctrlKey: true, shiftKey: true }`, `{ code: 'BracketRight', metaKey: true }`. Task 7 rewrites this file properly; this step only keeps it compiling and passing.

- [ ] **Step 7: Run the whole check set**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: all green. The board still handles its own keys through its own listener — the stubbed `runAction` does nothing, and nothing calls it yet because board keys now come back from `mapShortcut`. **This is the one moment the board's keys are broken**; Task 6 is what closes it, so do not stop here.

- [ ] **Step 8: Commit**

```bash
git add src/shortcuts.ts src/shortcuts.test.ts src/renderer.ts src/help.test.ts src/board-view.ts
git commit -m "settings: map a keystroke by looking it up, not by branching on it

mapShortcut walks the action table and takes the first row whose binding matches
and whose scope covers this screen. The platform stops being a parameter: it
only ever decided which default shipped.

The mode you are already in still swallows its own key, checked on the action so
the rule follows a rebinding."
```

---

### Task 6: The board's keys come from the same lookup

`board-view.ts` has its own `keydown` listener with a switch on bare letters. That switch is the third hand-written copy of the keys. It goes; the window listener finds the action and hands it to the board.

**Files:**
- Modify: `src/board-view.ts` — the `keydown` listener is deleted, `runAction` is filled in
- Modify: `src/shortcuts.test.ts` — one test that every board default reaches its action

**Interfaces:**
- Consumes: `type Action` from `src/actions.ts`.
- Produces: `BoardView.runAction(action: Action): void` — real, no longer a stub.

- [ ] **Step 1: Write the failing test**

Add to `src/shortcuts.test.ts`:

```ts
import { ACTIONS } from './actions';
import { parseBinding } from './binding';

describe('every shipped default reaches its own action', () => {
  it('holds for the board, where the keys used to live in a switch', () => {
    const keys = defaultSettings(true).keys;
    for (const entry of ACTIONS) {
      if (entry.scope !== 'board') continue;
      const stroke = parseBinding(keys[entry.name]!)!;
      const pressed = key({
        code: stroke.code,
        ctrlKey: stroke.ctrl,
        metaKey: stroke.meta,
        altKey: stroke.alt,
        shiftKey: stroke.shift,
      });
      expect(mapShortcut(pressed, keys, 'board'), entry.name).toEqual(entry.action);
    }
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/shortcuts.test.ts`
Expected: PASS already — Task 5 built the lookup. This test exists to fail later if a board row and the lookup drift, which is exactly the drift this whole change removes. If it fails now, the table is wrong; fix `actions.ts`.

- [ ] **Step 3: Fill in `runAction` and delete the listener**

In `src/board-view.ts`, delete the entire `element.addEventListener('keydown', (event) => { ... });` block — the arrows, the Tab handling and the switch — and delete `ARROW_DIRECTIONS`, now unused. The `isModified` import goes too if nothing else in the file uses it.

Replace the stub in the returned object:

```ts
    // Every key on this screen is found by the window's one lookup and handed here. The board keeps no
    // key handling of its own, which is what stops a board key and its help row drifting apart.
    runAction(action: Action): void {
      // A read is in flight and the board on screen is about to be replaced. Applying a keystroke to
      // the board that is going away would be applying it to cards you are not looking at.
      if (editing || landedRead !== latestRead) return;
      switch (action.kind) {
        case 'board-select':
          state = { ...state, selection: moveSelection(state.board, state.selection, action.direction) };
          return render();
        case 'board-move': return change(moveCard(state.board, state.selection, action.direction));
        case 'board-attach': {
          // The one refusal worth explaining. The others — no card above, nothing selected — are
          // obvious from the screen. attachmentRing decides it on the same call, so the message cannot
          // say one thing while the board does another.
          const ring = attachmentRing(state.board, state.selection);
          if (ring) return options.onError(`"${ring.title}" is already a subtask of this card`);
          return change(attachToCardAbove(state.board, state.selection));
        }
        case 'board-detach': return change(detachCard(state.board, state.selection));
        case 'board-edit': return startEditing(action.field);
        case 'board-priority': return change(cyclePriority(state.board, state.selection));
        case 'board-sort': return change(sortColumn(state.board, state.selection));
        case 'board-add':
          apply(addBlankCard(state, crypto.randomUUID()));
          return startEditing('title');
        case 'board-delete': return confirmDelete();
        case 'board-open': return openDetail();
        case 'board-undo': return apply(undoChange(state));
        // Everything else belongs to the renderer and never gets here.
        default: return;
      }
    },
```

The window listener already calls `preventDefault()` and `stopPropagation()` on any key that matched, so nothing here needs to. And it already skips a keystroke aimed at `.board-edit`, `.card-detail` or `.confirm`, so a card being renamed still owns every key typed into it.

`Tab` is safe to take from the window now: `matchesBinding` needs every modifier to agree, so `Ctrl+Tab` matches nothing here and falls through to the window switcher, which is the rule `CLAUDE.md` already sets.

- [ ] **Step 4: Run the whole check set**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Expected: all green. If `tsc` complains about an unused import in `board-view.ts`, delete it — `isModified` and `Direction` may both be unused now.

- [ ] **Step 5: Check it by hand**

Do NOT rebuild or restart the installed app. Run a development copy instead:

Run: `npm start`
Then: open a project, press `Ctrl+B`, and check the arrows move the selection, `Shift+Down` moves a card, `N` adds one, `E` edits a description, `Tab` attaches, `D` asks before deleting, and `U` undoes. Then press `Ctrl+T` and check that typing `dune` into a shell types `dune` rather than deleting a card. Quit the development copy when done; it is not the installed app.

- [ ] **Step 6: Commit**

```bash
git add src/board-view.ts src/shortcuts.test.ts
git commit -m "board: take the keys from the lookup instead of a switch

The board's twelve keys were the third place every shortcut was written out by
hand. They come from the action table now, like every other key, and the board
view answers an action rather than a keystroke."
```

---

### Task 7: The help dialog prints from the table

`BOARD_SHORTCUTS`, `terminalShortcuts` and the hand-written Projects list all go. The rows come from the action table and the bindings in force, so rebinding a key changes what `Ctrl+H` says.

Two rules the rows follow:

- **An action with no key gets no row.** The help dialog answers "what can I press here", and an unbound action is not something you can press. The settings screen is where you see everything, bound or not.
- **A family collapses only while it is untouched.** `Ctrl+1…Ctrl+9` is one row while all nine still hold their defaults. Rebind one and all nine are listed separately, because `Ctrl+1…Ctrl+9` would be a lie.

**Files:**
- Modify: `src/actions.ts` — the three families gain `family` and `familyDescription`
- Modify: `src/help.ts` — rows built from the table; blurbs stay hand-written
- Modify: `src/help.test.ts` — rewritten
- Modify: `src/renderer.ts` — `showHelp` passes the bindings

**Interfaces:**
- Consumes: `ACTIONS`, `defaultBinding` from `src/actions.ts`; `type Settings` from `src/settings.ts`.
- Produces: `helpSections(mode: Mode, keys: Settings['keys'], isMac: boolean): Section[]`; `openHelp(mode: Mode, keys: Settings['keys'], isMac: boolean): Promise<void>`.

- [ ] **Step 1: Add the family fields to `src/actions.ts`**

Add two optional fields to `ActionEntry`:

```ts
  // The rows the help dialog may print as one, and the sentence it prints for them. Only the numbered
  // runs have these: nine rows saying "Jump to project 4" is not a help dialog, it is a list.
  family?: string;
  familyDescription?: string;
```

Add them to the three generated runs — `project-jump` gets `family: 'project-jump', familyDescription: 'Jump to a project'`; `project-move` gets `family: 'project-move', familyDescription: 'Move this project to that position'`; `terminal-focus` gets `family: 'terminal-focus', familyDescription: 'Focus a terminal'`.

- [ ] **Step 2: Rewrite `src/help.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { helpSections } from './help';
import { mapShortcut } from './shortcuts';
import { ACTIONS } from './actions';
import { parseBinding } from './binding';
import { bindKey, defaultSettings } from './settings';
import { key } from './test-key';

const mac = defaultSettings(true).keys;

function titles(mode: 'terminals' | 'nvim' | 'board', keys = mac, isMac = true): string[] {
  return helpSections(mode, keys, isMac).map((section) => section.title);
}

function rows(mode: 'terminals' | 'nvim' | 'board', keys = mac, isMac = true) {
  return helpSections(mode, keys, isMac).flatMap((section) => section.shortcuts);
}

describe('helpSections', () => {
  it('puts the screen you are on first', () => {
    expect(titles('board')[0]).toBe('Board');
    expect(titles('nvim')[0]).toBe('nvim');
    expect(titles('terminals')[0]).toBe('Terminals');
  });

  it('gives every section a blurb, because a key list teaches the gesture and not the thing', () => {
    for (const section of helpSections('board', mac, true)) {
      expect(section.blurb.length, section.title).toBeGreaterThan(0);
    }
  });

  it('says the mode key you are already on is passed through', () => {
    const modes = helpSections('board', mac, true).find((section) => section.title === 'Modes')!;
    expect(modes.shortcuts).toContainEqual({ keys: 'Ctrl+T', action: 'Terminals mode' });
    expect(modes.shortcuts.find((shortcut) => shortcut.keys === 'Ctrl+B')?.action)
      .toBe('already here — the screen gets the keystroke');
  });

  // The drift this whole change exists to remove: every key the dialog names must be a key the
  // handler answers to, on the screen the row is printed for.
  it('names only keys mapShortcut actually answers to', () => {
    for (const mode of ['terminals', 'board'] as const) {
      for (const section of helpSections(mode, mac, true)) {
        for (const shortcut of section.shortcuts) {
          // A collapsed family names its first and last key; both ends must work.
          for (const text of shortcut.keys.split('…')) {
            const stroke = parseBinding(text);
            if (stroke === null) continue;
            const pressed = key({
              code: stroke.code,
              ctrlKey: stroke.ctrl,
              metaKey: stroke.meta,
              altKey: stroke.alt,
              shiftKey: stroke.shift,
            });
            expect(mapShortcut(pressed, mac, mode), `${mode}: ${text}`).not.toBeNull();
          }
        }
      }
    }
  });

  it('follows a rebinding', () => {
    const rebound = bindKey(defaultSettings(true), 'board-undo', 'Ctrl+Z').keys;
    const undo = rows('board', rebound).find((shortcut) => shortcut.action.startsWith('Undo'));
    expect(undo?.keys).toBe('Ctrl+Z');
  });

  it('leaves out an action with no key, because you cannot press it', () => {
    const unbound = bindKey(defaultSettings(true), 'board-undo', null).keys;
    expect(rows('board', unbound).some((shortcut) => shortcut.action.startsWith('Undo'))).toBe(false);
  });

  it('collapses a numbered run while every one of them is untouched', () => {
    expect(rows('terminals')).toContainEqual({ keys: 'Ctrl+1…Ctrl+9', action: 'Jump to a project' });
  });

  it('spells the run out once one of them has moved, because the range would be a lie', () => {
    const rebound = bindKey(defaultSettings(true), 'project-jump-5', 'F5').keys;
    const listed = rows('terminals', rebound).map((shortcut) => shortcut.keys);
    expect(listed).toContain('F5');
    expect(listed).toContain('Ctrl+4');
    expect(listed).not.toContain('Ctrl+1…Ctrl+9');
  });

  // Ctrl+1..9 is the projects on every platform, so off macOS there is no modifier left to reach a
  // pane by number, and those five ship unbound.
  it('leaves out the macOS-only terminal keys off macOS', () => {
    const listed = rows('terminals', defaultSettings(false).keys, false).map((shortcut) => shortcut.action);
    expect(listed).not.toContain('Focus a terminal');
    expect(listed).not.toContain("Clear the shell's current line");
    expect(listed).toContain('Next terminal');
  });

  it('lists help and settings under their own heading, on every screen', () => {
    for (const mode of ['terminals', 'nvim', 'board'] as const) {
      const app = helpSections(mode, mac, true).find((section) => section.title === 'Dashboard')!;
      expect(app.shortcuts).toContainEqual({ keys: 'Ctrl+H', action: 'Open this dialog' });
      expect(app.shortcuts).toContainEqual({ keys: 'Ctrl+,', action: 'Open the settings screen' });
    }
  });

  it('has a home for every action in the table', () => {
    const printed = new Set(
      (['terminals', 'nvim', 'board'] as const).flatMap((mode) => rows(mode).map((row) => row.action)),
    );
    for (const entry of ACTIONS) {
      const named = printed.has(entry.description)
        || (entry.familyDescription !== undefined && printed.has(entry.familyDescription));
      expect(named, entry.name).toBe(true);
    }
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run src/help.test.ts`
Expected: FAIL — `helpSections` takes `(mode, isMac)`.

- [ ] **Step 4: Rewrite the top half of `src/help.ts`**

Everything from the imports down to `helpSections` is replaced. `openHelp`'s DOM building is unchanged apart from its signature.

```ts
import { ACTIONS, defaultBinding, type ActionEntry, type ActionGroup } from './actions';
import { type Mode } from './modes';
import { openOverlay } from './overlay';
import type { Settings } from './settings';
import { isModified } from './shortcuts';

// One row of the help dialog: the keys you press, and what they do.
export type Shortcut = { keys: string; action: string };
// The blurb says what the screen is; the shortcuts say how to work it. A key list on its own teaches
// someone the gestures and not the thing they are gestures for.
export type Section = { title: string; blurb: string; shortcuts: Shortcut[] };

const MODE_NAMES: Record<Mode, string> = { terminals: 'Terminals', nvim: 'nvim', board: 'Board' };

// What each screen and each group is, for the person who has not been told. The things worth knowing
// are the ones that are not visible: that a shell survives leaving the page, that nvim is not running
// yet, that the board has no save key, that settings are a file you can also edit by hand.
const BLURBS: Record<Mode | ActionGroup, string> = {
  terminals: 'Five shells in a fixed grid. They keep running while you are on another project or '
    + 'another view, so a long job is still going when you come back.',
  nvim: 'One nvim filling the window. It starts the first time you press the nvim key for this '
    + 'project, not at launch. Quit it and the pane says it exited; Enter starts it again.',
  board: 'A kanban board kept in .dashboard/board.json inside the project. Every change is written '
    + 'straight to disk, so there is no save key and undo is the only way back. The file is re-read '
    + 'each time you enter the board, not while you are looking at it. A card can be a subtask of '
    + 'another card: it stays an ordinary card in whatever column you put it in, shows a badge naming '
    + 'its parent, and counts towards the bar on that parent.',
  modes: 'A project is shown three ways and remembers which one you left it on, so jumping to it '
    + 'lands you back in the same view.',
  projects: 'One page per project, in the order along the top. The window opens on the projects the '
    + 'last run was left on, and closing it asks first, because it kills every shell in every project.',
  app: 'Every key on this list can be changed, and so can the colours, the font and the shell. They '
    + 'are kept in ~/.config/dashboard/settings.json, which you can also edit by hand — delete it and '
    + 'everything is back to how it shipped.',
};

// nvim owns its own keys; the dashboard adds none. Saying so is the answer to "what can I press here",
// even though the list is empty.
const NVIM_SHORTCUTS: Shortcut[] = [
  { keys: 'Everything else', action: 'Goes straight to nvim' },
];

function isUntouched(entries: ActionEntry[], keys: Settings['keys'], isMac: boolean): boolean {
  return entries.every((entry) => keys[entry.name] === defaultBinding(entry, isMac));
}

// A numbered run — the nine project keys, the five pane keys — prints as one row while all of it still
// holds the keys it shipped with. Move one and every one is listed, because "Ctrl+1…Ctrl+9" would then
// be naming a key that does something else.
function familyRow(entries: ActionEntry[], keys: Settings['keys'], isMac: boolean): Shortcut[] {
  const bound = entries.filter((entry) => keys[entry.name] !== null);
  if (bound.length === 0) return [];
  if (bound.length === entries.length && entries.length > 1 && isUntouched(entries, keys, isMac)) {
    return [{
      keys: `${keys[bound[0].name]}…${keys[bound[bound.length - 1].name]}`,
      action: entries[0].familyDescription ?? entries[0].description,
    }];
  }
  return bound.map((entry) => ({ keys: keys[entry.name]!, action: entry.description }));
}

// An action with no key gets no row: this dialog answers "what can I press here", and you cannot press
// an unbound action. The settings screen is where every action is listed whether it has a key or not.
function groupShortcuts(
  group: ActionGroup, mode: Mode, keys: Settings['keys'], isMac: boolean,
): Shortcut[] {
  const rows: Shortcut[] = [];
  const families = new Set<string>();
  for (const entry of ACTIONS) {
    if (entry.group !== group) continue;
    if (entry.family !== undefined) {
      if (families.has(entry.family)) continue;
      families.add(entry.family);
      rows.push(...familyRow(ACTIONS.filter((row) => row.family === entry.family), keys, isMac));
      continue;
    }
    const binding = keys[entry.name];
    if (binding === null) continue;
    // The key naming the mode you are already in is listed too — it is passed through to whatever runs
    // there, and that is worth saying rather than leaving it a mystery.
    const passedThrough = entry.action.kind === 'mode-set' && entry.action.mode === mode;
    rows.push({
      keys: binding,
      action: passedThrough ? 'already here — the screen gets the keystroke' : entry.description,
    });
  }
  return rows;
}

// The screen you are on comes first: it is what you pressed the help key to ask about. The keys that
// answer from everywhere follow, since they are the ones you already half know.
export function helpSections(mode: Mode, keys: Settings['keys'], isMac: boolean): Section[] {
  const screen: Section = {
    title: MODE_NAMES[mode],
    blurb: BLURBS[mode],
    shortcuts: mode === 'nvim' ? NVIM_SHORTCUTS : groupShortcuts(mode, mode, keys, isMac),
  };
  const rest: ActionGroup[] = ['modes', 'projects', 'app'];
  return [screen, ...rest.map((group) => ({
    title: { modes: 'Modes', projects: 'Projects', app: 'Dashboard' }[group],
    blurb: BLURBS[group],
    shortcuts: groupShortcuts(group, mode, keys, isMac),
  }))];
}
```

`groupShortcuts(mode, mode, ...)` works because the group names `terminals` and `board` are spelled the same as the modes.

- [ ] **Step 5: Change `openHelp`'s signature and its footer**

```ts
export function openHelp(mode: Mode, keys: Settings['keys'], isMac: boolean): Promise<void> {
```

and inside, `for (const section of helpSections(mode, keys, isMac))`. Change the footer line, which names a key that can now move:

```ts
    const helpKey = keys.help ?? 'nothing — the help key is unbound';
    footer.textContent = `${helpKey} opens this. Escape or Enter closes it.`;
```

- [ ] **Step 6: Update the call site in `src/renderer.ts`**

```ts
function showHelp(): void {
  openHelp(pages[activeIndex]?.mode ?? 'terminals', settings.keys, isMac)
    .then(() => showPage(activeIndex));
}
```

- [ ] **Step 7: Run it and watch it pass**

Run: `npx vitest run src/help.test.ts` then `npm test && npx tsc --noEmit && npx eslint .`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/actions.ts src/help.ts src/help.test.ts src/renderer.ts
git commit -m "help: print the keys from the table instead of a hand-written list

The board rows, the terminal rows and the projects rows were each written out by
hand and kept in step by a rule in CLAUDE.md. They come from the action table
now, so rebinding a key changes what the dialog says.

An unbound action gets no row — you cannot press it. A numbered run collapses to
Ctrl+1…Ctrl+9 only while all nine still hold the key they shipped with."
```

---

### Task 8: The theme and the font come from the settings, live

Every pane on every page repaints when a colour changes. The window's own background — the margin behind the panes — is painted by the main process before the renderer exists, so that one keeps the old colour until the next launch.

**Files:**
- Modify: `src/renderer.ts` — `applyAppearance`, and `buildPane` reads the settings
- Modify: `src/theme.ts` — a comment saying `THEME` is now the default rather than the theme

**Interfaces:**
- Consumes: `type Settings` from `src/settings.ts`.
- Produces: `applyAppearance(): void` inside `renderer.ts`, called at startup and after every settings change.

- [ ] **Step 1: Replace the constants and the startup loop in `src/renderer.ts`**

Delete these lines:

```ts
const FONT_NAME = 'JetBrains Mono';
const FONT_SIZE = 13;

for (const [name, value] of Object.entries(THEME)) {
  document.documentElement.style.setProperty(`--${name}`, String(value));
}
document.documentElement.style.setProperty('--title-bar-height', `${TITLE_BAR_HEIGHT}px`);
```

and put this in their place, below the `settings` declaration added in Task 4:

```ts
document.documentElement.style.setProperty('--title-bar-height', `${TITLE_BAR_HEIGHT}px`);

function fontFamily(): string {
  return `"${settings.font.name}", Menlo, Monaco, monospace`;
}

// Every colour goes out twice: as a CSS custom property, which index.css styles the chrome from, and
// into every pane's own palette. Both have to move together or the board sits on one background while
// the shell beside it sits on another.
//
// The window's own background is not here. Main paints it before the renderer exists, so it keeps the
// old colour until the next launch — visible only in the margin around the panes.
function applyAppearance(): void {
  for (const [name, value] of Object.entries(settings.theme)) {
    document.documentElement.style.setProperty(`--${name}`, value);
  }
  for (const pane of panesById.values()) {
    // A plain record of hex strings on the way in; xterm names the colours it knows. parseSettings
    // has already dropped anything that is not one of them, so the shapes agree.
    pane.terminal.options.theme = settings.theme as ITheme;
    pane.terminal.options.fontFamily = fontFamily();
    pane.terminal.options.fontSize = settings.font.size;
  }
  // The cell size changes with the font, so every pane has to be measured again or the grid keeps the
  // old one and the last row is cut off.
  fitAllPages();
}
```

`applyAppearance` reads `panesById` and `fitAllPages`, so it must be declared after both. Put it directly above `function focusTerminal`.

- [ ] **Step 2: Make `buildPane` read the settings**

In `buildPane`, replace the three constants in the `new Terminal({ ... })` call:

```ts
    fontSize: settings.font.size,
    fontFamily: fontFamily(),
    theme: settings.theme as ITheme,
```

The `THEME` import in `renderer.ts` is now unused — drop it, keeping `TITLE_BAR_HEIGHT`. Add `import type { ITheme } from '@xterm/xterm';` beside the existing `Terminal` import.

- [ ] **Step 3: Load the right font at startup and apply the appearance**

In `start()`, after the settings are read:

```ts
  // xterm measures cell size when a pane opens, so both weights must be in before openProject()
  // builds one, or the glyphs misalign.
  await Promise.all([
    document.fonts.load(`${settings.font.size}px "${settings.font.name}"`),
    document.fonts.load(`bold ${settings.font.size}px "${settings.font.name}"`),
  ]);
  applyAppearance();
```

`document.fonts.load` on a family the machine does not have resolves with nothing loaded rather than throwing, and xterm falls back to Menlo. A font name the user typed wrongly costs them the font, not the window.

- [ ] **Step 4: Note what `THEME` is now, in `src/theme.ts`**

Change the comment above `export const THEME` so it says this is the theme the app ships with and that `settings.json` overrides any colour in it. Keep every value.

- [ ] **Step 5: Check it by hand**

Do NOT touch the installed app. Write a settings file and run a development copy:

```bash
mkdir -p ~/.config/dashboard
cat > ~/.config/dashboard/settings.json <<'JSON'
{ "theme": { "background": "#1a1b26", "red": "#ff007c" }, "font": { "size": 15 } }
JSON
npm start
```

Expected: the panes and the status bar are on the dark blue background, the font is bigger, and the grid still fills the window with no cut-off last row. Then delete the file and run again: everything is back to the stock look.

- [ ] **Step 6: Run the whole check set and commit**

Run: `npm test && npx tsc --noEmit && npx eslint .`

```bash
git add src/renderer.ts src/theme.ts
git commit -m "settings: paint the panes and the chrome from the settings file

Every colour goes out as a CSS custom property and into every pane's palette at
once, so the board and the shell beside it never sit on different backgrounds.
The font change re-measures every pane, or the grid keeps the old cell size and
cuts off the last row."
```

---

### Task 9: The settings screen, and its keys

An overlay on the same sheet as the help dialog and the picker. This task builds the row list, the walking, and everything about rebinding: arm, capture, unbind, and the confirmation when a key is already taken.

**Files:**
- Create: `src/settings-rows.ts`, `src/settings-rows.test.ts`, `src/settings-view.ts`
- Modify: `src/overlay.ts` — `confirmOverlay` takes the line under the question
- Modify: `src/renderer.ts` — `showSettings` opens it; `.settings` joins the list of dialogs that own their keys
- Modify: `src/index.css` — the sheet and the rows

**Interfaces:**
- Consumes: `ACTIONS`, `type ActionGroup` from `src/actions.ts`; `formatBinding`, `keystrokeOf` from `src/binding.ts`; `bindKey`, `holderOfBinding`, `resetKeys`, `defaultSettings`, `isHexColor`, `type Settings` from `src/settings.ts`; `confirmOverlay`, `openOverlay` from `src/overlay.ts`.
- Produces:
  - `type SettingsRow` and `settingsRows(settings: Settings): SettingsRow[]` from `settings-rows.ts`
  - `stepSelection(rows: SettingsRow[], index: number, step: number): number`
  - `openSettings(settings: Settings, isMac: boolean, onChange: (next: Settings) => void): Promise<void>` from `settings-view.ts`

- [ ] **Step 1: Write the failing row-model test**

Create `src/settings-rows.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { settingsRows, stepSelection } from './settings-rows';
import { ACTIONS } from './actions';
import { bindKey, defaultSettings } from './settings';

const settings = defaultSettings(true);
const rows = settingsRows(settings);

describe('settingsRows', () => {
  it('lists every action, bound or not, unlike the help dialog', () => {
    const unbound = settingsRows(bindKey(settings, 'help', null));
    const named = unbound.filter((row) => row.kind === 'key').map((row) => row.name);
    // Set, not list: the screen groups its rows in its own order, which is not the table's.
    expect(new Set(named)).toEqual(new Set(ACTIONS.map((entry) => entry.name)));
    expect(named).toHaveLength(ACTIONS.length);
    expect(unbound.find((row) => row.kind === 'key' && row.name === 'help')?.binding).toBeNull();
  });

  it('lists every colour, the font, the shell and the two resets', () => {
    const kinds = rows.map((row) => row.kind);
    expect(rows.filter((row) => row.kind === 'color')).toHaveLength(Object.keys(settings.theme).length);
    expect(kinds).toContain('font-name');
    expect(kinds).toContain('font-size');
    expect(kinds).toContain('shell');
    expect(kinds).toContain('reset-keys');
    expect(kinds).toContain('reset-all');
  });

  it('opens with a heading, and headings are not selectable', () => {
    expect(rows[0].kind).toBe('heading');
    expect(stepSelection(rows, 0, 0)).toBe(1);
  });
});

describe('stepSelection', () => {
  it('skips the headings in both directions', () => {
    const forward = stepSelection(rows, 1, 1);
    expect(rows[forward].kind).not.toBe('heading');
    const backward = stepSelection(rows, forward, -1);
    expect(backward).toBe(1);
  });

  it('stops at the ends rather than wrapping, so a long list has a top and a bottom', () => {
    expect(stepSelection(rows, 1, -1)).toBe(1);
    const last = stepSelection(rows, rows.length - 1, 0);
    expect(stepSelection(rows, last, 1)).toBe(last);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/settings-rows.test.ts`
Expected: FAIL — `Failed to resolve import "./settings-rows"`.

- [ ] **Step 3: Write `src/settings-rows.ts`**

```ts
import { ACTIONS, type ActionGroup } from './actions';
import type { Settings } from './settings';

// One line of the settings screen. Headings are printed and walked past; everything else can be
// selected and changed. Kept apart from the view so the walking is testable without a browser.
export type SettingsRow =
  | { kind: 'heading'; label: string }
  | { kind: 'key'; name: string; label: string; binding: string | null }
  | { kind: 'color'; name: string; label: string; value: string }
  | { kind: 'font-name'; label: string; value: string }
  | { kind: 'font-size'; label: string; value: string }
  | { kind: 'shell'; label: string; value: string }
  | { kind: 'reset-keys'; label: string }
  | { kind: 'reset-all'; label: string };

const GROUP_TITLES: Record<ActionGroup, string> = {
  app: 'Dashboard',
  modes: 'Modes',
  projects: 'Projects',
  terminals: 'Terminals',
  board: 'Board',
};

const GROUP_ORDER: ActionGroup[] = ['app', 'modes', 'projects', 'terminals', 'board'];

export function settingsRows(settings: Settings): SettingsRow[] {
  const rows: SettingsRow[] = [];
  for (const group of GROUP_ORDER) {
    rows.push({ kind: 'heading', label: GROUP_TITLES[group] });
    // Every action, bound or not. The help dialog leaves out the unbound ones because you cannot press
    // them; this is the screen where you give one a key, so it has to show them.
    for (const entry of ACTIONS) {
      if (entry.group !== group) continue;
      rows.push({
        kind: 'key', name: entry.name, label: entry.description, binding: settings.keys[entry.name],
      });
    }
  }
  rows.push({ kind: 'heading', label: 'Colours' });
  for (const [name, value] of Object.entries(settings.theme)) {
    rows.push({ kind: 'color', name, label: name, value });
  }
  rows.push({ kind: 'heading', label: 'Font' });
  rows.push({ kind: 'font-name', label: 'Font', value: settings.font.name });
  rows.push({ kind: 'font-size', label: 'Size', value: String(settings.font.size) });
  rows.push({ kind: 'heading', label: 'Shell' });
  rows.push({
    kind: 'shell', label: 'Shell command', value: settings.shellCommand,
  });
  rows.push({ kind: 'heading', label: 'Reset' });
  rows.push({ kind: 'reset-keys', label: 'Reset every key to its default' });
  rows.push({ kind: 'reset-all', label: 'Reset everything to defaults' });
  return rows;
}

// Headings are walked past, not landed on. A step of 0 finds the nearest selectable row at or after
// the index, which is how the screen opens on the first real row rather than on a heading.
export function stepSelection(rows: SettingsRow[], index: number, step: number): number {
  const forward = step >= 0;
  for (let at = index + step; at >= 0 && at < rows.length; at += forward ? 1 : -1) {
    if (rows[at].kind !== 'heading') return at;
  }
  // Nothing further that way: stay put. A list this long is easier to keep your place in when the top
  // and the bottom are ends rather than a loop back round.
  return rows[index]?.kind === 'heading' ? stepSelection(rows, index, forward ? 1 : -1) : index;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/settings-rows.test.ts`
Expected: PASS.

- [ ] **Step 5: Let `confirmOverlay` say something other than "delete"**

In `src/overlay.ts`, give it a second argument. The existing call in `board-view.ts` passes nothing and keeps the wording it has:

```ts
export function confirmOverlay(message: string, keysLine = 'Enter deletes. Escape keeps it.'): Promise<boolean> {
```

and use `keysLine` instead of the hard-coded string in `keys.textContent`.

- [ ] **Step 6: Write `src/settings-view.ts`**

```ts
// Modifier keys pressed on their own are not a binding — you are still on your way to one. Without
// this, arming a row and reaching for Ctrl+Shift+K binds Ctrl the moment your finger lands.
const MODIFIER_CODES = /^(Control|Shift|Alt|Meta)(Left|Right)$/;

export function openSettings(
  initial: Settings,
  isMac: boolean,
  onChange: (next: Settings) => void,
): Promise<void> {
  return new Promise<void>((resolve) => {
    let settings = initial;
    let rows = settingsRows(settings);
    let selected = stepSelection(rows, 0, 0);
    // The row waiting for a keystroke, or null. While a row is armed this screen reads modified keys,
    // which every other dialog refuses to do — reading them is the whole job. CLAUDE.md names it.
    let armed: string | null = null;
    let message = '';
    let editor: HTMLInputElement | null = null;

    function close(): void {
      remove();
      resolve();
    }

    const { dialog, remove } = openOverlay('settings', close);

    function commit(next: Settings): void {
      settings = next;
      onChange(settings);
      rows = settingsRows(settings);
      render();
    }

    function say(text: string): void {
      message = text;
      render();
    }

    // The key you pressed, written the way the file writes it. Null for a key with no written form —
    // a media key, a keyboard's own extra button — which is refused rather than stored as something
    // nobody could read back or type again.
    async function capture(event: KeyboardEvent): Promise<void> {
      if (MODIFIER_CODES.test(event.code)) return;
      const name = armed!;
      armed = null;
      const binding = formatBinding(keystrokeOf(event));
      if (binding === null) return say('That key has no written form, so it cannot be bound.');
      const taken = holderOfBinding(settings, name, binding);
      if (taken !== null) {
        const takenLabel = actionByName(taken)?.description ?? taken;
        const yes = await confirmOverlay(
          `${binding} is already "${takenLabel}".`,
          'Enter takes the key and leaves that one unbound. Escape cancels.',
        );
        // The confirmation had the keyboard; the settings screen needs it back either way.
        dialog.focus();
        if (!yes) return say('');
      }
      commit(bindKey(settings, name, binding));
      say('');
    }

    // ... render(), the keydown handler and the text editor follow; see the steps below.
  });
}
```

The imports at the top of the file are:

```ts
import { actionByName } from './actions';
import { formatBinding, keystrokeOf } from './binding';
import { confirmOverlay, openOverlay } from './overlay';
import {
  bindKey, defaultSettings, holderOfBinding, isHexColor, resetKeys, type Settings,
} from './settings';
import { settingsRows, stepSelection, type SettingsRow } from './settings-rows';
import { isModified } from './shortcuts';
```

`isHexColor` is used by Task 10 and can be left out until then.

Write the rest of the file in the same closure. `render()` rebuilds the list:

```ts
    function render(): void {
      const list = document.createElement('ul');
      list.className = 'settings-list';
      rows.forEach((row, index) => {
        const item = document.createElement('li');
        item.className = row.kind === 'heading' ? 'settings-heading' : 'settings-row';
        if (index === selected) item.classList.add('selected');
        if (row.kind === 'heading') {
          item.textContent = row.label;
        } else {
          const label = document.createElement('span');
          label.className = 'settings-label';
          label.textContent = row.label;
          const value = document.createElement('span');
          value.className = 'settings-value';
          if (row.kind === 'color') {
            const swatch = document.createElement('span');
            swatch.className = 'settings-swatch';
            swatch.style.background = row.value;
            value.append(swatch, document.createTextNode(row.value));
          } else if (row.kind === 'key') {
            value.textContent = index === selected && armed !== null
              ? 'press a key…'
              : row.binding ?? 'unbound';
            if (row.binding === null) value.classList.add('unbound');
          } else if (row.kind === 'reset-keys' || row.kind === 'reset-all') {
            value.textContent = 'Enter';
          } else {
            value.textContent = row.value === '' ? 'from the environment' : row.value;
          }
          item.append(label, value);
        }
        list.append(item);
      });
      const footer = document.createElement('p');
      footer.className = 'settings-footer';
      footer.textContent = message !== '' ? message
        : 'Enter changes the row. x unbinds a key. Escape closes. '
          + 'Kept in ~/.config/dashboard/settings.json.';
      if (message !== '') footer.classList.add('settings-message');
      dialog.replaceChildren(list, footer);
      list.children[selected]?.scrollIntoView({ block: 'nearest' });
      if (editor !== null) editor.focus();
    }
```

The keydown handler. The armed branch is deliberately ahead of the `isModified` guard, and it is the only place in the app that is:

```ts
    dialog.addEventListener('keydown', (event) => {
      // The one deliberate exception to "check isModified first". A row waiting for a key has to read
      // Ctrl, Cmd, Alt and Shift, or those are the only keys you could never bind.
      if (armed !== null) {
        event.preventDefault();
        event.stopPropagation();
        void capture(event);
        return;
      }
      // The text box owns every key while a colour or the shell is being typed; its own handler ends it.
      if (editor !== null) return;
      if (isModified(event)) return;
      const row = rows[selected];
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          selected = stepSelection(rows, selected, 1);
          return render();
        case 'ArrowUp':
          event.preventDefault();
          selected = stepSelection(rows, selected, -1);
          return render();
        case 'Escape':
          event.preventDefault();
          return close();
        case 'Enter':
          event.preventDefault();
          return activate(row);
        case 'x':
          if (row.kind !== 'key') return;
          event.preventDefault();
          return commit(bindKey(settings, row.name, null));
        default:
          return;
      }
    });
```

`activate` arms a key row, opens the editor for a text row, and does the resets:

```ts
    function activate(row: SettingsRow): void {
      if (row.kind === 'key') {
        armed = row.name;
        return say('');
      }
      if (row.kind === 'reset-keys') return commit(resetKeys(settings, isMac));
      if (row.kind === 'reset-all') return commit(defaultSettings(isMac));
      if (row.kind === 'heading') return;
      return startEditing(row);
    }
```

Task 10 writes `startEditing`. For this task, stub it so the keys half runs on its own:

```ts
    // Task 10 fills this in.
    function startEditing(_row: SettingsRow): void {}
```

Finish the closure with the first paint:

```ts
    render();
    // openOverlay already made the dialog focusable; this is what takes the keyboard off the page
    // behind it, so the window listener never sees a keystroke meant for this screen.
    dialog.focus();
```

- [ ] **Step 7: Open it from the renderer**

Replace the placeholder `showSettings` from Task 5:

```ts
function showSettings(): void {
  openSettings(settings, isMac, (next) => {
    settings = next;
    bridge.saveSettings(next);
    applyAppearance();
  }).then(() => showPage(activeIndex));
}
```

and add `.settings` to the list of dialogs that own every key typed inside them:

```ts
  if (event.target instanceof Element && event.target.closest(
    '.picker, .help, .confirm, .card-detail, .board-edit, .settings',
  )) return;
```

**This one line matters more than it looks.** Without it the window listener sees the keystroke first, and arming a row then pressing `Ctrl+B` switches the page to the board behind the dialog instead of binding the key.

- [ ] **Step 8: Style it in `src/index.css`**

Add `.settings` to the `.picker, .help, .confirm, .card-detail` sheet rule and `.settings-dialog` to the dialog rule beside `.help-dialog`. Then:

```css
/* Settings: one row per thing you can change, walked with the arrows. Taller than the help dialog
   because the list is every action there is, not only the ones with a key. */
.settings-dialog {
  overflow-y: auto;
  padding: 10px 0;
  outline: none;
  max-height: 74vh;
}

.settings-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.settings-heading {
  margin: 8px 0 4px;
  padding: 0 12px;
  color: var(--blue);
}

.settings-row {
  display: flex;
  gap: 12px;
  padding: 2px 12px;
}

.settings-row.selected {
  background: var(--brightBlack);
}

.settings-label {
  flex: 1;
  color: var(--white);
}

/* Fixed column so every value lines up down the right and the eye can scan one side of it. */
.settings-value {
  flex: none;
  width: 24ch;
  color: var(--brightWhite);
}

.settings-value.unbound {
  color: var(--brightBlack);
}

.settings-swatch {
  display: inline-block;
  width: 1ch;
  height: 1em;
  margin-right: 1ch;
  border: 1px solid var(--brightBlack);
  vertical-align: text-bottom;
}

.settings-footer {
  margin: 10px 0 0;
  padding: 8px 12px 0;
  border-top: 1px solid var(--brightBlack);
  color: var(--brightBlack);
}

.settings-message {
  color: var(--yellow);
}
```

- [ ] **Step 9: Check it by hand**

Run: `npm start`, then `Ctrl+,`.

Expected: the list opens on the first row under "Dashboard"; the arrows walk it and skip the headings; `Enter` on a key row shows `press a key…`; pressing `Ctrl+J` binds it and the row shows `Ctrl+J`; `x` on a row shows `unbound` in grey; `Enter` then `Ctrl+S` on a board row asks "Ctrl+S is already 'Open the project list'" and `Escape` leaves both alone; `Enter` on "Reset every key to its default" puts them all back. Close with `Escape`, open `Ctrl+H`, and check the help dialog shows whatever you bound. Check `~/.config/dashboard/settings.json` has the change in it.

- [ ] **Step 10: Run the whole check set and commit**

Run: `npm test && npx tsc --noEmit && npx eslint .`

```bash
git add src/settings-rows.ts src/settings-rows.test.ts src/settings-view.ts \
  src/overlay.ts src/renderer.ts src/index.css
git commit -m "settings: a screen for the keys

Every action is listed, with or without a key. Enter arms a row and the next
keystroke becomes its binding; x takes the key away. If another action already
holds the key, a confirmation names it and takes it only if you say so.

An armed row is the one place that reads a modified key before checking for one.
Without that, Ctrl, Cmd, Alt and Shift would be the only keys you could never
bind."
```

---

### Task 10: Editing a colour, the font and the shell

The same gesture the board already uses for a card title: `Enter` opens a small text box in the row, `Escape` commits, and a value that will not do is refused with a message saying why.

**Files:**
- Modify: `src/settings-view.ts` — `startEditing` is filled in
- Modify: `src/settings.ts` — the two refusals get their predicates
- Modify: `src/settings.test.ts` — one test each
- Modify: `src/index.css` — the row's text box

**Interfaces:**
- Consumes: `isHexColor` from `src/settings.ts`.
- Produces: `isFontSize(value: string): boolean` from `src/settings.ts`; `startEditing(row: SettingsRow): void` inside `settings-view.ts`.

- [ ] **Step 1: Write the failing test**

Add to `src/settings.test.ts`:

```ts
import { isFontSize, isHexColor } from './settings';

describe('the two refusals the settings screen prints', () => {
  it('takes a six-digit hex colour and nothing else', () => {
    expect(isHexColor('#cc6666')).toBe(true);
    expect(isHexColor('#CC6666')).toBe(true);
    expect(isHexColor('#ccc')).toBe(false);
    expect(isHexColor('cc6666')).toBe(false);
    expect(isHexColor('red')).toBe(false);
    expect(isHexColor('')).toBe(false);
  });

  // Outside this range you get a window of panes you cannot read and no way to see the screen that
  // would put it back.
  it('takes a font size between 6 and 72', () => {
    expect(isFontSize('13')).toBe(true);
    expect(isFontSize('13.5')).toBe(true);
    expect(isFontSize('5')).toBe(false);
    expect(isFontSize('73')).toBe(false);
    expect(isFontSize('big')).toBe(false);
    expect(isFontSize('')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/settings.test.ts`
Expected: FAIL — `isFontSize` is not exported.

- [ ] **Step 3: Export the predicate from where the refusal is decided**

In `src/settings.ts`, add beside `isHexColor`:

```ts
// The same range parseSettings holds a stored size to. Exported because the settings screen prints the
// message: one place decides the refusal and another shows it, so they must not each hold their own idea
// of what is allowed.
export function isFontSize(value: string): boolean {
  const size = Number(value);
  return value.trim() !== '' && Number.isFinite(size) && size >= 6 && size <= 72;
}
```

Then use it in `parseSettings` so the file and the screen cannot disagree:

```ts
      size: typeof storedFont.size === 'number' && isFontSize(String(storedFont.size))
        ? storedFont.size : defaults.font.size,
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Fill in `startEditing` in `src/settings-view.ts`**

Replace the stub:

```ts
    // Enter opens a box in the row, Escape commits — the same gesture the board uses for a card title.
    // Enter commits too: unlike a card description there is never a newline to type here.
    function startEditing(row: SettingsRow): void {
      if (row.kind === 'heading' || row.kind === 'key'
        || row.kind === 'reset-keys' || row.kind === 'reset-all') return;
      const input = document.createElement('input');
      input.className = 'settings-edit';
      input.value = row.value;
      editor = input;
      // Replaces the value in the row that is already on screen, so nothing moves under your hand.
      const item = dialog.querySelectorAll('.settings-row, .settings-heading')[selected];
      item?.querySelector('.settings-value')?.replaceChildren(input);
      input.focus();
      input.select();

      function finish(save: boolean): void {
        editor = null;
        if (!save) {
          dialog.focus();
          return render();
        }
        const text = input.value.trim();
        dialog.focus();
        if (row.kind === 'color') {
          if (!isHexColor(text)) return say(`"${text}" is not a colour. Write it as #cc6666.`);
          return commit({ ...settings, theme: { ...settings.theme, [row.name]: text } });
        }
        if (row.kind === 'font-size') {
          if (!isFontSize(text)) return say(`"${text}" is not a font size. Anything from 6 to 72.`);
          return commit({ ...settings, font: { ...settings.font, size: Number(text) } });
        }
        if (row.kind === 'font-name') {
          // A font the machine does not have is not something this can check: the browser reports no
          // error and xterm falls back to Menlo. An empty name means the one it shipped with.
          const name = text === '' ? defaultSettings(isMac).font.name : text;
          return commit({ ...settings, font: { ...settings.font, name } });
        }
        // The shell. Empty is the file saying "work it out from the environment", which is a real
        // answer rather than a blank, so there is nothing to refuse.
        commit({ ...settings, shellCommand: text });
      }

      input.addEventListener('keydown', (event) => {
        // A dialog has focus, so no pane can hear this anyway, and Cmd+Enter is not a commit.
        if (isModified(event)) return;
        if (event.key !== 'Enter' && event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        // Enter and Escape both commit, exactly as the board's title editor does. Two screens that
        // disagreed about what Escape means would be worse than either answer.
        finish(true);
      });
      input.addEventListener('blur', () => finish(true));
    }
```

`finish` still takes its `save` argument because `blur` and a future cancel path both use it; today every caller passes `true`.

Add `isFontSize` and `isHexColor` to the `./settings` import.

- [ ] **Step 6: Style the box in `src/index.css`**

```css
/* The row's own text box, sized to the value column so the list does not jump when one opens. */
.settings-edit {
  width: 100%;
  padding: 0;
  border: none;
  border-bottom: 1px solid var(--blue);
  background: transparent;
  font: inherit;
  color: var(--brightWhite);
  outline: none;
}
```

- [ ] **Step 7: Check it by hand**

Run: `npm start`, then `Ctrl+,`.

Expected: arrow down to Colours, `Enter` on `background`, type `#1a1b26`, `Escape` — every pane and the status bar repaint at once. `Enter` on `red`, type `nonsense`, `Escape` — the row is unchanged and the footer says it is not a colour. `Enter` on Size, type `16` — the panes re-measure and the grid still fills the window. `Enter` on the shell row, type `/bin/bash`, `Escape`, then `Ctrl+S` and open a project: its five shells are bash while the panes already running are still what they were.

- [ ] **Step 8: Run the whole check set and commit**

Run: `npm test && npx tsc --noEmit && npx eslint .`

```bash
git add src/settings.ts src/settings.test.ts src/settings-view.ts src/index.css
git commit -m "settings: edit a colour, the font and the shell from the row

Enter opens a box in the row and Escape commits, the same gesture a card title
uses. A colour that is not a colour and a size outside 6 to 72 are refused, and
the predicate that decides each refusal is the one the file is parsed with —
so the screen and the file cannot hold different ideas of what is allowed."
```

---

### Task 11: Make `Ctrl+H` and `CLAUDE.md` tell the truth

The keys and the blurbs are separate halves of the help dialog, and only the keys look after themselves now. This task finishes the other half and rewrites the two hard rules this change made false.

**Files:**
- Modify: `src/help.ts` — the settings blurb and the stale key names in the existing blurbs
- Modify: `src/index.css` — the comment on `.help-keys`
- Modify: `CLAUDE.md` — two hard rules
- Modify: `.dashboard/board.json` — the card moves to Done
- Modify: `README.md` — if it names any shortcut or says the app is not configurable

- [ ] **Step 1: Read every blurb against what the app now does**

In `src/help.ts`, the three screen blurbs name keys by their shipped spelling. Any that still says "press Ctrl+N" is wrong the moment someone rebinds it — Task 7 already changed the nvim blurb to "the nvim key"; check the other two the same way, and check the board blurb still says "undo" rather than "u".

The `app` blurb Task 7 added is the settings screen's only home in the help dialog. Confirm it says three things: that every key on the list can be changed, where the file is, and that deleting the file puts everything back.

- [ ] **Step 2: Fix the comment on `.help-keys` in `src/index.css`**

It says the column is wide enough for `"Ctrl+Right / Ctrl+Left"`, a row that no longer exists — each row names one binding now. Replace the reasoning with the longest a binding can be, `Ctrl+Cmd+Alt+Shift+Backspace`, and widen the column if `22ch` no longer fits it.

- [ ] **Step 3: Rewrite the two hard rules in `CLAUDE.md`**

Under **The help dialog is part of the change**, the bullet about the keys is now false: the board rows and the project rows are no longer written out by hand. Replace that bullet with one saying the keys come from `src/actions.ts`, so adding a shortcut means adding a row to that table and nothing else — and that the blurb is still yours to keep true.

Under **Mode keys pass through**, the sentence "So every keydown handler reaches `if (isModified(event)) return;` before it acts on `event.key`" now has a third exception. Add it to the list of keys read before that guard, in the same shape as the other two:

> - Every key, in the settings screen, while a row is armed. A row waiting for a binding has to read Ctrl, Cmd, Alt and Shift, or those four are the only keys you could never bind. It is one keystroke long and puts the guard back immediately after.

Also add a line saying the mode keys are `MODE_KEYS` no longer — they are three rows in `src/actions.ts` and can be rebound, and the pass-through rule is checked on the action rather than the key so it follows a rebinding.

- [ ] **Step 4: Add a settings section to `README.md`**

Six or seven lines: where the file is, that every field is optional, that a binding is written `Ctrl+Shift+K`, that `null` means no key, and that deleting the file puts everything back. If the README says anywhere that the shell comes from `SHELL_COMMAND` or that the theme is fixed, fix that too.

- [ ] **Step 5: Move the card on the board**

In `.dashboard/board.json`, move the card titled "A settings screen, with the keyboard shortcuts in it" from Todo to the top of Done, and rewrite its `notes` to say what shipped:

```
Every key, the theme, the font and the shell live in ~/.config/dashboard/settings.json, and Ctrl+, edits them from the keyboard. One table in actions.ts names every action once; the handler, the help dialog and the settings screen all read it, so a shortcut is no longer written out in three places. A binding is a string like Ctrl+Shift+K and matches the physical key, so Option+H is Option+H whatever character the keyboard reported. Delete the file and everything is back to how it shipped.
```

- [ ] **Step 6: Run everything one last time**

Run: `npm test && npx tsc --noEmit && npx eslint .`
Then: `npm start`, press `Ctrl+H` on each of the three screens, and read every row. A key it names that does nothing, or a key that works and is not named, is a bug in this task.

- [ ] **Step 7: Commit**

```bash
git add src/help.ts src/index.css CLAUDE.md README.md .dashboard/board.json
git commit -m "docs: say what the settings screen changed

Two hard rules were made false by it. The help dialog's board and project rows
are no longer written out by hand, and the settings screen reads a modified key
before checking for one, which every other handler is forbidden to do."
```

- [ ] **Step 8: Say what is left**

Do not rebuild or restart the installed app. Report that the installed Dashboard needs a rebuild and a restart to pick this up, and that restarting kills every shell in every project.

---

## Self-review

Checked against `docs/superpowers/specs/2026-09-06-settings-screen-design.md`:

| Spec section | Task |
|---|---|
| The file: location, shape, per-field fallback | 3, 4 |
| Bindings are strings; canonical form; physical key | 1, 3 |
| The action table | 2 |
| Matching; mode pass-through; `isModified` | 5 |
| Board keys through the same lookup | 6 |
| Help dialog prints from the table | 7 |
| The screen: overlay, walking, arm, capture, unbind, conflict | 9 |
| The screen: colours, font, shell | 10 |
| Reset rows, and the file as the way back | 9 (rows), 3 (`resetKeys`), 11 (README) |
| Live or not: keys, colours, font, window background, shell | 8, 4 |
| `SHELL_COMMAND_FLAG` deleted | 4 |
| Testing | every task |

Two things the spec named that are worth calling out because they are easy to skip:

- **Task 5 leaves the board's keys broken for one commit.** Task 6 closes it. Whoever runs this must not stop between them.
- **Task 9's one-line change to the window listener** — adding `.settings` to the `closest()` list — is what stops `Ctrl+B` switching the page behind the dialog while a row is armed.
