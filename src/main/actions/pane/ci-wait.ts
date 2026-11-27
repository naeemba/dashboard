import { action } from '../action';
import { liveWaits } from '../../workers/pane-pool';
import { isFilledText, isProcessId } from './pane-input';
import { drainQueue, type PaneQueuePorts } from './queue';

// A worker waiting only on CI gives its slot back (workers-decision-11): `pr wait` and `pr land`,
// run in a main's worker pane, call pane.ci-wait before they wait on the checks and pane.ci-resume once
// the checks are done, which answers when the slot is back: at once while the worker holds one anyway,
// else when the drain finds room under both caps, ahead of every queued entry. holdsSlot reads the
// count. A pane that is no main's worker, main itself included, is never counted, so both answer at
// once and change nothing: main's own `pr land` never waits on the pool. Each wait is the process id
// of the run that asked, and a wait whose process is gone is over (liveWaits): a killed `pr wait`
// gives its worker's slot back to its other work.

type CiInput = { id: string; pid: number };

function paneInput({ id, pid }: Record<string, unknown>): CiInput | { refused: string } {
  if (!isFilledText(id)) return { refused: 'the CI wait needs the pane it runs in' };
  if (!isProcessId(pid)) return { refused: 'the CI wait needs the process id of the run waiting' };
  return { id, pid };
}

export const paneCiWait = action<PaneQueuePorts, CiInput, { output: string }>('pane.ci-wait', {
  words: [],
  input: paneInput,
  run: async (ports, { id, pid }) => {
    if (ports.worker(id) === null) return { output: '' };
    // No drain: the worker is mid-turn now, holding its slot until its Stop hook's notify drains.
    ports.pool.ciWaits.set(id, [...liveWaits(ports.pool.ciWaits.get(id) ?? [], ports.alive), pid]);
    return { output: '' };
  },
});

export const paneCiResume = action<PaneQueuePorts, CiInput, { output: string }>('pane.ci-resume', {
  words: [],
  input: paneInput,
  run: (ports, { id, pid }) => {
    if (ports.worker(id) === null || !(ports.pool.ciWaits.get(id) ?? []).includes(pid)) return Promise.resolve({ output: '' });
    return new Promise((resolve) => {
      ports.pool.resuming.push({ id, pid, resolve: () => resolve({ output: '' }) });
      drainQueue(ports);
    });
  },
});
