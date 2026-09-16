// A page shows one of these at a time. A project opens as terminals and moves between the first four;
// the manager page has only its own three and never leaves them.
export const MODES = ['terminals', 'nvim', 'board', 'notes', 'manager', 'command'] as const;
export type Mode = typeof MODES[number];

// The views a project's page has, which is the same thing as the modes a project can be left on. It is
// what session.ts checks a saved mode against before restoring it, so a new project view is restorable
// the day it exists rather than only on the screen it was added to.
//
// Manager is not here, and neither is command: those are the manager's own, no project has them, and a
// saved page naming one would come back on a view its page never built.
export const PROJECT_MODES: readonly Mode[] = ['terminals', 'nvim', 'board', 'notes'];
