// The prompt box's Up and Down through what was sent before, the way the Claude Code terminal walks
// its history. `at` is the prompt being shown, counted from the oldest, or null for the draft that was
// in the box before Up was first pressed. Null comes back when the key has nowhere to go and should be
// left to move the caret.
export function recall(sent: number, at: number | null, direction: -1 | 1): { at: number | null } | null {
  if (direction === -1) {
    if (sent === 0 || at === 0) return null;
    return { at: at === null ? sent - 1 : at - 1 };
  }
  if (at === null) return null;
  return { at: at + 1 < sent ? at + 1 : null };
}

// Up is history only from the box's first line and Down only from its last, so a prompt of several
// lines can still be walked with the arrows.
export function onEdgeLine(text: string, caret: number, direction: -1 | 1): boolean {
  return direction === -1 ? !text.slice(0, caret).includes('\n') : !text.slice(caret).includes('\n');
}
