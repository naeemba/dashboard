import { MANAGER_SLOT } from '../manager/manager';
import { paneFromId } from '../panes/terminals';

// The key a worker pane's Claude screen runs under, in the same numbers the pages' Claude screens use
// for their slots, so the screen's every channel and event names it the way main's does. Slots start
// at MANAGER_SLOT and stay far below the base; the pane is spelled out in the key, so both sides
// work it out from the pane id without asking each other.
// ponytail: a thousand panes a slot, past which two panes would share a key.
const SCREEN_KEY_BASE = 1_000_000;
const PANES_PER_SLOT = 1000;

export function screenKey(id: string): number {
  const { slot, index } = paneFromId(id);
  return SCREEN_KEY_BASE + (slot - MANAGER_SLOT) * PANES_PER_SLOT + index;
}
