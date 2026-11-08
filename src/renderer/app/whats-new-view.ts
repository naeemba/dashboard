import type { DashboardBridge } from '../../shared/app/bridge';
import { clampIndex } from '../../shared/app/clamp-index';
import type { Release } from '../../shared/app/update';
import { byDate, entriesToShow, pullRequestUrl, shownRecord, whatsNewFooter, type ChangelogEntry } from '../../shared/app/whats-new';
import { labelled } from './icons';
import { answerKeys, holdFocus, openOverlay, searchRowElement } from './overlay';
import { isModified } from '../keys/shortcuts';

// How far each key moves the selection; a Page key about one screen of the dialog's rows.
const PAGE_ROWS = 10;
const STEPS: Partial<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1, PageDown: PAGE_ROWS, PageUp: -PAGE_ROWS };

// Named once: the build pastes the whole list in at every mention of it.
const CHANGELOG = __CHANGELOG__;

// One row: what it says, the detail at its right, and the page Enter opens, if any.
type NoteRow = { title: string; detail: string; url: string | null };
type NoteGroup = { heading: string; rows: NoteRow[] };

// Read-only apart from the rows: the arrows walk them, the Page keys and Home and End jump, Enter opens
// the selected one's page and leaves the list up, Escape closes. A click selects the row and then does
// what Enter does.
function openNotes(bridge: DashboardBridge, title: string, groups: NoteGroup[], footerText: string): Promise<void> {
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
    dialog.append(labelled('h2', 'dialog-title', 'pullRequest', title));
    const rows: HTMLElement[] = [];
    const notes = groups.flatMap((group) => group.rows);

    function select(index: number): void {
      rows[selected]?.classList.remove('highlighted');
      selected = clampIndex(index, rows.length - 1);
      rows[selected]?.classList.add('highlighted');
      // The first row brings the title and its day back into view with it.
      if (selected === 0) dialog.scrollTop = 0;
      else rows[selected]?.scrollIntoView({ block: 'nearest' });
    }

    function openSelected(): void {
      const url = notes[selected]?.url;
      if (url) bridge.openExternal(url);
    }

    for (const group of groups) {
      const heading = document.createElement('h2');
      heading.textContent = group.heading;
      const list = document.createElement('ul');
      list.className = 'whats-new-list';
      for (const note of group.rows) {
        const index = rows.length;
        const row = searchRowElement('pullRequest', note.title, note.detail);
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
    footer.textContent = footerText;
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

// The pull requests a build carries, under the day each merged, newest first. Enter opens the selected
// one on GitHub. Without `entries`, the whole list the build carries.
export function openWhatsNew(bridge: DashboardBridge, entries: readonly ChangelogEntry[] = CHANGELOG.entries): Promise<void> {
  const { repository, release } = CHANGELOG;
  const groups = byDate(entries).map((group) => ({
    heading: group.date,
    rows: group.entries.map((entry) => ({
      title: entry.title, detail: `#${entry.pullRequest}`, url: repository ? pullRequestUrl(repository, entry.pullRequest) : null,
    })),
  }));
  return openNotes(bridge, release ? `What's new in ${release}` : "What's new", groups, whatsNewFooter(entries.length, repository));
}

// A newer release's notes, before it is installed: its What's new lines, each opening the release page.
export function openReleaseNotes(bridge: DashboardBridge, release: Release): Promise<void> {
  const rows = release.notes.map((title) => ({ title, detail: '', url: release.url }));
  const footer = rows.length > 0 ? 'Enter opens the release on GitHub. Escape closes.' : 'The release lists nothing new. Escape closes.';
  return openNotes(bridge, `What's new in v${release.version}`, [{ heading: `v${release.version}`, rows }], footer);
}

// Once per launch: this build is recorded, and what changed since the build last shown comes up, if
// anything did. A record main cannot read or write costs the popup, never the launch.
export async function whatsNewAtLaunch(bridge: DashboardBridge, closed: () => void): Promise<void> {
  const last = await bridge.recordWhatsNew(shownRecord(CHANGELOG)).catch(() => null);
  const entries = last ? entriesToShow(CHANGELOG, last) : [];
  if (entries.length > 0) await openWhatsNew(bridge, entries).then(closed);
}
