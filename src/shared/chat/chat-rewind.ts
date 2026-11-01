import type { ForkSessionOptions, Options, RewindFilesResult } from '@anthropic-ai/claude-agent-sdk';
import { typedPrompt } from './chat-history';
import { applyMessage, EMPTY_TRANSCRIPT } from './chat-transcript';
import { fuzzyScore } from '../app/fuzzy';
import type { SearchRow } from '../../renderer/app/overlay';

// /rewind on the Claude screen, as Claude Code's Esc Esc: a prompt of the conversation picked, and the
// code, the conversation or both put back to how they were just before it. The code goes back through
// the session's file checkpoints, keyed by the prompt's own id; the conversation goes back by a resume
// that stops at the message before the prompt, forked into a new conversation so the old one stays in
// /resume.

// A prompt the conversation can go back to: its id, which rewindFiles takes, the id of the message
// before it, where the resume stops (null for the first prompt, which leaves nothing to resume), and
// what was typed.
export type RewindPoint = { id: string; before: string | null; text: string };

export type RewindChoice = { code: boolean; conversation: boolean };

export type RewindNotice = { error: boolean; text: string };

// What happens to the conversation once the code half of a /rewind is done: left alone when only the
// code was picked or the code could not go back, forgotten before the first prompt (nothing to resume
// up to, so a new conversation), and otherwise cut at the message before the prompt.
export type ConversationRewind = 'keep' | 'forget' | { cutAt: string };

const CHOICES: SearchRow<RewindChoice>[] = [
  { name: 'Restore code and conversation', detail: 'Files and the conversation go back to just before this prompt', choice: { code: true, conversation: true } },
  { name: 'Restore conversation', detail: 'The conversation goes back to just before this prompt; files stay as they are', choice: { code: false, conversation: true } },
  { name: 'Restore code', detail: 'Files go back to just before this prompt; the conversation stays as it is', choice: { code: true, conversation: false } },
];

// The prompts typed in a conversation read back from disk, oldest first: a message the screen would
// draw as one prompt of yours. A `!` command, a tool result and what Claude Code injects are not.
export function rewindPoints(messages: Record<string, unknown>[]): RewindPoint[] {
  return messages.flatMap((message, index) => {
    if (message.type !== 'user') return [];
    const entries = applyMessage(EMPTY_TRANSCRIPT, message).entries;
    const [entry] = entries;
    if (entries.length !== 1 || !typedPrompt(entry) || typeof message.uuid !== 'string') return [];
    const before = messages[index - 1]?.uuid;
    return [{ id: message.uuid, before: typeof before === 'string' ? before : null, text: entry.text }];
  });
}

// The conversation as it stands after a rewind not yet carried on: the forked session names its new
// conversation only when the next prompt starts a turn, so until then the remembered one is read up to
// and including the message the resume stops at.
export function rewoundTo<T extends { uuid: string }>(messages: T[], at: string | undefined): T[] {
  const index = at === undefined ? -1 : messages.findIndex((message) => message.uuid === at);
  return index < 0 ? messages : messages.slice(0, index + 1);
}

// The prompts /rewind lists, newest first, or the ones matching what is typed, best first.
export function rewindRows(points: RewindPoint[], query: string): SearchRow<RewindPoint>[] {
  // The sort is stable, so prompts that score the same stay newest first.
  return [...points].reverse()
    .flatMap((point) => {
      const score = query ? fuzzyScore(point.text, query) : 0;
      return score === null ? [] : [{ point, score }];
    })
    .sort((one, other) => one.score - other.score)
    .map(({ point }) => ({ name: point.text.split('\n')[0], detail: '', choice: point }));
}

// What can go back, as Claude Code offers it, filtered by what is typed.
export function rewindChoices(query: string): SearchRow<RewindChoice>[] {
  return CHOICES.filter((row) => !query || fuzzyScore(row.name, query) !== null);
}

// The prompt the box holds again after a rewind, as Claude Code's does: only when the conversation
// went back, which a code restore that failed stops it doing.
export function promptAfterRewind(point: RewindPoint, choice: RewindChoice, notice: Pick<RewindNotice, 'error'> | null): string | undefined {
  return choice.conversation && !notice?.error ? point.text : undefined;
}

// What the screen says after the code went back, or why it did not. The count is the dry run's: a
// real rewind reports only the links it would not follow.
export function restoredNotice(result: RewindFilesResult): RewindNotice {
  if (!result.canRewind) return { error: true, text: `Code not restored: ${result.error ?? 'there is no checkpoint for that prompt'}.` };
  const changed = result.filesChanged?.length ?? 0;
  const skipped = result.skippedLinks ? ` ${result.skippedLinks} behind a link left as they are.` : '';
  return { error: false, text: `Code restored: ${changed} ${changed === 1 ? 'file' : 'files'} put back.${skipped}` };
}

// The code goes back first; a code rewind refused leaves the conversation as it is.
export function conversationAfterRewind(point: RewindPoint, choice: RewindChoice, restored: RewindFilesResult | null): ConversationRewind {
  if (!choice.conversation || restored?.canRewind === false) return 'keep';
  return point.before === null ? 'forget' : { cutAt: point.before };
}

// How a session resumes with a conversation cut pending: up to the cut, forked into a new
// conversation so the old one stays whole in /resume.
export function resumeFrom(resume: string | undefined, cutAt: string | undefined): Pick<Options, 'resume' | 'resumeSessionAt' | 'forkSession'> {
  return { resume, resumeSessionAt: cutAt, forkSession: cutAt !== undefined };
}

// How /branch copies a conversation with a cut pending: up to and including the message the cut stops
// at, the same message resumeFrom stops at, so the copy does not bring back what the rewind took away.
// No name typed leaves the title to the SDK, the original's with " (fork)".
export function forkFrom(projectPath: string, cutAt: string | undefined, title: string): ForkSessionOptions {
  return { dir: projectPath, upToMessageId: cutAt, title: title || undefined };
}
