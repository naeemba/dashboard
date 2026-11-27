import { action } from '../action';
import { isFilledText } from './pane-input';
import { drainQueue, type PaneQueuePorts } from './queue';

// A worker waiting only on CI gives its slot back (workers-decision-11): `pr wait` and `pr land`,
// run in a main's worker pane, call pane.ci-wait before they wait on the checks and pane.ci-resume once
// the checks are done, which answers when the slot is back: at once while the worker holds one anyway,
// else when the drain finds room under both caps, ahead of every queued entry. holdsSlot reads the
// count. A pane that is no main's worker, main itself included, is never counted, so both answer at
// once and change nothing: main's own `pr land` never waits on the pool.

const paneInput = ({ id }: Record<string, unknown>) => (isFilledText(id) ? { id } : { refused: 'the CI wait needs the pane it runs in' });

export const paneCiWait = action<PaneQueuePorts, { id: string }, { output: string }>('pane.ci-wait', {
  words: [],
  input: paneInput,
  run: async (ports, { id }) => {
    if (ports.worker(id) === null) return { output: '' };
    // No drain: the worker is mid-turn now, holding its slot until its Stop hook's notify drains.
    ports.pool.ciWaits.set(id, (ports.pool.ciWaits.get(id) ?? 0) + 1);
    return { output: '' };
  },
});

export const paneCiResume = action<PaneQueuePorts, { id: string }, { output: string }>('pane.ci-resume', {
  words: [],
  input: paneInput,
  run: (ports, { id }) => {
    if (ports.worker(id) === null || !ports.pool.ciWaits.has(id)) return Promise.resolve({ output: '' });
    return new Promise((resolve) => {
      ports.pool.resuming.push({ id, resolve: () => resolve({ output: '' }) });
      drainQueue(ports);
    });
  },
});
