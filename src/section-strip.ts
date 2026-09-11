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
