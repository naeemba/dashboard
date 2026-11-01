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

  it('leaves the macOS-only keys unbound elsewhere', () => {
    const clearLine = ACTIONS.find((entry) => entry.name === 'terminal-clear-line')!;
    expect(defaultBinding(clearLine, false)).toBeNull();
  });

  // Ctrl+1..9 is the projects on every platform, so off macOS the panes are on Alt instead.
  it('puts the pane keys on Cmd on a mac and on Alt elsewhere', () => {
    const focusFirst = ACTIONS.find((entry) => entry.name === 'terminal-focus-1')!;
    expect(defaultBinding(focusFirst, true)).toBe('Cmd+1');
    expect(defaultBinding(focusFirst, false)).toBe('Alt+1');
  });

  it('covers all nine projects, main and eight workers, and all four directions', () => {
    const names = new Set(ACTIONS.map((entry) => entry.name));
    for (let number = 1; number <= 9; number++) {
      expect(names.has(`project-jump-${number}`)).toBe(true);
      expect(names.has(`project-move-${number}`)).toBe(true);
    }
    for (let number = 1; number <= 9; number++) expect(names.has(`terminal-focus-${number}`)).toBe(true);
    for (const direction of ['left', 'right', 'up', 'down']) {
      expect(names.has(`terminal-move-${direction}`)).toBe(true);
      expect(names.has(`board-select-${direction}`)).toBe(true);
      expect(names.has(`board-move-${direction}`)).toBe(true);
    }
  });
});
