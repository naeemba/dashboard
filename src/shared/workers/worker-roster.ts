import type { WorkerState } from '../app/bridge';
import { ranked, type SearchRow } from '../app/fuzzy';
import { paneFromId, paneLabel } from '../panes/terminals';

// The workers a main session dispatched, as the Claude screen's status line counts them and its
// workers popup lists them. Main builds the list from what `pane list` already reads
// (session-requests.ts); the decisions about it are here so both ends agree.

export type WorkerStatus = 'working' | 'blocked' | 'done' | 'idle';

export type DispatchedWorker = {
  id: string;
  // The slot whose main ran it, which is another project's for a pane claimed with --project.
  dispatcher: number;
  // The project whose page the pane is on, and the worker's session name.
  project: string;
  name: string;
  // The first words of the prompt it was given.
  about: string;
  status: WorkerStatus;
};

// The order the count and the popup give the states in: what still runs first, what is finished last.
const ORDER: readonly WorkerStatus[] = ['working', 'blocked', 'done', 'idle'];

const ABOUT_WORDS = 8;

export function workerAbout(prompt: string): string {
  const words = prompt.trim().split(/\s+/).filter(Boolean);
  return words.length > ABOUT_WORDS ? `${words.slice(0, ABOUT_WORDS).join(' ')}…` : words.join(' ');
}

// What a worker is doing now. Its agent gone, it is idle whatever its hooks last said: the pane is a
// shell again. Running, its hooks' last word; none yet is the agent at work.
export function workerStatus(agentRunning: boolean, said: WorkerState | undefined): WorkerStatus {
  if (!agentRunning) return 'idle';
  return said === 'blocked' || said === 'done' ? said : 'working';
}

// The status line's button: `3 workers: 2 working, 1 done`, the states in ORDER and only those with a
// worker in them. Empty when there are none, and the button is not drawn.
export function workerCount(workers: readonly DispatchedWorker[]): string {
  if (workers.length === 0) return '';
  const counts = ORDER.flatMap((status) => {
    const count = workers.filter((worker) => worker.status === status).length;
    return count === 0 ? [] : [`${count} ${status}`];
  });
  return `${workers.length} worker${workers.length === 1 ? '' : 's'}: ${counts.join(', ')}`;
}

// The popup's rows: the workers matching what is typed, best first, and with nothing typed the states
// in ORDER, each in the order main gave them. Choosing one answers with its pane id.
export function workerRows(workers: DispatchedWorker[], query: string): SearchRow<string>[] {
  const byState = (one: DispatchedWorker, other: DispatchedWorker) => ORDER.indexOf(one.status) - ORDER.indexOf(other.status);
  return ranked(workers, (worker) => `${worker.project} ${worker.name} ${worker.about}`, query, byState).map((worker) => ({
    name: `${worker.project} · ${paneLabel(paneFromId(worker.id).index)}`,
    detail: `${worker.status} · ${worker.about}`,
    choice: worker.id,
  }));
}
