// A page shows one of these at a time. Terminals is what a project opens as.
export type Mode = 'terminals' | 'nvim' | 'board';

// Not what the handler reads any more — the three mode actions in actions.ts can be rebound, and
// mapShortcut matches those. This is what session.ts checks a saved mode against before restoring it.
export const MODE_KEYS: Record<string, Mode> = { t: 'terminals', n: 'nvim', b: 'board' };
