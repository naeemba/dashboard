import { nextInEntry, type Walked } from '../../shared/chat/chat-commands';

// The copy key and the link key each press one of the selected entry's targets, a copy button or a
// link, walking on to the next with each press. They press it as a click would, so the screen's own
// click handling decides what happens: the copy button ticks, a pane link lands on its pane, a web link
// opens in the browser. Says `none` and keeps the walk where it was when the entry has nothing to press.
export function pressNext(targets: HTMLElement[], entry: number, previous: Walked | null, none: () => void): Walked | null {
  const place = nextInEntry(previous, entry, targets.length);
  if (place === null) {
    none();
    return previous;
  }
  targets[place].click();
  return { entry, place };
}
