// The picker and the help dialog are the same thing on screen: a dark sheet over the pages with one box
// centred in it. Only what goes in the box, and what the box answers with, differ — so the sheet is here
// and they keep their own contents. The class names match the CSS, where the two already share a rule.
export function openOverlay(name: string, dismiss: () => void): { dialog: HTMLDivElement; remove: () => void } {
  const overlay = document.createElement('div');
  overlay.className = name;
  const dialog = document.createElement('div');
  dialog.className = `${name}-dialog`;
  overlay.append(dialog);
  document.body.append(overlay);

  // Only the dark margin around the dialog dismisses it. Without the check a click meant to select a name
  // or a key closes the dialog under the pointer.
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) dismiss();
  });

  return { dialog, remove: () => overlay.remove() };
}

// The third thing built on the sheet, after the picker and the help dialog. Enter confirms, Escape
// cancels, and clicking the dark margin cancels — a dialog that appears under your hand must not
// treat a stray click as yes.
export function confirmOverlay(message: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    function close(answer: boolean): void {
      remove();
      resolve(answer);
    }

    const { dialog, remove } = openOverlay('confirm', () => close(false));
    dialog.tabIndex = -1;

    const question = document.createElement('p');
    question.className = 'confirm-question';
    question.textContent = message;
    const keys = document.createElement('p');
    keys.className = 'confirm-keys';
    keys.textContent = 'Enter deletes. Escape keeps it.';
    dialog.append(question, keys);
    dialog.focus();

    dialog.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== 'Escape') return;
      event.preventDefault();
      close(event.key === 'Enter');
    });
  });
}
