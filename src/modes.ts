// A page shows one of these at a time. A project opens as terminals and moves between the first three;
// the manager page has only its own and never leaves it.
export type Mode = 'terminals' | 'nvim' | 'board' | 'manager';

// Not what the handler reads any more — the three mode actions in actions.ts can be rebound, and
// mapShortcut matches those. This is what session.ts checks a saved mode against before restoring it,
// which is why manager is not here: only projects are saved, and no key selects it.
export const MODE_KEYS: Record<string, Mode> = { t: 'terminals', n: 'nvim', b: 'board' };
