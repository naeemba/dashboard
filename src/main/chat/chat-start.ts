// Whether a page's main session starts as soon as it can rather than the first time its Claude screen
// is shown: when a worker it dispatched came back after a restart, on this page or another one. That
// worker ends its turn by SendMessage to the main that dispatched it, by name, which needs that main
// running to arrive at; any other page waits until you look at it, or until the app tells it
// something (performance finding 3: an idle CLI is ~100 MB).
export function startsAtOpen(projectPath: string, workerDispatchers: Iterable<string>): boolean {
  return [...workerDispatchers].includes(projectPath);
}

// The session a status-line measure reads. One asked with `start`, a screen's first show, starts the
// page's session; any other reads the one running, or none, so a model picked after a crash does not
// start a new CLI.
export function sessionToMeasure<S>(start: boolean, starting: () => Promise<S>, existing: Promise<S> | undefined): Promise<S> | undefined {
  return start ? starting() : existing;
}
