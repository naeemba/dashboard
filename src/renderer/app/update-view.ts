import type { DashboardBridge } from '../../shared/app/bridge';
import { clampIndex } from '../../shared/app/clamp-index';
import { UPDATE_ROW_LABELS, updateFooter, updateNotice, updateRows, updateTitle, type UpdateRow, type UpdateState } from '../../shared/app/update';
import { failureText } from '../../shared/errors/failure';
import { labelled } from './icons';
import { answerKeys, holdFocus, openOverlay, searchRowElement } from './overlay';
import { openReleaseNotes } from './whats-new-view';
import { isModified } from '../keys/shortcuts';

// The in-app update on screen (docs/updates): a line on the status bar once a newer release is out or
// downloaded, and the dialog the updates key opens. Every row is something main's update actions do;
// what the rows are is updateRows'.

let current: UpdateState = { kind: 'none' };
// The open dialog's redraw, so a change main pushes lands on it as well as on the status bar.
let redraw: (() => void) | null = null;

// From launch: the state main already holds, then every change. `key` is the updates key as the help
// dialog spells it, read on each change so a rebinding is said.
export function watchUpdates(bridge: DashboardBridge, notice: (message: string) => void, key: () => string): void {
  const take = (state: UpdateState): void => {
    current = state;
    notice(updateNotice(state, key()));
    redraw?.();
  };
  bridge.onUpdateChange(take);
  void bridge.readUpdate().then(take, () => undefined);
}

function keysLine(rows: number): string {
  return rows > 0 ? 'The arrows pick a row, Enter does it. Escape closes.' : 'Escape closes.';
}

// Checks for a newer release as it opens, whatever the settings row says. `report` is for a download or
// a swap that failed, which also stays on the dialog until the next try.
export function openUpdates(bridge: DashboardBridge, report: (message: string) => void): Promise<void> {
  let selected = 0;
  let message = 'Checking GitHub for a newer release…';
  // The check answered and nothing was newer, for the title.
  let newest = false;
  return new Promise<void>((resolve) => {
    // `after` is a sheet opened in this one's place, which the caller waits for too.
    function close(after?: Promise<void>): void {
      redraw = null;
      releaseFocus();
      remove();
      resolve(after);
    }

    const { dialog, remove } = openOverlay('updates', () => close());
    const releaseFocus = holdFocus(dialog);

    function say(text: string): void {
      message = text;
      render();
    }

    function answered(answer: { output: string } | { refused: string }): void {
      say('refused' in answer ? answer.refused : '');
    }

    function choose(row: UpdateRow): void {
      if (row === 'whats-new' && current.kind !== 'none') return close(openReleaseNotes(bridge, current.release));
      const request = row === 'update' ? bridge.downloadUpdate() : bridge.restartToUpdate();
      say('');
      request.then(answered, (error: unknown) => report(`Update failed: ${failureText(error)}`));
    }

    function render(): void {
      const rows = updateRows(current);
      selected = clampIndex(selected, rows.length - 1);
      const list = document.createElement('ul');
      list.className = 'whats-new-list';
      rows.forEach((row, index) => {
        const item = searchRowElement('refresh', UPDATE_ROW_LABELS[row], '');
        item.classList.toggle('highlighted', index === selected);
        item.addEventListener('click', () => {
          selected = index;
          choose(row);
        });
        list.append(item);
      });
      const lines = [('failure' in current && current.failure) || message, keysLine(rows.length)];
      // An unsigned build: Gatekeeper may still ask about the swapped-in app on its first launch.
      if (current.kind === 'staged' && bridge.platform === 'darwin') {
        lines.unshift('If macOS will not open the new build, the README\'s Install section says what to click.');
      }
      const footer = document.createElement('p');
      footer.className = 'help-footer';
      footer.textContent = updateFooter(lines);
      dialog.replaceChildren(labelled('h2', 'dialog-title', 'refresh', updateTitle(current, __BUILD_VERSION__, newest)), list, footer);
    }

    redraw = render;
    render();
    dialog.focus();
    bridge.checkUpdate().then((answer) => {
      newest = !('refused' in answer);
      answered(answer);
    }, (error: unknown) => say(`Could not check: ${failureText(error)}`));

    answerKeys(dialog, (key) => {
      const row = updateRows(current)[selected];
      if (key === 'Escape') close();
      else if (row) choose(row);
    });
    dialog.addEventListener('keydown', (event) => {
      if (isModified(event)) return;
      const rows = updateRows(current);
      const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
      if (step === 0) return;
      event.preventDefault();
      selected = clampIndex(selected + step, rows.length - 1);
      render();
    });
  });
}
