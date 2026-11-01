// Carrying a half-typed box across a redraw. Two screens redraw underneath an open box now — the board,
// when a write lands while you are renaming a card, and the card dialog, when one lands while you are
// naming a subtask — and both throw the input away and build a new one. The text, the caret and the
// blur handler are the same three things every time, so they live here rather than in a copy each.

export type CarriedEdit = { value: string; start: number; end: number };

type EditBox = HTMLInputElement | HTMLTextAreaElement;

// What is in the box right now, so the redraw can put it back. The blur handler comes off first: the
// redraw removes this input, and a browser that fires blur for a removal would commit or cancel what
// you were typing onto the screen that is on its way out.
export function takeEdit(input: EditBox | null): CarriedEdit | null {
  if (!input) return null;
  input.onblur = null;
  return { value: input.value, start: input.selectionStart ?? 0, end: input.selectionEnd ?? 0 };
}

// False when the redraw left no box to put it back in, which is the caller's cue that the edit is
// over. The caret goes back too, or a reload would jump you to the end of what you were typing — and
// after the value, or it would be clamped to the length of an empty box.
export function putEditBack(input: EditBox | null, carried: CarriedEdit): boolean {
  if (!input) return false;
  input.value = carried.value;
  input.focus();
  input.setSelectionRange(carried.start, carried.end);
  return true;
}
