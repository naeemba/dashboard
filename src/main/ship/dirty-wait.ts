// A review start that keeps meeting a dirty worktree while its worker is idle. The swap is tried
// again every tick, which is right while the agent's last commit is still being made, and wrong once
// the agent has walked away: on 2026-11-28 three pull requests sat five hours that way, and the card's
// line reached nobody. So the project's main is told, once per spell of waiting, after this long.
export const DIRTY_WAIT_MS = 5 * 60_000;

// How many files a line names before it counts the rest.
const NAMED_FILES = 5;

export function namedFiles(files: readonly string[]): string {
  const named = files.slice(0, NAMED_FILES).join(', ');
  return files.length > NAMED_FILES ? `${named} and ${files.length - NAMED_FILES} more` : named;
}

// When each card's waiting began, and whether main has been told about it. `waited` is asked on every
// dirty refusal and answers true once, the first time the wait has gone past DIRTY_WAIT_MS; `clear` ends
// the spell (the review started, failed for another reason, or the agent was seen working again), so a
// later spell is told again.
export function dirtyWaits(): { waited: (cardId: string, now: number) => boolean; clear: (cardId: string) => void } {
  const since = new Map<string, number>();
  const told = new Set<string>();
  return {
    waited(cardId, now) {
      const began = since.get(cardId) ?? now;
      since.set(cardId, began);
      if (told.has(cardId) || now - began < DIRTY_WAIT_MS) return false;
      told.add(cardId);
      return true;
    },
    clear(cardId) {
      since.delete(cardId);
      told.delete(cardId);
    },
  };
}

export type DirtyWait = { cardId: string; title: string; pullRequest: number; worktreePath: string; files: readonly string[] };

// What main is told: which review, where, the files, and what lets it start.
export function dirtyWaitNotice({ cardId, title, pullRequest, worktreePath, files }: DirtyWait): string {
  const minutes = DIRTY_WAIT_MS / 60_000;
  return [
    `The review of "${title}" (pull request #${pullRequest}) has waited ${minutes} minutes on uncommitted changes in ${worktreePath}, and its worker is idle: ${namedFiles(files)}.`,
    `Commit or discard them there: the app tries the review again every few seconds (card ${cardId}).`,
  ].join(' ');
}
