// The views a project's page has, which is the same thing as the modes a project can be left on. It is
// what session.ts checks a saved mode against before restoring it, so a new project view is restorable
// the day it exists rather than only on the screen it was added to.
//
// Manager is not here, and neither is command: those are the manager's own, no project has them, and a
// saved page naming one would come back on a view its page never built.
export const PROJECT_MODES = ['terminals', 'nvim', 'board', 'notes'] as const;
// The same four as a type, so page.ts builds its record of views from this list rather than spelling
// the four names again beside it. A fifth project view is then one row above and nothing else to keep
// in step.
export type ProjectMode = typeof PROJECT_MODES[number];

// A page shows one of these at a time. A project opens as terminals and moves between the first four;
// the manager page has only its own three and never leaves them.
//
// Built from the list above rather than spelled out again: a project view left out of PROJECT_MODES
// but written in here works until you restart, and then the app comes back on terminals with nothing
// saying why. Derived, that sentence cannot be written.
export const MODES = [...PROJECT_MODES, 'manager', 'command'] as const;
export type Mode = typeof MODES[number];
