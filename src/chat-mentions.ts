import { fileMention, mentionInsertion } from './chat-commands';
import { fuzzyScore } from './fuzzy';

// The list of the project's files that @ opens in the prompt box, as Claude Code's does. The SDK has a
// file_suggestions request, but only as an internal type with no method on the query to send it, so
// the screen lists the files itself (git's list, from main) and matches them here.

const SHOWN = 50;

// The @ word the caret is in: where its @ is and what follows it. An @ inside a word, as in an email
// address, is not one, and neither is a mention already quoted or finished with a space.
export function mentionAt(text: string, caret: number): { start: number; query: string } | null {
  const match = /(?:^|\s)@([^\s"]*)$/.exec(text.slice(0, caret));
  return match ? { start: caret - match[1].length - 1, query: match[1] } : null;
}

// The files the list offers for what follows the @: the tightest fuzzy match first, then the shorter
// path, so `chatview` finds src/chat-view.ts ahead of a test deep in another folder.
export function fileRows(files: string[], query: string): string[] {
  return files
    .map((file) => ({ file, score: fuzzyScore(file, query) }))
    .filter((each): each is { file: string; score: number } => each.score !== null)
    .sort((one, other) => one.score - other.score || one.file.length - other.file.length || one.file.localeCompare(other.file))
    .slice(0, SHOWN)
    .map(({ file }) => file);
}

// The box after a file is picked: the @ word the caret is in, all of it, replaced by the file's mention
// and one space, with the caret after the space so typing carries on as a new word.
export function pickMention(text: string, caret: number, file: string): { text: string; caret: number } {
  const mention = mentionAt(text, caret);
  if (!mention) return { text, caret };
  const inserted = mentionInsertion(text.slice(0, mention.start), [fileMention(file)]);
  return { text: text.slice(0, mention.start) + inserted + text.slice(caret).replace(/^\S*\s?/, ''), caret: mention.start + inserted.length };
}
