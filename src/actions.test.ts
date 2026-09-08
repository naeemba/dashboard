import { describe, expect, it } from 'vitest';
import { ACTIONS, defaultBinding } from './actions';
import { formatBinding, parseBinding } from './binding';
import { MODES } from './modes';
import { hears } from './shortcuts';

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

  it('ships no two actions on the same key, on any screen', () => {
    // Asked screen by screen, of the same function the handler asks. Two keys only clash if one screen
    // hears them both, which is what lets the board's Up and the manager's Up ship as they are — and
    // what would catch a new scope heard on a screen that already has that key.
    for (const isMac of [true, false]) {
      for (const mode of MODES) {
        const taken = new Map<string, string>();
        for (const entry of ACTIONS) {
          if (!hears(entry.scope, mode)) continue;
          const binding = defaultBinding(entry, isMac);
          if (binding === null) continue;
          expect(taken.get(binding), `${entry.name} and ${taken.get(binding)} both ship on ${binding} in ${mode}`)
            .toBeUndefined();
          taken.set(binding, entry.name);
        }
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
