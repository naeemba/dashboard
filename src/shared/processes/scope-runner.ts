// The program that starts a process inside its systemd scope: src/main/processes/scope.ts runs it,
// scope-support.ts asks whether this machine has it, and pane-shell.ts reads it as a pane's shell
// while it is still starting one.
export const SCOPE_RUNNER = 'systemd-run';
