// `browser console` and `browser network`: the last errors a tab's page logged and the last requests
// it made that failed, kept from the tab's first load whether or not an agent was asking yet. What the
// page did by itself, so it is written down by browser-views.ts and is no action (browser-decision-2).

// Enough to see what broke on the last load or two, and little for a tab left open all day.
const PAGE_LOG_LIMIT = 50;

export type PageLog = {
  console(level: string, message: string, source: string, line: number): void;
  request(method: string, url: string, failure: string): void;
  consoleText(id: number): string;
  networkText(id: number): string;
};

// A request that failed: refused by the server, or never answered. One the page called off itself, a
// navigation away or a fetch aborted, is no failure.
export function requestFailure(status: number | null, error: string | null): string | null {
  if (error !== null) return error === 'net::ERR_ABORTED' ? null : error;
  return status !== null && status >= 400 ? String(status) : null;
}

export function pageLog(limit = PAGE_LOG_LIMIT): PageLog {
  const errors: string[] = [];
  const failures: string[] = [];
  const push = (list: string[], line: string) => {
    list.push(line);
    if (list.length > limit) list.shift();
  };
  return {
    console(level, message, source, line) {
      // An uncaught exception included, which Chromium logs as an error too.
      if (level === 'error') push(errors, source === '' ? message : `${message} (${source}:${line})`);
    },
    request(method, url, failure) {
      push(failures, `${failure} ${method} ${url}`);
    },
    consoleText: (id) => (errors.length === 0 ? `tab ${id} has logged no error` : errors.join('\n')),
    networkText: (id) => (failures.length === 0 ? `no request of tab ${id} has failed` : failures.join('\n')),
  };
}
