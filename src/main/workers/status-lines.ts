import type { OpenPullRequest } from '../board/merge-request';
import type { PullRequest } from '../board/pull-request-column';
import { pullRequestStatus } from '../board/pull-request-status';
import type { WorktreeEntry } from '../../shared/app/bridge';
import { cardAt, selectionOf, type Board } from '../../shared/board/board';
import { paneEntryIn } from './auto-release';

// What `pane status` prints: each pane with its card, branch, pull request and CI, then the open pull
// requests no pane holds, so main rebuilds its picture of the project in one call after a compaction
// rather than pane list, board list and gh pr list in turn.

// A pane as session-requests.ts knows it: its id, label and state already joined, the card whose
// worktree record names it, and the end of its worker's last message.
export type PaneStatus = {
  line: string;
  directory: string;
  card?: { id: string; title: string; column: string | null; branch: string };
  report: string;
};

// The card whose worktree record names this pane of the project, with its title and column read off
// the project's board, the record's title when the board has no such card.
export function paneCardIn(
  entries: readonly WorktreeEntry[], projectPath: string | undefined, index: number, board: (projectPath: string) => Board | null,
): PaneStatus['card'] {
  const entry = paneEntryIn(entries, projectPath, index);
  if (entry === undefined) return undefined;
  const read = board(entry.projectPath);
  const at = read === null ? null : selectionOf(read, entry.cardId);
  if (read === null || at === null) return { id: entry.cardId, title: entry.title, column: null, branch: entry.branch };
  return { id: entry.cardId, title: cardAt(read, at)?.title ?? entry.title, column: read.columns[at.column].name, branch: entry.branch };
}

// The card's id is cut to eight characters, which board show takes as any start only one card has.
// `pulls` is why the forge could not answer, when it could not: the panes still print.
export function statusText(panes: readonly PaneStatus[], pulls: readonly OpenPullRequest[] | string): string {
  const open = typeof pulls === 'string' ? [] : pulls;
  const lines = panes.map(({ line, directory, card, report }) => {
    const fields = [line];
    if (card === undefined) fields.push(directory);
    else {
      const pull = open.find((each) => each.branch === card.branch)?.pull;
      fields.push(`${card.id.slice(0, 8)} ${card.column ?? 'off the board'} "${card.title}"`, card.branch,
        pull === undefined ? 'no open pr' : pullText(pull));
    }
    if (report !== '') fields.push(report);
    return fields.join('\t');
  });
  const held = new Set(panes.flatMap(({ card }) => (card === undefined ? [] : [card.branch])));
  const unheld = open.filter((each) => !held.has(each.branch));
  if (typeof pulls === 'string') lines.push('', `open pull requests unknown: ${pulls}`);
  else if (unheld.length > 0) {
    lines.push('', 'open pull requests no pane holds:', ...unheld.map(({ branch, pull }) => `${pullText(pull)}\t${branch}\t${pull.title}`));
  }
  return lines.join('\n');
}

// open says no check ran and nothing else is known: conflicting, or waiting on a review.
function pullText(pull: PullRequest): string {
  return `#${pull.number} ${pullRequestStatus(pull) ?? 'open'}`;
}
