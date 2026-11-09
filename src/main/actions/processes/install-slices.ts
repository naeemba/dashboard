import path from 'node:path';
import { action } from '../action';
import { isFilledText } from '../pane/pane-input';

// The two slices every scope the app starts goes under (processes/scope.ts), written into the user's
// systemd folder at launch where missing and never over one that is there: the user tunes them with a
// drop-in (agents.slice.d/override.conf), and an edited file is theirs. processes-decision-2 says why
// these numbers.

// Every agent together: a third of the CPU weight a desktop process gets, and memory capped as one
// so a run of test suites swaps the agents rather than the desktop.
const AGENTS_SLICE = `[Unit]
Description=Dashboard agents: each Claude a pane or session runs, in a scope of its own

[Slice]
CPUWeight=30
MemoryHigh=16G
MemoryMax=20G
MemorySwapMax=6G
`;

// The user's own shells and editor, grouped so systemd-cgtop shows them apart; no caps.
const PANES_SLICE = `[Unit]
Description=Dashboard panes: each shell and editor, in a scope of its own

[Slice]
`;

export const SLICE_UNITS: Readonly<Record<string, string>> = { 'agents.slice': AGENTS_SLICE, 'panes.slice': PANES_SLICE };

export type InstallSlicesPorts = {
  // The file written with `text` when there is none, making its folder; false when one was already
  // there, which is left as it is.
  writeNew(file: string, text: string): boolean;
  // `systemctl --user daemon-reload`, so the manager reads what was written.
  reload(): Promise<void>;
};

export const processesInstallSlices = action<InstallSlicesPorts, { folder: string }, { output: string; written: string[] }>('processes.install-slices', {
  words: [],
  input: ({ folder }) => (isFilledText(folder) ? { folder } : { refused: 'no systemd folder was given' }),
  async run(ports, { folder }) {
    const written = Object.entries(SLICE_UNITS)
      .filter(([name, text]) => ports.writeNew(path.join(folder, name), text))
      .map(([name]) => name);
    if (written.length === 0) return { output: 'the slices were already installed', written };
    await ports.reload();
    return { output: `installed ${written.join(' and ')}`, written };
  },
});

// Where systemd looks for the user's own units.
export function systemdUserFolder(environment: Readonly<Record<string, string | undefined>>, home: string): string {
  return path.join(environment.XDG_CONFIG_HOME || path.join(home, '.config'), 'systemd', 'user');
}
