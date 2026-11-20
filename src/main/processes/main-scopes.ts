import { unitPrefix } from './scope';

// A project's main session, alone of the app's scopes, never outlives the launch that started it: its
// workers SendMessage it by name, and a second CLI still holding `main-<project>` from an earlier
// launch takes their reports, so the main on screen never hears them (processes-decision-6). The
// decisions only; the commands and the stop are launch-scopes.ts's.

// What a main's scope carries in its description: the userData folder that names the app (one app per
// folder, launch-gate.ts) and this launch's own id, so the next launch of the same app can tell what is
// an earlier launch's and a copy on another folder (the performance demo) keeps its own.
export function mainScopeDescription(owner: string, launch: string): string {
  return `${ownerPrefix(owner)}${launch}`;
}

// What every other agent's scope carries, so that systemd-run's default description, the command line,
// can only mean a build from before scopes had one (earlierMains).
export function agentScopeDescription(owner: string): string {
  return `Dashboard agent for ${owner}`;
}

function ownerPrefix(owner: string): string {
  return `Dashboard main session for ${owner}, launch `;
}

// The app's own unit, which a main's scope is bound to so that it stops when the app's does, a
// SIGKILL included: the last part of the path in /proc/self/cgroup, when that is a scope or a service
// the user's manager runs (`app-dashboard-1234.scope`). Null when the app runs in a unit the user
// manager cannot be bound to (a login session's scope) or is the manager itself.
export function boundUnit(cgroup: string): string | null {
  const line = cgroup.split('\n').find((each) => each.startsWith('0::'));
  if (line === undefined) return null;
  const parts = line.slice(3).trim().split('/');
  const manager = parts.findIndex((part) => /^user@\d+\.service$/.test(part));
  const unit = parts.at(-1) ?? '';
  if (manager === -1 || manager === parts.length - 1 || unit === 'init.scope') return null;
  return /\.(scope|service)$/.test(unit) ? unit : null;
}

// A scope as `systemctl --user show --property=Id,ActiveState,Description` prints it.
export type ListedScope = { unit: string; state: string; description: string };

export function listedScopes(shown: string): ListedScope[] {
  return shown.split(/\n\s*\n/).flatMap((block) => {
    const fields = new Map(block.split('\n').map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
    const unit = fields.get('Id');
    return unit ? [{ unit, state: fields.get('ActiveState') ?? '', description: fields.get('Description') ?? '' }] : [];
  });
}

// A build from before agent scopes had a description: systemd-run's default, the command line, which
// names the session.
const UNDESCRIBED = '[systemd-run] ';

// An older build's main: undescribed, and its unit named for the `--name main-<x>` its command line
// carries, as this file's own mains are. A pane worker in a project named `main` (`agent-main-3-*`,
// `--name main-terminal-3`) does not match.
// ponytail: an older build's worker screen in a project named `main` (`agent-main-terminal-2-*`,
// `--name main-terminal-2`) has the same shape and is stopped too; delete this once older builds are gone.
function olderBuildMain(unit: string, description: string): boolean {
  const name = description.startsWith(UNDESCRIBED) ? / --name (main-\S+)/.exec(description)?.[1] : undefined;
  return name !== undefined && mainHolder(name, [unit]) !== null;
}

// The scopes to stop: every live one an earlier launch of this app started for a main, and every one an
// older build started for a main, whose owner it never wrote down.
export function earlierMains(scopes: readonly ListedScope[], owner: string, launch: string): string[] {
  const ours = mainScopeDescription(owner, launch);
  return scopes
    .filter(({ unit, state, description }) => state !== 'inactive' && state !== 'failed' && description !== ours
      && (description.startsWith(ownerPrefix(owner)) || olderBuildMain(unit, description)))
    .map(({ unit }) => unit);
}

// The scope among `left` (earlier launches' mains that did not stop) still running the main named
// `name`, which that main may not start beside, or null.
export function mainHolder(name: string, left: readonly string[]): string | null {
  // The suffix has no dash, so `main-dashboard` never matches `main-dashboard-two`'s unit.
  const pattern = new RegExp(`^${unitPrefix('main', name)}[a-z0-9]+\\.scope$`);
  return left.find((unit) => pattern.test(unit)) ?? null;
}

export function heldRefusal(name: string, unit: string): string {
  return `${name} is still running from an earlier launch, in ${unit}, and did not stop. `
    + `Stop it with \`systemctl --user stop ${unit}\`, then send again.`;
}
