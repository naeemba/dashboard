import type { Shortcut } from './shortcut-rows';

export type WhichKey = { show(rows: Shortcut[]): void; hide(): void };

// The strip along the bottom that says what the modifier under your finger can start. It is not one of
// openOverlay's dialogs and must never become one: a dialog owns the keyboard, and the whole point here
// is that the key you press next reaches the window's own lookup and does the thing. So no sheet, no
// focus, and no pointer — there is nothing to click, and a strip that ate clicks would eat them from
// the pane it is sitting over.
//
// It holds no state, and it keeps no clock either. What is on it is decided in which-key.ts and handed
// over on every change, so there is no second copy of the answer here to go stale while a modifier is
// held — and the wait before it appears is an animation delay in the CSS, which starts over each time
// the element comes back into `display` and does not while the list merely narrows.
export function createWhichKey(): WhichKey {
  const panel = document.createElement('div');
  panel.className = 'which-key';
  panel.hidden = true;
  document.body.append(panel);

  function hide(): void {
    panel.hidden = true;
    panel.replaceChildren();
  }

  // No rows is not an empty strip: holding Alt on the board starts nothing, and a bar with nothing in
  // it covering the bottom of the screen would be the app looking broken rather than answering. The
  // panel paints nothing while it is empty — `.which-key:empty` in the CSS — rather than leaving
  // `display`, because leaving it starts the 400ms wait over. Touch Alt with Ctrl held and the rows
  // go; let Alt go again and they are back that instant, with your finger still on Ctrl.
  function show(rows: Shortcut[]): void {
    panel.replaceChildren(...rows.map((shortcut) => {
      const row = document.createElement('div');
      row.className = 'which-key-row';
      const keys = document.createElement('span');
      keys.className = 'which-key-key';
      keys.textContent = shortcut.keys;
      const action = document.createElement('span');
      action.className = 'which-key-action';
      action.textContent = shortcut.action;
      row.append(keys, action);
      return row;
    }));
    panel.hidden = false;
  }

  return { show, hide };
}
