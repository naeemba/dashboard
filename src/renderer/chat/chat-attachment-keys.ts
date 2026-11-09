// What a key does with the images attached to the prompt once the selection is on their thumbnails:
// the arrows walk them, Delete or Backspace takes the selected one off. Delete leaves the selection on
// the one that slides into its place, Backspace on the one before, as the caret does in text; the
// last one gone, the selection goes back to the prompt (`select: null`). Any other key is not theirs.
export type AttachmentKey = { remove: number | null; select: number | null };

export function attachmentKey(key: string, selected: number, count: number): AttachmentKey | null {
  if (key === 'ArrowLeft' || key === 'ArrowUp') return { remove: null, select: Math.max(0, selected - 1) };
  if (key === 'ArrowRight' || key === 'ArrowDown') return { remove: null, select: Math.min(count - 1, selected + 1) };
  if (key !== 'Delete' && key !== 'Backspace') return null;
  const left = count - 1;
  if (left === 0) return { remove: selected, select: null };
  const next = key === 'Backspace' ? selected - 1 : selected;
  return { remove: selected, select: Math.min(left - 1, Math.max(0, next)) };
}
