// Which systemd scope a process the app starts runs in, as a command: the decision only, nothing
// spawned or asked here. docs/processes/README.md says why each pane and agent gets a scope of its
// own, and processes-decision-1 why the per-scope caps are what they are.

// An agent is a Claude the app started (in a pane's terminal, or a session): it goes under
// agents.slice, capped on its own. A shell is the user's own pane or the editor: under panes.slice,
// uncapped.
export type ScopeKind = 'agent' | 'shell';

// What one agent may hold before the kernel reclaims from it (high) and before it is killed (max).
// The slice's own caps are in its unit file (install-slices.ts), where a drop-in tunes them.
export const AGENT_MEMORY_HIGH = '6G';
export const AGENT_MEMORY_MAX = '8G';

const SLICES: Record<ScopeKind, string> = { agent: 'agents.slice', shell: 'panes.slice' };
const PREFIXES: Record<ScopeKind, string> = { agent: 'agent', shell: 'pane' };

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
      ...(request.kind === 'agent' ? ['-p', `MemoryHigh=${AGENT_MEMORY_HIGH}`, '-p', `MemoryMax=${AGENT_MEMORY_MAX}`] : []),
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

const SLUG_LIMIT = 40;

// The id as a unit name can carry it: letters, digits and dashes, lowercase, no longer than
// SLUG_LIMIT. `dashboard:3` and `Dashboard 3` both come out `dashboard-3`.
export function scopeSlug(id: string): string {
  const slug = id.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, SLUG_LIMIT).replace(/^-+|-+$/g, '');
  return slug === '' ? 'unnamed' : slug;
}
