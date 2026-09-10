import { clampIndex } from './clamp-index';
import type { DashboardBridge } from './bridge';
import { confirmOverlay, openOverlay } from './overlay';
import { isModified } from './shortcuts';
import { paneLabel } from './terminals';
import type { WorktreeEntry } from './worktree-store';

// Every worktree the app has made, and the one screen they are removed from. Nothing here removes
// anything on its own: a worktree whose branch has merged is still a folder you may have something
// in, and a squash-merged branch does not read as merged anyway.
//
// An overlay rather than a row on the manager page, because on the manager a bare `d` is a letter
// that can no longer reach a waiting pane's shell. A dialog owns the keyboard, so bare keys are free
// here.
export function openWorktrees(bridge: DashboardBridge): Promise<string | undefined> {
  let entries: WorktreeEntry[] = [];
  let highlighted = 0;

  return new Promise<string | undefined>((resolve) => {
    function finish(choice: string | undefined): void {
      remove();
      resolve(choice);
    }

    const { dialog, remove } = openOverlay('worktrees', () => finish(undefined));
    const heading = document.createElement('h2');
    heading.className = 'worktrees-heading';
    const list = document.createElement('ul');
    list.className = 'worktrees-list';
    const keys = document.createElement('p');
    keys.className = 'worktrees-keys';
    keys.textContent = 'Enter goes to its pane.  d removes it.  Escape closes.';
    dialog.append(heading, list, keys);
    dialog.focus();

    // Newest first, ordered here rather than inherited from the store. `withEntry` moves a replaced
    // entry to the end of its array, so leaving the order alone would mean the list re-sorts itself
    // whenever a record is touched, for reasons nothing on screen explains.
    function ordered(): WorktreeEntry[] {
      return [...entries].sort((first, second) => second.startedAt.localeCompare(first.startedAt));
    }

    function render(): void {
      heading.textContent = `Worktrees (${entries.length})`;
      highlighted = clampIndex(highlighted, entries.length - 1);
      list.replaceChildren(...ordered().map((entry, index) => {
        const item = document.createElement('li');
        if (index === highlighted) item.classList.add('highlighted');
        const branch = document.createElement('span');
        branch.className = 'worktrees-branch';
        branch.textContent = entry.branch;
        const detail = document.createElement('span');
        detail.className = 'worktrees-detail';
        const pane = entry.pane === null ? 'no pane' : paneLabel(entry.pane);
        detail.textContent = `${entry.title} · ${pane}`;
        item.append(branch, detail);
        // A click moves the selection to the row and then does what Enter does there, so the pointer
        // and the keyboard never name two different rows.
        item.addEventListener('click', () => {
          highlighted = index;
          render();
          finish(entry.worktreePath);
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

    async function refresh(): Promise<void> {
      entries = await bridge.listWorktrees();
      render();
    }

    // Asked twice for a dirty worktree, and the second question names the files: the changes in it
    // exist nowhere else. main decides what counts as dirty and hands the list back, so the question
    // on screen cannot name one thing while the removal refuses on another.
    async function removeHighlighted(): Promise<void> {
      const entry = ordered()[highlighted];
      if (!entry) return;
      const first = await confirmOverlay(`Remove the worktree for "${entry.title}"?`,
        'Enter removes it. Escape keeps it. The branch stays either way.');
      dialog.focus();
      if (!first) return;
      const attempt = await bridge.removeWorktree(entry.worktreePath, false);
      if (!attempt.ok && attempt.dirty.length > 0) {
        const files = attempt.dirty.slice(0, 3).join(', ');
        const more = attempt.dirty.length > 3 ? ` and ${attempt.dirty.length - 3} more` : '';
        const forced = await confirmOverlay(`${entry.branch} has uncommitted changes: ${files}${more}.`,
          'Enter removes it and loses them. Escape keeps it.');
        dialog.focus();
        if (forced) await bridge.removeWorktree(entry.worktreePath, true);
      }
      await refresh();
    }

    dialog.addEventListener('keydown', (event) => {
      // A modified key belongs to whatever the window bound it to, not to this list.
      if (isModified(event)) return;
      switch (event.key) {
        case 'Escape': return finish(undefined);
        case 'Enter': return finish(ordered()[highlighted]?.worktreePath);
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

    render();
    void refresh();
  });
}
