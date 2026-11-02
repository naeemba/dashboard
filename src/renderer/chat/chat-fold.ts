// A long message you sent — a pasted log — is drawn folded in the thread: its first lines, then a row
// saying how many more there are. Claude was sent all of it; this only decides what the thread shows.

const FOLD_OVER = 12;
const FOLD_SHOWN_LINES = 6;

type FoldedMessage = { head: string; rest: string; hidden: number };

// Null for a message short enough to show whole.
export function foldedMessage(text: string): FoldedMessage | null {
  const lines = text.split('\n');
  if (lines.length <= FOLD_OVER) return null;
  return { head: lines.slice(0, FOLD_SHOWN_LINES).join('\n'), rest: lines.slice(FOLD_SHOWN_LINES).join('\n'), hidden: lines.length - FOLD_SHOWN_LINES };
}
