import { toolDiff, type DiffLine } from './chat-tools';
import type { ChatEntry } from './chat-transcript';

// What /diff shows: every file Claude changed in the conversation, in the order it first touched
// them, with each change it made there one after another. Built from the session's own Edit, Write and
// MultiEdit calls rather than git, so it is what Claude did and nothing else in the folder. A call
// still running, refused or failed changed nothing and is left out.

export type FileEdits = { path: string; edits: number; lines: DiffLine[] };

export function sessionEdits(entries: ChatEntry[]): FileEdits[] {
  const byPath = new Map<string, FileEdits>();
  for (const entry of entries) {
    if (entry.kind !== 'tool' || !entry.result || entry.result.isError) continue;
    const lines = toolDiff(entry.name, entry.input);
    const path = entry.input.file_path;
    if (!lines || typeof path !== 'string') continue;
    const file = byPath.get(path) ?? { path, edits: 0, lines: [] };
    file.edits++;
    // One at a time: spread, a Write of a very long file would be more arguments than a call takes.
    for (const line of lines) file.lines.push(line);
    byPath.set(path, file);
  }
  return [...byPath.values()];
}

// The line over one file's changes: the path, then how many lines went in and out over how many edits.
export function editsHeading(file: FileEdits): string {
  const count = (sign: DiffLine['sign']) => file.lines.filter((line) => line.sign === sign).length;
  return `${file.path}  +${count('+')} −${count('-')}  ${file.edits} ${file.edits === 1 ? 'edit' : 'edits'}`;
}
