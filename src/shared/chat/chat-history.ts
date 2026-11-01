import type { ChatEntry } from './chat-transcript';
import type { SearchRow } from '../app/fuzzy';

// How many of the project's most recent conversations the prompt history search reads. Each is a
// whole transcript off disk, so the oldest are left to /resume.
export const HISTORY_CONVERSATIONS = 20;

// What a row shows of a prompt at most: a pasted log of fourteen thousand characters is one line,
// cut by the sheet to its width, not laid out whole on every keystroke.
const ROW_NAME_LIMIT = 200;

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

// The prompts sent in this conversation, oldest first, what Up walks back through. A command run with
// `!` is left out: sent from here it would reach Claude as a prompt, not run.
export function sentPrompts(entries: ChatEntry[]): string[] {
  return entries.flatMap((entry) => (typedPrompt(entry) ? [entry.text] : []));
}

// An entry that is a prompt you typed: what Up walks and /rewind lists.
export function typedPrompt(entry: ChatEntry | undefined): entry is Extract<ChatEntry, { kind: 'user' }> {
  return entry?.kind === 'user' && !entry.ran && entry.text.trim() !== '';
}

// The project's prompts across its conversations, newest first and each once: what Ctrl+R searches,
// as Claude Code's own reverse search does. `conversations` is newest first, each one's prompts
// oldest first, as sentPrompts gives them.
export function promptHistory(conversations: string[][]): string[] {
  return [...new Set(conversations.flatMap((sent) => [...sent].reverse()))];
}

// A conversation's prompts as last read off disk, kept by the main process between searches.
export type PromptsRead = { lastModified: number; prompts: string[] };

// The conversations the search must read off disk again: those not read before and those changed
// since. The rest come from what was kept.
export function staleConversations(
  found: { sessionId: string; lastModified: number }[], kept: ReadonlyMap<string, PromptsRead>,
): string[] {
  return found.filter(({ sessionId, lastModified }) => kept.get(sessionId)?.lastModified !== lastModified).map(({ sessionId }) => sessionId);
}

// What the search lists for what is typed: every prompt newest first, or the ones holding the typed
// text, still newest first. Plain containment rather than fuzzy: a long prompt holds the letters of
// almost any query in order.
export function historyRows(prompts: string[], query: string): SearchRow<string>[] {
  const typed = query.trim().toLowerCase();
  return prompts
    .filter((text) => text.toLowerCase().includes(typed))
    .map((text) => ({ name: text.slice(0, ROW_NAME_LIMIT * 2).replace(/\s+/g, ' ').trim().slice(0, ROW_NAME_LIMIT), detail: '', choice: text }));
}

// How many drafts the stash key keeps; the oldest goes when another is stashed past it.
export const STASH_KEPT = 10;

// The stash key's drafts, oldest first, after the box's text is stashed. Up walks them after the
// draft in the box and before the prompts sent, newest first. A draft stashed again moves to the end
// rather than showing twice, and an empty box stashes nothing. Trimmed, as a sent prompt is, so
// sending it takes it out of the stash.
export function stashDraft(stashed: string[], text: string): string[] {
  const draft = text.trim();
  if (draft === '') return stashed;
  return [...stashed.filter((each) => each !== draft), draft].slice(-STASH_KEPT);
}

// What the stash key keeps: the box, or, while Up shows an earlier entry, the draft held aside. The
// earlier entry is one Up can already reach; the draft is what would be lost.
export function stashedText(box: string, held: string, recalled: number | null): string {
  return recalled === null ? box : held;
}
