import { action } from '../action';
import { isFilledText } from '../pane/pane-input';
import { earlierMains, listedScopes } from '../../processes/main-scopes';

// The main sessions an earlier launch of this app left running, stopped before this launch starts one
// of its own (processes-decision-6). Asked at launch for all of them, and again by a main about to
// start whose name one still held.

export type StopEarlierMainsPorts = {
  // `systemctl --user show --property=Id,ActiveState,Description 'agent-main-*'`.
  list(): Promise<string>;
  // Those units stopped, waiting until they are. A stop that fails or times out is read back by `list`.
  stop(units: string[]): Promise<void>;
};

type Input = { owner: string; launch: string };

export const processesStopEarlierMains = action<StopEarlierMainsPorts, Input, { output: string; left: string[] }>('processes.stop-earlier-mains', {
  words: [],
  input: ({ owner, launch }) => (isFilledText(owner) && isFilledText(launch) ? { owner, launch } : { refused: 'no app folder or launch was given' }),
  async run(ports, { owner, launch }) {
    const earlier = earlierMains(listedScopes(await ports.list()), owner, launch);
    if (earlier.length === 0) return { output: 'no main session from an earlier launch was running', left: [] };
    await ports.stop(earlier).catch(() => undefined);
    const left = earlierMains(listedScopes(await ports.list()), owner, launch);
    const stopped = earlier.filter((unit) => !left.includes(unit));
    const output = `stopped the main sessions an earlier launch left running: ${stopped.join(', ') || 'none'}`;
    return { output: left.length > 0 ? `${output}; still running: ${left.join(', ')}` : output, left };
  },
});
