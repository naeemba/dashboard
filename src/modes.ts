// A page shows one of these at a time. A project opens as terminals and moves between the first three;
// the manager page has only its own three and never leaves them.
export const MODES = ['terminals', 'nvim', 'board', 'manager', 'command'] as const;
export type Mode = typeof MODES[number];

// Not what the handler reads any more — the three mode actions in actions.ts can be rebound, and
// mapShortcut matches those. This is what session.ts checks a saved mode against before restoring it,
// which is why manager is not here: only projects are saved, and no key selects it. Nor is command,
// for the same reason and one more — it has no key at all. You reach it from the manager's strip,
// which is the point of having a strip.
export const MODE_KEYS: Record<string, Mode> = { t: 'terminals', n: 'nvim', b: 'board' };
