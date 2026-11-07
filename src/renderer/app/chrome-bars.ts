import { MODE_NAMES } from '../keys/help';
import { iconButton, MODE_GLYPHS } from './icons';
import { PROJECT_MODES, type ProjectMode } from '../../shared/keys/modes';

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

// Whether the new-pane button is in the title row. It acts on the project in front, so it is there only
// while that project's workers are: on its terminals view, and never on the manager or a project whose
// folder has gone, which have no worker list.
export function showsAddPane(mode: string, hasWorkers: boolean): boolean {
  return mode === 'terminals' && hasWorkers;
}

// The two new-pane keys' twin, at the right end of the title row: in the worker list it would cost the
// list a row of its own. New Terminal opens a shell, New Claude a Claude screen. Neither half takes the
// keyboard, so a click leaves it where it was until the new pane takes it.
export function createAddPaneButton(onClick: (claude: boolean) => void): { element: HTMLElement; render(shown: boolean): void } {
  const element = document.createElement('div');
  element.className = 'add-pane';
  for (const [label, claude] of [['New Terminal', false], ['New Claude', true]] as const) {
    const half = document.createElement('button');
    half.type = 'button';
    half.textContent = label;
    half.addEventListener('mousedown', (event) => event.preventDefault());
    half.addEventListener('click', () => onClick(claude));
    element.append(half);
  }
  return {
    element,
    render(shown) {
      element.hidden = !shown;
    },
  };
}
