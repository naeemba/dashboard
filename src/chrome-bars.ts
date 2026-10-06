import { MODE_NAMES } from './help';
import { iconButton, MODE_GLYPHS } from './icons';
import { PROJECT_MODES, type ProjectMode } from './modes';

// The two bars around the pages: the open projects as tabs along the title row, and a project's views
// as a switch along the foot. Like the manager's section strip they hold no state — which tab is open
// and which view is showing are the renderer's, handed over on every redraw — and a click does what
// the key does, so the pointer and the keyboard always land in the same place.

export type Tab = { name: string; active: boolean; waiting: boolean; manager: boolean };

// What the buttons are built from. Every click handler is bound to an index, so this has to change
// whenever a tab's name moves to another index — or a click on the tab that says `web` lands on `api`.
// The marks are left out: they change on every redraw and move without a rebuild.
export function tabShape(tabs: Tab[]): string {
  return JSON.stringify(tabs.map((tab) => [tab.name, tab.manager]));
}

export function createTabStrip(onPick: (index: number) => void): { element: HTMLElement; render(tabs: Tab[]): void } {
  const element = document.createElement('nav');
  element.className = 'projects';
  // renderStatus redraws on every keystroke, so the buttons are built again only when the tabs
  // themselves change, and every other redraw only moves the marks.
  let built = '';
  let buttons: HTMLButtonElement[] = [];
  return {
    element,
    render(tabs) {
      const shape = tabShape(tabs);
      if (shape !== built) {
        built = shape;
        buttons = tabs.map((tab, index) =>
          iconButton('project', tab.manager ? MODE_GLYPHS.manager : 'folder', tab.name, () => onPick(index)));
        element.replaceChildren(...buttons);
      }
      tabs.forEach((tab, index) => {
        buttons[index].classList.toggle('active', tab.active);
        // A pane on this project rang its bell and nobody has been to look.
        buttons[index].classList.toggle('waiting', tab.waiting);
      });
    },
  };
}

// Shown on a project's page only: the manager's own screens are named by its section strip.
export function createModeSwitch(onPick: (mode: ProjectMode) => void): {
  element: HTMLElement; render(mode: string, shown: boolean): void;
} {
  const element = document.createElement('nav');
  element.className = 'mode-switch';
  const buttons = PROJECT_MODES.map((mode) =>
    iconButton('mode-option', MODE_GLYPHS[mode], MODE_NAMES[mode], () => onPick(mode)));
  element.append(...buttons);
  return {
    element,
    render(mode, shown) {
      element.hidden = !shown;
      buttons.forEach((button, index) => button.classList.toggle('current', PROJECT_MODES[index] === mode));
    },
  };
}
