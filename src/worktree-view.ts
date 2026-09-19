import { relativeAge } from './age';
import { baseName } from './base-name';
import { clampIndex } from './clamp-index';
import type { DashboardBridge } from './bridge';
import { confirmOverlay, openOverlay } from './overlay';
import { isModified } from './shortcuts';
import { paneLabel } from './terminals';
import { dirtyLabel, orderedWorktrees } from './worktree-rows';
import type { WorktreeEntry } from './worktree-store';

// Lands on the worktree's pane, or hands back the sentence saying why it could not. The empty string
// is the landing having happened — there is nothing to say about a key that did what it looked like.
export type JumpToWorktree = (entry: WorktreeEntry) => string;

// `closed` resolves when the dialog goes; `redraw` is how the owner tells it the records underneath
// have changed, since the list reads them live but has no way to hear main's sweep. A record can go
// while this is sitting on screen — an agent removes its own worktree — and without the redraw the
// dialog goes on offering a row whose folder is gone.
export type WorktreeDialog = {
  closed: Promise<void>;
  redraw(): void;
};

// Every worktree the app has made, and the one screen they are removed from. Nothing here removes
// anything on its own: a worktree whose branch has merged is still a folder you may have something
// in, and a squash-merged branch does not read as merged anyway.
//
// An overlay rather than a row on the manager page, because on the manager a bare `d` is a letter
// that can no longer reach a waiting pane's shell. A dialog owns the keyboard, so bare keys are free
// here.
//
// `jump` lands on a row's pane. Whether it can — the pane may be null, and the project may have been
// closed since — is the renderer's to answer, because only it knows which projects are open and where
// their pages are; the sentence it hands back is shown on this dialog's own sheet rather than on a
// status bar behind the overlay.
export function openWorktrees(
  bridge: DashboardBridge,
  // A getter onto the renderer's one copy of the records, not a snapshot taken on the way in — the
  // boards read them the same way, and it is what lets a change made elsewhere reach this list while
  // it is open.
  worktrees: () => readonly WorktreeEntry[],
  jump: JumpToWorktree,
): WorktreeDialog {
  // Assigned by the executor, which runs before the Promise constructor returns — so it is the real
  // render by the time anyone outside can call it.
  let redraw = (): void => {};
  let highlighted = 0;
  // Filled in after the rows are already on screen: git is asked once the list has painted, not
  // before, so removing a worktree never waits on it. What the cell says while these three are in
  // each of their states is dirtyLabel's to decide.
  let dirty = new Set<string>();
  let unreadable = new Set<string>();
  let dirtyChecked = false;

  const closed = new Promise<void>((resolve) => {
    function finish(): void {
      remove();
      resolve();
    }

    const { dialog, remove } = openOverlay('worktrees', finish);
    const heading = document.createElement('h2');
    heading.className = 'worktrees-heading';
    const list = document.createElement('ul');
    list.className = 'worktrees-list';
    const keys = document.createElement('p');
    keys.className = 'worktrees-keys';
    keys.textContent = 'Enter goes to its pane.  d removes it.  Escape closes.';
    dialog.append(heading, list, keys);
    dialog.focus();

    function render(): void {
      const entries = worktrees();
      heading.textContent = `Worktrees (${entries.length})`;
      highlighted = clampIndex(highlighted, entries.length - 1);
      list.replaceChildren(...orderedWorktrees(entries).map((entry, index) => {
        const item = document.createElement('li');
        if (index === highlighted) item.classList.add('highlighted');

        const project = document.createElement('span');
        project.className = 'worktrees-project';
        project.textContent = baseName(entry.projectPath);

        const branch = document.createElement('span');
        branch.className = 'worktrees-branch';
        branch.textContent = entry.branch;

        const age = document.createElement('span');
        age.className = 'worktrees-age';
        // A timestamp the clock cannot read says nothing rather than "Invalid Date" — see age.ts.
        age.textContent = relativeAge(entry.startedAt) ?? '';

        const dirtyCell = document.createElement('span');
        dirtyCell.className = 'worktrees-dirty';
        dirtyCell.textContent = dirtyLabel(entry.worktreePath, dirtyChecked, dirty, unreadable);
        dirtyCell.classList.toggle('worktrees-is-dirty', dirty.has(entry.worktreePath));
        dirtyCell.classList.toggle('worktrees-unreadable', unreadable.has(entry.worktreePath));

        const pane = document.createElement('span');
        pane.className = 'worktrees-pane';
        pane.textContent = entry.pane === null ? 'no pane' : paneLabel(entry.pane);

        item.append(project, branch, age, dirtyCell, pane);
        // A click moves the selection to the row and then does what Enter does there, so the pointer
        // and the keyboard never name two different rows.
        item.addEventListener('click', () => {
          highlighted = index;
          render();
          void goToHighlighted();
        });
        return item;
      }));
      if (entries.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'worktrees-empty';
        empty.textContent = 'Nothing in flight. Move a card into Ship to start one.';
        list.replaceChildren(empty);
      }
      list.children[highlighted]?.scrollIntoView({ block: 'nearest' });
    }

    // Kicked off after the rows are on screen rather than awaited by refresh(), so a slow git never
    // holds up the list itself — see the comment above dirtyChecked.
    async function refreshDirtiness(): Promise<void> {
      const result = await bridge.dirtyWorktrees();
      dirty = new Set(result.dirty);
      unreadable = new Set(result.unreadable);
      dirtyChecked = true;
      render();
    }

    // The sweep asked for now rather than on the next tick, which is the one thing this screen wants
    // on the way in. What it finds is not kept here: a record it drops comes back through the
    // renderer's copy and the redraw above, the same way every other change reaches this list.
    async function refresh(): Promise<void> {
      await bridge.listWorktrees();
      render();
      void refreshDirtiness();
    }

    // A notice with nothing to answer, built on the same sheet as the two confirmations below it so
    // a refusal never has to be read off the status bar behind the overlay — that is the answer to a
    // question this dialog asked, not the page under it.
    async function notify(message: string): Promise<void> {
      await confirmOverlay(message, 'Enter or Escape closes.');
      dialog.focus();
    }

    // Enter, and a click, on a row. The dialog closes only when the landing actually happened: a row
    // whose worktree has no pane, and one whose project has been closed since it shipped, both have
    // somewhere the reader has to be told about rather than a keystroke that appears to do nothing.
    async function goToHighlighted(): Promise<void> {
      const entry = orderedWorktrees(worktrees())[highlighted];
      if (!entry) return;
      const refusal = jump(entry);
      if (refusal === '') return finish();
      await notify(refusal);
    }

    // What the second question says: the files when main refused on uncommitted changes, main's own
    // words for every other refusal. main decides what counts as dirty and hands the list back, so
    // the question on screen cannot name one thing while the removal refuses on another.
    function forcedQuestion(entry: WorktreeEntry, attempt: { message: string; dirty: string[] }): string {
      if (attempt.dirty.length === 0) return `${entry.branch} was not removed: ${attempt.message}`;
      const files = attempt.dirty.slice(0, 3).join(', ');
      const more = attempt.dirty.length > 3 ? ` and ${attempt.dirty.length - 3} more` : '';
      return `${entry.branch} has uncommitted changes: ${files}${more}.`;
    }

    // Asked twice, and the forced removal is offered whatever the first one failed on — not only on
    // uncommitted changes. git counts files this app's dirty check exempts, everything gitignored
    // among them, so a worktree this list calls clean is refused with `use --force to delete it`;
    // without the offer here that worktree could never be removed from inside the app at all, and
    // neither could one whose removal failed for any other reason.
    async function removeHighlighted(): Promise<void> {
      const entry = orderedWorktrees(worktrees())[highlighted];
      if (!entry) return;
      const first = await confirmOverlay(`Remove the worktree for "${entry.title}"?`,
        'Enter removes it. Escape keeps it. The folder and everything in it goes; the branch stays.');
      dialog.focus();
      if (!first) return;
      // The row is read before the question and acted on after it, and five seconds is long enough for
      // an agent to remove its own worktree while the sheet is up. Nothing is re-checked here: a path
      // with no record is a removal that has already happened, and main answers it that way.
      const attempt = await bridge.removeWorktree(entry.worktreePath, false);
      if (!attempt.ok) {
        const forced = await confirmOverlay(forcedQuestion(entry, attempt),
          'Enter removes it anyway and loses what is in it. Escape keeps it.');
        dialog.focus();
        if (forced) {
          const attemptForced = await bridge.removeWorktree(entry.worktreePath, true);
          if (!attemptForced.ok) await notify(attemptForced.message);
        }
      }
      await refresh();
    }

    dialog.addEventListener('keydown', (event) => {
      // A modified key belongs to whatever the window bound it to, not to this list.
      if (isModified(event)) return;
      switch (event.key) {
        case 'Escape': return finish();
        case 'Enter':
          event.preventDefault();
          void goToHighlighted();
          return;
        case 'ArrowDown':
          event.preventDefault();
          highlighted += 1;
          return render();
        case 'ArrowUp':
          event.preventDefault();
          highlighted -= 1;
          return render();
        case 'd':
          event.preventDefault();
          void removeHighlighted();
          return;
      }
    });

    redraw = render;
    render();
    void refresh();
  });
  return { closed, redraw };
}
