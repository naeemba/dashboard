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
