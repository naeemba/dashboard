import { failureText } from '../../shared/errors/failure';
import type { OpenPullRequest } from '../board/merge-request';
import { paneRow, type PaneStatus } from './status-lines';

// How a worker's stop or stall notice reaches main carrying the worker's `pane status` line, so main
// learns where the worker stands, and its pull request's number and CI, without asking pane list and
// gh pr list after the notice (session-requests.ts). Only a card's pane has a pull request to ask the
// forge for; any other pane's notice is told at once.

export type RowNoticePorts = {
  // Queues the text in main's session, answering the id `withdraw` takes it back by.
  tell(text: string): string;
  withdraw(messageId: string): void;
  // The project's open pull requests, asked only for a card's pane. Throws when the forge cannot answer.
  openPullRequests(): Promise<readonly OpenPullRequest[]>;
};

// Answers a way to take the notice back: before the forge answers, it is never told.
export function tellWithRow(ports: RowNoticePorts, pane: Omit<PaneStatus, 'report'>, text: (row: string) => string): () => void {
  const say = (pulls: readonly OpenPullRequest[] | string) => ports.tell(text(paneRow(pane, pulls)));
  if (pane.card === undefined) {
    const messageId = say([]);
    return () => ports.withdraw(messageId);
  }
  let messageId: string | undefined;
  let withdrawn = false;
  void ports.openPullRequests().catch((error: unknown) => failureText(error)).then((pulls) => {
    if (!withdrawn) messageId = say(pulls);
  });
  return () => {
    withdrawn = true;
    if (messageId !== undefined) ports.withdraw(messageId);
  };
}
