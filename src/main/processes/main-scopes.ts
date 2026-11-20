import { scopeSlug } from './scope';

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

// A build from before main scopes had a description: systemd-run's default, the command line, which
// names the session.
const UNDESCRIBED = '[systemd-run] ';
const MAIN_NAME_FLAG = ' --name main-';

// The scopes to stop: every live one an earlier launch of this app started for a main, and every one an
// older build started for a main, whose owner it never wrote down.
// ponytail: an older build's worker in a project named `main` reads as a main here and is stopped too.
export function earlierMains(scopes: readonly ListedScope[], owner: string, launch: string): string[] {
  const ours = mainScopeDescription(owner, launch);
  return scopes
    .filter(({ state, description }) => state !== 'inactive' && state !== 'failed' && description !== ours
      && (description.startsWith(ownerPrefix(owner)) || (description.startsWith(UNDESCRIBED) && description.includes(MAIN_NAME_FLAG))))
    .map(({ unit }) => unit);
}

// The scope among `left` (earlier launches' mains that did not stop) still running the main named
// `name`, which that main may not start beside, or null.
export function mainHolder(name: string, left: readonly string[]): string | null {
  const pattern = new RegExp(`^agent-${scopeSlug(name)}-[a-z0-9]{4}\\.scope$`);
  return left.find((unit) => pattern.test(unit)) ?? null;
}

export function heldRefusal(name: string, unit: string): string {
  return `${name} is still running from an earlier launch, in ${unit}, and did not stop. `
    + `Stop it with \`systemctl --user stop ${unit}\`, then send again.`;
}
