import { paneOfKey, type Survivor } from '../../panes/pane-host-protocol';
import { action } from '../action';
import { stopOrWarn, type PaneClosePorts } from './close';

// The shells the pane host kept through a restart that no page took back once the launch's restore is
// done: a project not reopened, because its folder went or the session that named it was not saved.
// Nothing would ever show them again, and a Claude conversation saved for one is resumed elsewhere, so
// each is killed and its scope stopped, as pane.close stops one, and the bar says which projects lost
// what. Opening the project later finds them gone, not running twice.

export type PaneReapPorts = Pick<PaneClosePorts, 'stopScope' | 'log'> & {
  // Every kept shell not taken back, each handed out once (pane-host-client.ts's unclaimed).
  unclaimed(): Survivor[];
  // The host kills the shell under this key.
  killKept(key: string): void;
};

// What the bar says, or '' when every kept shell was taken back.
export function endedText(projects: ReadonlyMap<string, number>): string {
  if (projects.size === 0) return '';
  const named = [...projects].map(([projectPath, count]) => `${count} in ${projectPath}`).join(', ');
  return `Ended the shells kept for projects not reopened: ${named}`;
}

export const paneReap = action<PaneReapPorts, Record<string, never>, { output: string }>('pane.reap', {
  words: [],
  input: () => ({}),
  async run(ports) {
    const projects = new Map<string, number>();
    const stops: Promise<string | null>[] = [];
    for (const { key, unit } of ports.unclaimed()) {
      const { projectPath } = paneOfKey(key);
      projects.set(projectPath, (projects.get(projectPath) ?? 0) + 1);
      // The shell first and its scope after, so what it detached ends with it.
      ports.killKept(key);
      if (unit !== undefined) stops.push(stopOrWarn(ports, unit, 'pane.reap', { project: projectPath }));
    }
    await Promise.all(stops);
    const output = endedText(projects);
    if (output !== '') ports.log({ level: 'info', kind: 'pane', action: 'pane.reap', message: output });
    return { output };
  },
});
