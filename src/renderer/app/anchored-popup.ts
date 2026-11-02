import { heldIndex } from '../../shared/app/clamp-index';
import { isModified } from '../keys/shortcuts';
import { answerKeys, openOverlay } from './overlay';
import { placeAbove } from './popup-placement';

// A small list opened from something on screen and drawn just above it rather than in the middle of a
// dark sheet: the Claude screen's context popup, opened from its meter. Built on openOverlay's sheet,
// made clear, so it owns the keyboard as every dialog does and a click beside it closes it.
//
// The arrows walk every row of every section; Enter takes the highlighted row's choice and a click on
// a row moves the highlight there, then does what Enter does. A row with no choice is only read, so
// Enter leaves the popup open on it. Escape closes. Undefined is the popup being closed.

export type PopupRow<Choice> = {
  // What the highlight follows when the rows are read again, so a refresh that reorders them keeps it
  // on the same row.
  key: string;
  cells: HTMLElement[];
  choice?: Choice;
};

export type PopupSection<Choice> = { title: string | null; rows: PopupRow<Choice>[] };

export function anchoredPopup<Choice>(options: {
  // The popup's own class, which its parts are named with too.
  name: string;
  anchor: HTMLElement;
  heading: () => string;
  sections: () => PopupSection<Choice>[];
  // For rows that change while it is open: called once with the way to read them again, and answers
  // with the way to stop, which closing calls.
  watch?: (changed: () => void) => () => void;
}): Promise<Choice | undefined> {
  let sections: PopupSection<Choice>[] = [];
  let highlighted = 0;
  let unwatch: (() => void) | undefined;
  const rows = (): PopupRow<Choice>[] => sections.flatMap((section) => section.rows);

  return new Promise<Choice | undefined>((resolve) => {
    function finish(choice: Choice | undefined): void {
      unwatch?.();
      remove();
      resolve(choice);
    }

    const { dialog, remove } = openOverlay(options.name, () => finish(undefined));
    dialog.parentElement?.classList.add('anchored-sheet');
    dialog.classList.add('anchored-dialog');
    // Placed once, when it opens: the anchor is part of a row that is rebuilt as it changes, but it
    // stays where it was.
    const place = placeAbove(options.anchor.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight });
    dialog.style.bottom = `${place.bottom}px`;
    dialog.style.maxHeight = `${place.maxHeight}px`;
    if (place.left !== null) dialog.style.left = `${place.left}px`;
    if (place.right !== null) dialog.style.right = `${place.right}px`;
    const heading = document.createElement('p');
    heading.className = 'anchored-heading';
    const body = document.createElement('div');
    body.className = 'anchored-body';
    dialog.append(heading, body);

    function take(): void {
      const choice = rows()[highlighted]?.choice;
      if (choice !== undefined) finish(choice);
    }

    function draw(): void {
      heading.textContent = options.heading();
      let index = 0;
      body.replaceChildren(...sections.flatMap((section) => {
        const list = document.createElement('ul');
        list.className = 'anchored-list';
        list.append(...section.rows.map((row) => {
          const at = index++;
          const item = document.createElement('li');
          item.classList.toggle('highlighted', at === highlighted);
          item.append(...row.cells);
          item.addEventListener('click', () => {
            highlighted = at;
            draw();
            take();
          });
          return item;
        }));
        if (section.title === null) return [list];
        const title = document.createElement('p');
        title.className = 'anchored-section';
        title.textContent = section.title;
        return [title, list];
      }));
      body.querySelectorAll('li')[highlighted]?.scrollIntoView({ block: 'nearest' });
    }

    function read(): void {
      const was = rows()[highlighted]?.key;
      sections = options.sections();
      highlighted = heldIndex(rows().map((row) => row.key), was, highlighted);
      draw();
    }

    function move(step: number): void {
      const count = rows().length;
      if (count === 0) return;
      highlighted = (highlighted + step + count) % count;
      draw();
    }

    answerKeys(dialog, (key) => (key === 'Enter' ? take() : finish(undefined)));
    dialog.addEventListener('keydown', (event) => {
      if (isModified(event)) return;
      switch (event.key) {
        case 'ArrowDown': event.preventDefault(); return move(1);
        case 'ArrowUp': event.preventDefault(); return move(-1);
        // Nothing in it takes focus but the box itself, so Tab would leave for the pane behind.
        case 'Tab': return event.preventDefault();
      }
    });
    read();
    unwatch = options.watch?.(read);
    dialog.focus();
  });
}
