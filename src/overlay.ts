import { isModified } from './shortcuts';

// Every dialog in this app is the same thing on screen: a dark sheet over the pages with one box
// centred in it. Only what goes in the box, and what the box answers with, differ — so the sheet is here
// and each dialog keeps its own contents. The class names match the CSS, where all of them share a rule.
export function openOverlay(name: string, dismiss: () => void): { dialog: HTMLDivElement; remove: () => void } {
  const overlay = document.createElement('div');
  overlay.className = name;
  const dialog = document.createElement('div');
  dialog.className = `${name}-dialog`;
  // Not reachable by Tab, but focusable, so the dialog can take the keyboard while it is up. Every
  // dialog built on this sheet needs it, and one that forgets it is silently unusable by keyboard.
  dialog.tabIndex = -1;
  overlay.append(dialog);
  document.body.append(overlay);

  // Only the dark margin around the dialog dismisses it. Without the check a click meant to select a name
  // or a key closes the dialog under the pointer.
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) dismiss();
  });

  return { dialog, remove: () => overlay.remove() };
}

// Built on the same sheet as the picker and the help dialog. Enter confirms, Escape cancels, and
// clicking the dark margin cancels — a dialog that appears under your hand must not treat a stray
// click as yes. The keys line is the caller's to write: this file knows nothing about what is being
// confirmed, and a default here would put the board's delete wording over someone else's question.
export function confirmOverlay(message: string, keysLine: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    function close(answer: boolean): void {
      remove();
      resolve(answer);
    }

    const { dialog, remove } = openOverlay('confirm', () => close(false));

    const question = document.createElement('p');
    question.className = 'confirm-question';
    question.textContent = message;
    const keys = document.createElement('p');
    keys.className = 'confirm-keys';
    keys.textContent = keysLine;
    dialog.append(question, keys);
    dialog.focus();

    dialog.addEventListener('keydown', (event) => {
      // Cmd+Enter is not an answer to a question about deleting a card and its whole family.
      if (isModified(event)) return;
      if (event.key !== 'Enter' && event.key !== 'Escape') return;
      event.preventDefault();
      close(event.key === 'Enter');
    });
  });
}
