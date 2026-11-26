import type { OpenPullRequest } from '../board/merge-request';
import type { PullRequest } from '../board/pull-request-column';
import { checksPassed, pullRequestStatus } from '../board/pull-request-status';
import type { WorktreeEntry } from '../../shared/app/bridge';
import { cardAt, selectionOf, type Board } from '../../shared/board/board';
import { entryForPane } from '../ship/worktree-store';

// What `pane status` prints: each pane with its card, branch, pull request and CI, then the open pull
// requests no pane holds, so main rebuilds its picture of the project in one call after a compaction
// rather than pane list, board list and gh pr list in turn.

// A pane as session-requests.ts knows it: its id, label and state already joined, the card whose
// worktree record names it, and the end of its worker's last message.
export type PaneStatus = {
  head: string;
  directory: string;
  card?: { id: string; title: string; column: string | null; branch: string };
  report: string;
};

// The card whose worktree record names this pane of the project, with its title and column read off
// the project's board, the record's title when the board has no such card.
export function paneCardIn(
  entries: readonly WorktreeEntry[], projectPath: string | undefined, index: number, board: (projectPath: string) => Board | null,
): PaneStatus['card'] {
  const entry = entryForPane(entries, projectPath, index);
  if (entry === undefined) return undefined;
  const found = board(entry.projectPath);
  const at = found === null ? null : selectionOf(found, entry.cardId);
  if (found === null || at === null) return { id: entry.cardId, title: entry.title, column: null, branch: entry.branch };
  return { id: entry.cardId, title: cardAt(found, at)?.title ?? entry.title, column: found.columns[at.column].name, branch: entry.branch };
}

// The first four columns are pane list's, a card pane's card, branch and pull request after them, and
// the report always last, empty for a pane that has said nothing, as pane list --reports prints it.
// The card's id is cut to eight characters, which board show takes as any start only one card has.
// `pulls` is why the forge could not answer, when it could not: the panes still print, a card pane's
// pull request as unknown rather than as none.
export function statusText(panes: readonly PaneStatus[], pulls: readonly OpenPullRequest[] | string): string {
  const open = typeof pulls === 'string' ? [] : pulls;
  const lines = panes.map(({ head, directory, card, report }) => {
    const fields = [head, directory];
    if (card !== undefined) {
      const pull = open.find((each) => each.branch === card.branch)?.pull;
      const pullField = typeof pulls === 'string' ? 'pr unknown' : pull === undefined ? 'no open pr' : pullText(pull);
      fields.push(`${card.id.slice(0, 8)} ${card.column ?? 'off the board'} "${card.title}"`, card.branch, pullField);
    }
    fields.push(report);
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

// The glyph's reading, else passed when every check passed but it waits on a review or cannot merge,
// else open: no check ran and nothing else is known.
function pullText(pull: PullRequest): string {
  return `#${pull.number} ${pullRequestStatus(pull) ?? (checksPassed(pull) ? 'passed' : 'open')}`;
}
