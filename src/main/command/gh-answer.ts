// What gh answers, read the same by every `pr` verb: a lost answer told from GitHub's refusal, and how
// long a lost one is tried again.

// What gh or git answered: whether it exited 0, and what it printed on either stream.
export type ProgramAnswer = { ok: boolean; output: string };
export type GitHubPorts = { gh(words: string[]): Promise<ProgramAnswer>; wait(milliseconds: number): Promise<void> };

// gh's words when the request or its answer was lost on the way, not refused by GitHub: Go's
// `Post "https://...": unexpected EOF`, a reset or timed-out connection, gh's own line when it cannot
// reach the API at all, a 5xx from the API or its GraphQL endpoint (`non-200 OK status code: 502`), and
// GraphQL's own words for a timeout. Only gh's own lines are read: a check row of `gh pr checks` is
// tab-separated and carries the check's description, which may well say `error connecting to postgres`.
const NETWORK_ERROR = /\b(?:Get|Post) "?https?:\/\/|unexpected EOF|connection (?:reset|refused)|i\/o timeout|TLS handshake timeout|error connecting to|HTTP 5\d\d|status code: 5\d\d|Something went wrong while executing your query/;
export const isNetworkError = (answer: ProgramAnswer) => !answer.ok && answer.output.split('\n').some((line) => !line.includes('\t') && NETWORK_ERROR.test(line));
// The waits before each try again, about four minutes in all: a Wi-Fi rejoin, a VPN reconnect or a
// minute of GitHub trouble is outlasted, where one try five seconds on was not.
export const RETRY_WAITS_MS = [5_000, 10_000, 20_000, 40_000, 60_000, 60_000, 60_000];
export const RETRY_MINUTES = Math.round(RETRY_WAITS_MS.reduce((sum, each) => sum + each, 0) / 60_000);
