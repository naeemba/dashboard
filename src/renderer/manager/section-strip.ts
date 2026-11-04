import { iconButton, MODE_GLYPHS } from '../app/icons';
import { STRIP } from '../../shared/manager/manager-sections';
import type { Mode } from '../../shared/keys/modes';

export type SectionStrip = { element: HTMLElement; render(mode: Mode): void };

// The names along the top of the manager page. It sits above the views rather than inside one, because
// it has to be on screen whichever of the four is showing — a strip that vanished with its own
// section would be a strip you could only see from one place.
//
// It holds no state. Which section is current is the page's mode, which the renderer already keeps, so
// this is handed the answer on every redraw rather than keeping a second copy to go stale.
export function createSectionStrip(onPick: (mode: Mode) => void): SectionStrip {
  const element = document.createElement('nav');
  element.className = 'section-strip';
  const names = STRIP.map((section) => {
    // A click goes to that section, which is what the key does. Every control in this app answers the
    // keyboard first and the pointer to the same place.
    //
    // It takes no keyboard, like the add-pane button in chrome-bars.ts: the previous and next section
    // keys already walk the strip. A name that Tab could reach, or that a click left focused, would be
    // one more place a bare Enter has to be told apart from the section's own Enter.
    const item = iconButton('section-name', MODE_GLYPHS[section.mode], section.name, () => onPick(section.mode));
    item.tabIndex = -1;
    item.addEventListener('mousedown', (event) => event.preventDefault());
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
