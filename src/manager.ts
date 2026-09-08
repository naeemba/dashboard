import type { Project } from './projects';

// Slots are handed out by main, one per project, counting from zero. The manager owns no ptys, so it
// takes a number no project can be given rather than a real one.
export const MANAGER_SLOT = -1;

// It sits in the tab strip where a project sits, and has none of what a project has: no folder, no
// five shells, no editor, no board. Which page is the manager is answered by its mode, not by this;
// the empty path is the second lock on the same door, because session.ts throws away a stored page
// whose path is empty, so the manager cannot reach a saved layout even if something else lets it.
export const MANAGER_PROJECT: Project = { name: 'manager', path: '', missing: false };

// Empty on purpose. The cards that fill this page — what is waiting for you, what has died, what each
// pane last printed — each bring their own list; this is the page those lists land on.
export function createManagerView(): HTMLElement {
  const view = document.createElement('div');
  view.className = 'view view-manager';
  // Focusable, so arriving here takes the keyboard off whatever pane had it. Without it you would be
  // looking at this page while your typing still went into the shell you came from.
  view.tabIndex = -1;
  const heading = document.createElement('h1');
  heading.textContent = 'Manager';
  const blurb = document.createElement('p');
  blurb.textContent = 'Nothing on this page yet. What is waiting for you, what has died and what each '
    + 'pane last printed will be listed here, across every open project.';
  view.append(heading, blurb);
  return view;
}
