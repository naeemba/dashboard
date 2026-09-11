import { describe, expect, it } from 'vitest';
import { MODE_NAMES, UNBOUND_SHORTCUTS, helpSections, type Shortcut } from './help';
import { mapShortcut } from './shortcuts';
import { ACTIONS } from './actions';
import { parseBinding } from './binding';
import { isSection } from './manager-sections';
import { bindKey, defaultSettings } from './settings';
import { key } from './test-key';
import type { Mode } from './modes';

const mac = defaultSettings(true).keys;
// Every screen the dialog can be opened on, read back from the table help.ts prints from, so a new mode
// cannot be added without the tests below asking about it.
const SCREENS = Object.keys(MODE_NAMES) as Mode[];

function titles(mode: Mode, onManagerPage = false, keys = mac, isMac = true): string[] {
  return helpSections(mode, onManagerPage, keys, isMac).map((section) => section.title);
}

function rows(mode: Mode, onManagerPage = false, keys = mac, isMac = true) {
  return helpSections(mode, onManagerPage, keys, isMac).flatMap((section) => section.shortcuts);
}

describe('helpSections', () => {
  it('puts the screen you are on first', () => {
    expect(titles('board')[0]).toBe('Board');
    expect(titles('nvim')[0]).toBe('nvim');
    expect(titles('terminals')[0]).toBe('Terminals');
    expect(titles('manager')[0]).toBe('Manager');
  });

  it('gives every section a blurb, because a key list teaches the gesture and not the thing', () => {
    for (const mode of SCREENS) {
      for (const section of helpSections(mode, false, mac, true)) {
        expect(section.blurb.length, `${mode}: ${section.title}`).toBeGreaterThan(0);
      }
    }
  });

  // A screen with no keys of its own still answers "what can I press here". An empty list under the
  // heading reads as a dialog that broke rather than as an answer.
  it('never prints a screen with an empty key list', () => {
    for (const mode of SCREENS) {
      expect(helpSections(mode, false, mac, true)[0].shortcuts.length, mode).toBeGreaterThan(0);
    }
  });

  it('says the mode key you are already on is passed through', () => {
    const modes = helpSections('board', false, mac, true).find((section) => section.title === 'Modes')!;
    expect(modes.shortcuts).toContainEqual({ keys: 'Ctrl+T', action: 'Terminals mode' });
    expect(modes.shortcuts.find((shortcut) => shortcut.keys === 'Ctrl+B')?.action)
      .toBe('already here — the screen gets the keystroke');
  });

  // The drift this whole change exists to remove: every key the dialog names must be a key the
  // handler answers to, on the screen the row is printed for. Checked on both sides of the one
  // distinction the dialog cannot read from `mode` alone: `terminals` and `board` here are a
  // project's own screens, off the manager page, where a manager-page key like section-previous is
  // listed nowhere and so is not checked; `manager`, `board` and `command` are the manager's own
  // screens, where those keys are printed and must actually fire.
  it('names only keys mapShortcut actually answers to', () => {
    const cases: readonly (readonly [Mode, boolean])[] = [
      ['terminals', false], ['board', false],
      ['manager', true], ['board', true], ['command', true],
    ];
    for (const [mode, onManagerPage] of cases) {
      for (const section of helpSections(mode, onManagerPage, mac, true)) {
        for (const shortcut of section.shortcuts) {
          // The mode key you are already on is listed precisely because it does nothing here.
          if (shortcut.action.startsWith('already here')) continue;
          // A screen's unbound keys are read by the view itself, not the table this test is checking
          // against — they belong to `UNBOUND_SHORTCUTS`, and 'leaves a screen its own unbound keys'
          // below checks those instead.
          if (UNBOUND_SHORTCUTS[mode]?.some((row) => row.keys === shortcut.keys)) continue;
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
            expect(mapShortcut(pressed, mac, mode, onManagerPage), `${mode}: ${text}`).not.toBeNull();
          }
        }
      }
    }
  });

  // A screen's unbound keys are read by the view itself, so the window's lookup must not claim them.
  // The day one of these is given a row in the table, the view stops receiving it and nothing else
  // says so.
  it('leaves a screen its own unbound keys', () => {
    for (const [mode, shortcuts] of Object.entries(UNBOUND_SHORTCUTS) as [Mode, Shortcut[]][]) {
      for (const shortcut of shortcuts) {
        const stroke = parseBinding(shortcut.keys);
        if (stroke === null) continue;
        const pressed = key({
          code: stroke.code,
          ctrlKey: stroke.ctrl,
          metaKey: stroke.meta,
          altKey: stroke.alt,
          shiftKey: stroke.shift,
        });
        expect(mapShortcut(pressed, mac, mode, true), `${mode}: ${shortcut.keys}`).toBeNull();
      }
    }
  });

  it('follows a rebinding', () => {
    const rebound = bindKey(defaultSettings(true), 'board-undo', 'Ctrl+Z').keys;
    const undo = rows('board', false, rebound).find((shortcut) => shortcut.action.startsWith('Undo'));
    expect(undo?.keys).toBe('Ctrl+Z');
  });

  it('leaves out an action with no key, because you cannot press it', () => {
    const unbound = bindKey(defaultSettings(true), 'board-undo', null).keys;
    expect(rows('board', false, unbound).some((shortcut) => shortcut.action.startsWith('Undo'))).toBe(false);
  });

  it('collapses a numbered run while every one of them is untouched', () => {
    expect(rows('terminals')).toContainEqual({ keys: 'Ctrl+1…Ctrl+9', action: 'Jump to a tab' });
  });

  it('spells the run out once one of them has moved, because the range would be a lie', () => {
    const rebound = bindKey(defaultSettings(true), 'project-jump-5', 'F5').keys;
    const listed = rows('terminals', false, rebound).map((shortcut) => shortcut.keys);
    expect(listed).toContain('F5');
    expect(listed).toContain('Ctrl+4');
    expect(listed).not.toContain('Ctrl+1…Ctrl+9');
  });

  // Ctrl+1..9 is the projects on every platform, so off macOS there is no modifier left to reach a
  // pane by number, and those five ship unbound.
  it('leaves out the macOS-only terminal keys off macOS', () => {
    const listed = rows('terminals', false, defaultSettings(false).keys, false)
      .map((shortcut) => shortcut.action);
    expect(listed).not.toContain('Focus a terminal');
    expect(listed).not.toContain("Clear the shell's current line");
    expect(listed).toContain('Next terminal');
  });

  it('lists help and settings under their own heading, on every screen', () => {
    for (const mode of SCREENS) {
      const app = helpSections(mode, false, mac, true).find((section) => section.title === 'Dashboard')!;
      expect(app.shortcuts).toContainEqual({ keys: 'Ctrl+H', action: 'Open this dialog' });
      expect(app.shortcuts).toContainEqual({ keys: 'Ctrl+,', action: 'Open the settings screen' });
    }
  });

  // The only key on any screen with no row in the action table behind it, so nothing else would print
  // it and nobody would find out that a waiting pane can be answered from here.
  it('names the manager key that no binding names', () => {
    expect(rows('manager')).toContainEqual({
      keys: 'A letter, digit or symbol', action: 'Straight to the selected waiting pane',
    });
    expect(rows('board')).not.toContainEqual(
      expect.objectContaining({ keys: 'A letter, digit or symbol' }),
    );
  });

  it('has a home for every action in the table', () => {
    // The manager's own screens, checked as the manager page too, or section-previous and
    // section-next — printed only there — would never turn up.
    const printed = new Set(
      SCREENS.flatMap((mode) => rows(mode, isSection(mode)).map((row) => row.action)),
    );
    for (const entry of ACTIONS) {
      const named = printed.has(entry.description)
        || (entry.familyDescription !== undefined && printed.has(entry.familyDescription));
      expect(named, entry.name).toBe(true);
    }
  });
});
