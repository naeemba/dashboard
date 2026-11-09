import { slug } from '../../shared/app/slug';

// Which systemd scope a process the app starts runs in, as a command: the decision only, nothing
// spawned or asked here. docs/processes/README.md says why each pane and agent gets a scope of its
// own, and processes-decision-1 why the per-scope caps are what they are.

// An agent is a Claude the app started (in a pane's terminal, or a session): it goes under
// agents.slice, capped on its own. A task is one of the manager's commands across projects (builds,
// tests): under agents.slice with the same caps, named `task-*` so it reads apart from a session. A
// shell is the user's own pane or the editor: under panes.slice, uncapped.
export type ScopeKind = 'agent' | 'task' | 'shell';

// What one agent may hold before the kernel reclaims from it (high) and before it is killed (max).
// The slice's own caps are in its unit file (install-slices.ts), where a drop-in tunes them.
const AGENT_MEMORY_HIGH = '6G';
const AGENT_MEMORY_MAX = '8G';

const SLICES: Record<ScopeKind, string> = { agent: 'agents.slice', task: 'agents.slice', shell: 'panes.slice' };
const PREFIXES: Record<ScopeKind, string> = { agent: 'agent', task: 'task', shell: 'pane' };

// What the edge knows: whether scopes work on this machine at all, a fresh random suffix, and
// whether a unit name is already in use.
export type ScopeSupport = {
  available: boolean;
  suffix(): string;
  taken(unit: string): boolean;
};

// `id` names the scope in systemd-cgtop and `systemctl --user status 'agent-*'`: a pane's project
// and number, a session's id.
export type ScopeRequest = { kind: ScopeKind; id: string; file: string; args: readonly string[] };

// What to start. `unit` is the scope's full name (`agent-dashboard-3-k4f2.scope`), the one to stop
// or read later, or null when the command runs as it was asked, outside any scope.
export type ScopedCommand = { file: string; args: string[]; unit: string | null };

export function scopedCommand(request: ScopeRequest, support: ScopeSupport): ScopedCommand {
  const unchanged = { file: request.file, args: [...request.args], unit: null };
  if (!support.available) return unchanged;
  const unit = freeUnit(request, support);
  if (unit === null) return unchanged;
  return {
    file: 'systemd-run',
    args: [
      '--user', '--scope', '--collect', '--quiet', `--slice=${SLICES[request.kind]}`, `--unit=${unit}`,
      ...(request.kind !== 'shell' ? ['-p', `MemoryHigh=${AGENT_MEMORY_HIGH}`, '-p', `MemoryMax=${AGENT_MEMORY_MAX}`] : []),
      '--', request.file, ...request.args,
    ],
    unit,
  };
}

// A name not in use, on the second try at most. Two misses in a row mean something other than chance
// is holding the names, and the process runs unscoped rather than not at all.
function freeUnit(request: ScopeRequest, support: ScopeSupport): string | null {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const unit = `${PREFIXES[request.kind]}-${scopeSlug(request.id)}-${support.suffix()}.scope`;
    if (!support.taken(unit)) return unit;
  }
  return null;
}

// The same scope running another command: systemd-run's own options up to its `--`, then `file` and
// `args`. For a command known only once something else builds it (the Agent SDK's, claude-process.ts).
export function retargeted(scope: ScopedCommand, file: string, args: readonly string[]): ScopedCommand {
  if (scope.unit === null) return { file, args: [...args], unit: null };
  return { file: scope.file, args: [...scope.args.slice(0, scope.args.indexOf('--') + 1), file, ...args], unit: scope.unit };
}

const SLUG_LIMIT = 40;

// The id as a unit name can carry it: slug's letters, digits and dashes, cut to SLUG_LIMIT.
// `dashboard:3` and `Dashboard 3` both come out `dashboard-3`.
export function scopeSlug(id: string): string {
  return slug(id).slice(0, SLUG_LIMIT).replace(/-+$/, '') || 'unnamed';
}
