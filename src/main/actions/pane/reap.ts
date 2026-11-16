import { paneOfKey, type Survivor } from '../../panes/pane-host-protocol';
import { action } from '../action';
import { stopOrWarn, type PaneClosePorts } from './close';

// The shells the pane host kept through a restart that no page took back once the launch's restore is
// done. Only a project the launch's session never named loses them: it was closed before the quit,
// or its session was not saved, and nothing would show them again. A project the session named that
// did not open (a folder on a disk not mounted yet, an open that threw) may have a worker mid-turn in
// them, so its shells are put back for when it opens, and the bar says so. A project closed during the
// run killed its own shells already (project.close). Each one ended is killed and its scope stopped,
// as pane.close stops one.

export type PaneReapPorts = Pick<PaneClosePorts, 'stopScope' | 'log'> & {
  // Every kept shell not taken back, each handed out once (pane-host-client.ts's unclaimed).
  unclaimed(): Survivor[];
  // Back to the host client, for the project's open to adopt.
  keep(survivors: readonly Survivor[]): void;
  // Whether the session this launch restored named the project.
  inSession(projectPath: string): boolean;
  // The host kills the shell under this key.
  killKept(key: string): void;
};

function counted(survivors: readonly Survivor[]): string {
  const projects = new Map<string, number>();
  for (const { key } of survivors) {
    const { projectPath } = paneOfKey(key);
    projects.set(projectPath, (projects.get(projectPath) ?? 0) + 1);
  }
  return [...projects].map(([projectPath, count]) => `${count} in ${projectPath}`).join(', ');
}

// What the bar says, or '' when every kept shell was taken back.
export function reapedText(ended: readonly Survivor[], kept: readonly Survivor[]): string {
  return [
    ended.length === 0 ? '' : `Ended the shells kept for projects not in the session: ${counted(ended)}`,
    kept.length === 0 ? '' : `Kept the shells of projects that did not reopen, until they open: ${counted(kept)}`,
  ].filter((part) => part !== '').join('. ');
}

export const paneReap = action<PaneReapPorts, Record<string, never>, { output: string }>('pane.reap', {
  words: [],
  input: () => ({}),
  async run(ports) {
    const unclaimed = ports.unclaimed();
    const kept = unclaimed.filter(({ key }) => ports.inSession(paneOfKey(key).projectPath));
    const ended = unclaimed.filter((survivor) => !kept.includes(survivor));
    ports.keep(kept);
    const stops = ended.map(({ key, unit }) => {
      // The shell first and its scope after, so what it detached ends with it.
      ports.killKept(key);
      return unit === undefined ? null : stopOrWarn(ports, unit, 'pane.reap', { project: paneOfKey(key).projectPath });
    });
    await Promise.all(stops);
    const output = reapedText(ended, kept);
    if (output !== '') ports.log({ level: 'info', kind: 'pane', action: 'pane.reap', message: output });
    return { output };
  },
});
