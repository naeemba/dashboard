import { OVERLAY_SELECTOR } from '../app/overlay';
import type { Mode } from '../../shared/keys/modes';
import type { Settings } from '../../shared/settings/settings';
import { whichKeyRows, whichKeyStep, type Held } from './which-key';
import { createWhichKey } from './which-key-view';

// The screen the strip lists keys for, read fresh each time it is drawn.
export type WhichKeyScreen = {
  keys: Settings['keys'];
  mode: Mode;
  onManagerPage: boolean;
  chatFocused: boolean;
};

export type WhichKeyTracking = {
  hide(): void;
  track(event: KeyboardEvent): void;
  refresh(): void;
};

export function createWhichKeyTracking(screen: () => WhichKeyScreen, isMac: boolean): WhichKeyTracking {
  const whichKey = createWhichKey();
  // The modifiers the strip last answered, null while it is down. which-key.ts decides what each
  // keystroke does to it; this is only where the answer is kept.
  let held: Held | null = null;

  const dialogOpen = (): boolean => document.querySelector(OVERLAY_SELECTOR) !== null;

  function hide(): void {
    held = null;
    whichKey.hide();
  }

  // The rows are built from the page and the mode the modifier went down on, and nothing about holding a
  // modifier rebuilds them. Every key that changes the screen also takes the strip away, so from the
  // keyboard they cannot go stale; a click on a section name or on a manager row changes both while the
  // modifier is still down. So this is called wherever the screen changes, beside renderStatus.
  function refresh(): void {
    if (!held) return;
    const { keys, mode, onManagerPage, chatFocused } = screen();
    whichKey.show(whichKeyRows(held, keys, mode, onManagerPage, isMac, chatFocused));
  }

  // Every press and release, whether the strip is up or not: adding Shift to a held Ctrl is a different
  // question, and pressing a key that starts something is the answer being taken.
  function track(event: KeyboardEvent): void {
    const step = whichKeyStep(event, dialogOpen, held);
    if (step.kind === 'unchanged') return;
    if (step.kind === 'hide') return hide();
    held = step.held;
    refresh();
  }

  return { hide, track, refresh };
}
