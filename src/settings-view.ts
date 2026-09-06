import { actionByName } from './actions';
import { formatBinding, keystrokeOf } from './binding';
import { confirmOverlay, openOverlay } from './overlay';
import {
  bindKey, defaultSettings, holderOfBinding, resetKeys, type Settings,
} from './settings';
import { settingsRows, stepSelection, type SettingsRow } from './settings-rows';
import { isModified } from './shortcuts';

// Modifier keys pressed on their own are not a binding — you are still on your way to one. Without
// this, arming a row and reaching for Ctrl+Shift+K binds Ctrl the moment your finger lands.
const MODIFIER_CODES = /^(Control|Shift|Alt|Meta)(Left|Right)$/;

export function openSettings(
  initial: Settings,
  isMac: boolean,
  onChange: (next: Settings) => void,
): Promise<void> {
  return new Promise<void>((resolve) => {
    let settings = initial;
    let rows = settingsRows(settings);
    let selected = stepSelection(rows, 0, 0);
    // The row waiting for a keystroke, or null. While a row is armed this screen reads modified keys,
    // which every other dialog refuses to do — reading them is the whole job. CLAUDE.md names it.
    let armed: string | null = null;
    let message = '';
    const editor: HTMLInputElement | null = null;

    function close(): void {
      remove();
      resolve();
    }

    const { dialog, remove } = openOverlay('settings', close);

    function commit(next: Settings): void {
      settings = next;
      onChange(settings);
      rows = settingsRows(settings);
      render();
    }

    function say(text: string): void {
      message = text;
      render();
    }

    // The key you pressed, written the way the file writes it. Null for a key with no written form —
    // a media key, a keyboard's own extra button — which is refused rather than stored as something
    // nobody could read back or type again.
    async function capture(event: KeyboardEvent): Promise<void> {
      if (MODIFIER_CODES.test(event.code)) return;
      const name = armed!;
      armed = null;
      const binding = formatBinding(keystrokeOf(event));
      if (binding === null) return say('That key has no written form, so it cannot be bound.');
      const taken = holderOfBinding(settings, name, binding);
      if (taken !== null) {
        const takenLabel = actionByName(taken)?.description ?? taken;
        const yes = await confirmOverlay(
          `${binding} is already "${takenLabel}".`,
          'Enter takes the key and leaves that one unbound. Escape cancels.',
        );
        // The confirmation had the keyboard; the settings screen needs it back either way.
        dialog.focus();
        if (!yes) return say('');
      }
      commit(bindKey(settings, name, binding));
      say('');
    }

    function render(): void {
      const list = document.createElement('ul');
      list.className = 'settings-list';
      rows.forEach((row, index) => {
        const item = document.createElement('li');
        item.className = row.kind === 'heading' ? 'settings-heading' : 'settings-row';
        if (index === selected) item.classList.add('selected');
        if (row.kind === 'heading') {
          item.textContent = row.label;
        } else {
          const label = document.createElement('span');
          label.className = 'settings-label';
          label.textContent = row.label;
          const value = document.createElement('span');
          value.className = 'settings-value';
          if (row.kind === 'color') {
            const swatch = document.createElement('span');
            swatch.className = 'settings-swatch';
            swatch.style.background = row.value;
            value.append(swatch, document.createTextNode(row.value));
          } else if (row.kind === 'key') {
            value.textContent = index === selected && armed !== null
              ? 'press a key…'
              : row.binding ?? 'unbound';
            if (row.binding === null) value.classList.add('unbound');
          } else if (row.kind === 'reset-keys' || row.kind === 'reset-all') {
            value.textContent = 'Enter';
          } else {
            value.textContent = row.value === '' ? 'from the environment' : row.value;
          }
          item.append(label, value);
        }
        list.append(item);
      });
      const footer = document.createElement('p');
      footer.className = 'settings-footer';
      footer.textContent = message !== '' ? message
        : 'Enter changes the row. x unbinds a key. Escape closes. '
          + 'Kept in ~/.config/dashboard/settings.json.';
      if (message !== '') footer.classList.add('settings-message');
      dialog.replaceChildren(list, footer);
      list.children[selected]?.scrollIntoView({ block: 'nearest' });
      if (editor !== null) editor.focus();
    }

    // A stub: the text rows are not editable yet.
    function startEditing(row: SettingsRow): void {
      void row;
    }

    function activate(row: SettingsRow): void {
      if (row.kind === 'key') {
        armed = row.name;
        return say('');
      }
      if (row.kind === 'reset-keys') return commit(resetKeys(settings, isMac));
      if (row.kind === 'reset-all') return commit(defaultSettings(isMac));
      if (row.kind === 'heading') return;
      return startEditing(row);
    }

    dialog.addEventListener('keydown', (event) => {
      // The one deliberate exception to "check isModified first". A row waiting for a key has to read
      // Ctrl, Cmd, Alt and Shift, or those are the only keys you could never bind.
      if (armed !== null) {
        event.preventDefault();
        event.stopPropagation();
        void capture(event);
        return;
      }
      // The text box owns every key while a colour or the shell is being typed; its own handler ends it.
      if (editor !== null) return;
      if (isModified(event)) return;
      const row = rows[selected];
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          selected = stepSelection(rows, selected, 1);
          return render();
        case 'ArrowUp':
          event.preventDefault();
          selected = stepSelection(rows, selected, -1);
          return render();
        case 'Escape':
          event.preventDefault();
          return close();
        case 'Enter':
          event.preventDefault();
          return activate(row);
        case 'x':
          if (row.kind !== 'key') return;
          event.preventDefault();
          return commit(bindKey(settings, row.name, null));
        default:
          return;
      }
    });

    render();
    // openOverlay already made the dialog focusable; this is what takes the keyboard off the page
    // behind it, so the window listener never sees a keystroke meant for this screen.
    dialog.focus();
  });
}
