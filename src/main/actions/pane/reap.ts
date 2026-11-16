import type { Refused } from '../../../shared/app/bridge';
import { paneOfKey, type Survivor } from '../../panes/pane-host-protocol';
import type { PaneShell } from '../../panes/pane-shell';
import { action } from '../action';
import { notStoppedText, type PaneClosePorts } from './close';

// The shells the pane host kept through a restart that no page took back once the launch's restore is
// done: a project not reopened, because its folder went or the session that named it was not saved.
// Nothing would ever show them again, and a Claude conversation saved for one is resumed elsewhere, so
// each is killed and its scope stopped, as pane.close stops one, and the bar says which projects lost
// what. Opening the project later finds them gone, not running twice.

export type PaneReapPorts = Pick<PaneClosePorts, 'stopScope' | 'log'> & {
  // Every kept shell not taken back, each handed out once (pane-host-client.ts's unclaimed).
  unclaimed(): { survivor: Survivor; shell: PaneShell }[];
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
  async run(ports): Promise<{ output: string } | Refused> {
    const projects = new Map<string, number>();
    const stops: Promise<void>[] = [];
    for (const { survivor, shell } of ports.unclaimed()) {
      const { projectPath } = paneOfKey(survivor.key);
      projects.set(projectPath, (projects.get(projectPath) ?? 0) + 1);
      // The shell first and its scope after, so what it detached ends with it.
      shell.kill();
      const { unit } = survivor;
      if (unit === undefined) continue;
      stops.push(ports.stopScope(unit).catch((error: unknown) => {
        ports.log({ level: 'warn', kind: 'pane', action: 'pane.reap', project: projectPath, message: notStoppedText(unit, error) });
      }));
    }
    await Promise.all(stops);
    const output = endedText(projects);
    if (output !== '') ports.log({ level: 'info', kind: 'pane', action: 'pane.reap', message: output });
    return { output };
  },
});
