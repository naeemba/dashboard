import type { DashboardBridge } from '../../shared/app/bridge';
import { clampIndex } from '../../shared/app/clamp-index';
import { byDate, entriesToShow, pullRequestUrl, shownRecord, whatsNewFooter, type ChangelogEntry } from '../../shared/app/whats-new';
import { labelled } from './icons';
import { answerKeys, holdFocus, openOverlay, searchRowElement } from './overlay';
import { isModified } from '../keys/shortcuts';

// How far each key moves the selection; a Page key about one screen of the dialog's rows.
const PAGE_ROWS = 10;
const STEPS: Partial<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1, PageDown: PAGE_ROWS, PageUp: -PAGE_ROWS };

// Named once: the build pastes the whole list in at every mention of it.
const CHANGELOG = __CHANGELOG__;

// The pull requests a build carries, under the day each merged, newest first. Read-only apart from the
// rows: the arrows walk them, the Page keys and Home and End jump, Enter opens the selected one on
// GitHub and leaves the list up, Escape closes. A click selects the row and then does what Enter does.
// Without `entries`, the whole list the build carries.
export function openWhatsNew(bridge: DashboardBridge, entries: readonly ChangelogEntry[] = CHANGELOG.entries): Promise<void> {
  const { repository, release } = CHANGELOG;
  let selected = 0;
  return new Promise<void>((resolve) => {
    function close(): void {
      releaseFocus();
      remove();
      resolve();
    }

    const { dialog, remove } = openOverlay('whats-new', close);
    // A --remote join can land while this is up and focus the pane behind it.
    const releaseFocus = holdFocus(dialog);
    dialog.append(labelled('h2', 'dialog-title', 'pullRequest', release ? `What's new in ${release}` : "What's new"));
    const rows: HTMLElement[] = [];

    function select(index: number): void {
      rows[selected]?.classList.remove('highlighted');
      selected = clampIndex(index, rows.length - 1);
      rows[selected]?.classList.add('highlighted');
      // The first row brings the title and its day back into view with it.
      if (selected === 0) dialog.scrollTop = 0;
      else rows[selected]?.scrollIntoView({ block: 'nearest' });
    }

    function openSelected(): void {
      const entry = entries[selected];
      if (entry && repository) bridge.openExternal(pullRequestUrl(repository, entry.pullRequest));
    }

    for (const group of byDate(entries)) {
      const heading = document.createElement('h2');
      heading.textContent = group.date;
      const list = document.createElement('ul');
      list.className = 'whats-new-list';
      for (const entry of group.entries) {
        const index = rows.length;
        const row = searchRowElement('pullRequest', entry.title, `#${entry.pullRequest}`);
        row.addEventListener('click', () => {
          select(index);
          openSelected();
        });
        rows.push(row);
        list.append(row);
      }
      dialog.append(heading, list);
    }

    const footer = document.createElement('p');
    footer.className = 'help-footer';
    footer.textContent = whatsNewFooter(entries.length, repository);
    dialog.append(footer);
    select(0);
    dialog.focus();

    answerKeys(dialog, (key) => (key === 'Enter' ? openSelected() : close()));
    dialog.addEventListener('keydown', (event) => {
      if (isModified(event)) return;
      const step = STEPS[event.key];
      if (step !== undefined) {
        event.preventDefault();
        return select(selected + step);
      }
      switch (event.key) {
        case 'Home': event.preventDefault(); return select(0);
        case 'End': event.preventDefault(); return select(rows.length - 1);
      }
    });
  });
}

// Once per launch: this build is recorded, and what changed since the build last shown comes up, if
// anything did. A record main cannot read or write costs the popup, never the launch.
export async function whatsNewAtLaunch(bridge: DashboardBridge, closed: () => void): Promise<void> {
  const last = await bridge.recordWhatsNew(shownRecord(CHANGELOG)).catch(() => null);
  const entries = last ? entriesToShow(CHANGELOG, last) : [];
  if (entries.length > 0) await openWhatsNew(bridge, entries).then(closed);
}
