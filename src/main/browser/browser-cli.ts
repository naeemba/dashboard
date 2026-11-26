import path from 'node:path';
import { readFlagList } from '../command/flags';
import { wholePath } from '../nvim/file-open';
import { wholeNumber } from './browser-tabs';
import { DEFAULT_READ_TOKENS } from './page-reader';

// The `dashboard browser` command's words: what each verb takes, read by the command so a typo is
// answered without the app, and sent to the app as one parsed command (browser-requests.ts). Every
// verb acts for the agent in the pane the command runs in (DASHBOARD_PANE); outside a pane there is
// none, and the command refuses.

// The first word of a browser request on the session socket, then the pane, then the command as JSON.
export const BROWSER_REQUEST = 'browser-request';

type OnTab = { tab: number };
const ON_TAB_ONLY = ['claim', 'release', 'close', 'back', 'forward', 'reload', 'reset', 'snapshot', 'console', 'network'] as const;
const isOnTabOnly = (verb: string): verb is typeof ON_TAB_ONLY[number] => (ON_TAB_ONLY as readonly string[]).includes(verb);
export type BrowserCommand =
  | { verb: 'open'; url: string; project: string | null }
  | { verb: 'tabs'; project: string | null }
  | ({ verb: typeof ON_TAB_ONLY[number] } & OnTab)
  | ({ verb: 'go'; url: string } & OnTab)
  | ({ verb: 'resize'; width: number; height: number } & OnTab)
  | ({ verb: 'read'; maxTokens: number | null; selector: string | null } & OnTab)
  | ({ verb: 'screenshot'; full: boolean; element: string | null } & OnTab)
  | ({ verb: 'click'; ref: string } & OnTab)
  | ({ verb: 'type'; ref: string; text: string } & OnTab)
  | ({ verb: 'press'; key: string; ref: string | null } & OnTab)
  | ({ verb: 'upload'; ref: string; files: string[] } & OnTab)
  | ({ verb: 'eval'; file: string; waitFor: string | null } & OnTab);

// What the command sends the app: eval's file read here, where its path means what the agent meant.
export type BrowserRequest =
  | Exclude<BrowserCommand, { verb: 'eval' }>
  | ({ verb: 'eval'; script: string; waitFor: string | null } & OnTab);

// eval's request once its file is read: the script it holds, or the read's failure as the refusal.
export const evalRequest = (
  { tab, waitFor }: Extract<BrowserCommand, { verb: 'eval' }>,
  read: string | { failed: string },
): { ok: true; request: Extract<BrowserRequest, { verb: 'eval' }> } | { ok: false; message: string } =>
  typeof read === 'string'
    ? { ok: true, request: { verb: 'eval', tab, waitFor, script: read } }
    : { ok: false, message: `the script file could not be read: ${read.failed}` };

// Each file to upload as the agent meant it: from `~`, whole, or from the folder the command runs in.
export const wholeFiles = (files: readonly string[], home: string, folder: string): string[] =>
  files.map((file) => wholePath(file, home) ?? path.resolve(folder, file));

export const BROWSER_USAGE = `browser — the project's browser tabs, for the agent in this pane

  browser open <url> [--project <name|aka>]   open a tab you hold; prints its id
  browser tabs [--project <name|aka>]         every tab: id, who holds it, address, title
  browser claim <tab>                         hold a tab the user opened
  browser release <tab>                       hand a tab back to the user
  browser close <tab>                         close a tab you are done with
  browser go <tab> <url>
  browser back|forward|reload <tab>
  browser resize <tab> <width>x<height>       lay the page out at that size, as a phone: 390x844
  browser reset <tab>                         lay it out at the view's own size again
  browser read <tab> [--max-tokens <n>] [--selector <css>]
                                              the page's main content as markdown, read here
  browser screenshot <tab> [--full] [--element <css>]
                                              a PNG of the page; prints its path
  browser snapshot <tab>                      what can be clicked or typed in, each with a ref (e3)
  browser click <tab> <ref>
  browser type <tab> <ref> "<text>"           types at the end of what the field holds
  browser press <tab> <key> [<ref>]           Enter, Tab, Escape, an arrow, or one character
  browser upload <tab> <ref> <file>...        set a file input's files, as the file dialog would
  browser eval <tab> <script file> [--wait-for <css>]
                                              run the file's JavaScript in the page, once --wait-for
                                              matches (10 seconds at most); saves the answer, its
                                              last expression's value, and prints its path
  browser console <tab>                       the last errors the page logged
  browser network <tab>                       the last requests that failed

You act only on the tabs you hold: the ones you opened and the ones you claimed. A tab opens behind
the one the user is on. The user can take any tab back; your next call on it then says so, and it is
theirs. Close each tab you are done with before you finish: your tabs go back to the user when your
pane is released or your agent exits, and they stay open. A main's tab unused for a while gets one
question from the app; close it, or leave it and it stays. A worker is never asked. --project opens a tab in another open
project's browser. A ref is good until the page changes; take a new snapshot then. read prints its
token estimate first, and cuts at --max-tokens (${DEFAULT_READ_TOKENS} by default).`;

type Parsed = { ok: true; command: BrowserCommand } | { ok: false; message: string };

const refuse = (message: string): Parsed => ({ ok: false, message });

// The flags each verb knows: values, then switches.
const FLAGS: Record<string, [string[], string[]]> = {
  open: [['project'], []],
  tabs: [['project'], []],
  read: [['max-tokens', 'selector'], []],
  screenshot: [['element'], ['full']],
  eval: [['wait-for'], []],
};

// The words before the first flag, then the flags as readFlagList reads them (--name value or
// --name=value), keyed with their dashes.
function flagsOf(verb: string, words: readonly string[]): { flags: Map<string, string>; rest: string[] } | string {
  const first = words.findIndex((word) => word.startsWith('--'));
  const rest = first === -1 ? [...words] : words.slice(0, first);
  if (first === -1) return { flags: new Map(), rest };
  const [allowed, switches] = FLAGS[verb] ?? [[], []];
  if (allowed.length + switches.length === 0) return `browser ${verb} takes no ${words[first]}`;
  const read = readFlagList(words.slice(first), allowed, switches);
  if ('message' in read) return read.message;
  return { flags: new Map(read.flags.map(([name, value]) => [`--${name}`, value])), rest };
}

function parseOnTab(verb: string, rest: readonly string[], flags: Map<string, string>): Parsed {
  const tab = wholeNumber(rest[0]);
  if (tab === null) return refuse(`browser ${verb} needs a tab id, the one \`browser tabs\` prints`);
  const words = rest.slice(1);
  const takes = (count: number, what: string): Parsed | null => (words.length === count ? null : refuse(`browser ${verb} takes ${what}`));
  if (isOnTabOnly(verb)) return takes(0, 'only a tab id') ?? { ok: true, command: { verb, tab } };
  switch (verb) {
    case 'go': return takes(1, 'a tab id and an address') ?? { ok: true, command: { verb, tab, url: words[0] } };
    case 'resize': {
      const size = /^(\d+)x(\d+)$/.exec(words[0] ?? '');
      if (words.length !== 1 || size === null) return refuse('browser resize takes a tab id and a size, like 390x844');
      return { ok: true, command: { verb, tab, width: Number(size[1]), height: Number(size[2]) } };
    }
    case 'read': {
      const typed = flags.get('--max-tokens');
      const maxTokens = typed === undefined ? null : wholeNumber(typed);
      if (typed !== undefined && (maxTokens === null || maxTokens < 1)) return refuse('--max-tokens takes a whole number above 0');
      return takes(0, 'only a tab id and its flags') ?? { ok: true, command: { verb, tab, maxTokens, selector: flags.get('--selector') ?? null } };
    }
    case 'screenshot': {
      const element = flags.get('--element') ?? null;
      if (element !== null && flags.has('--full')) return refuse('a screenshot is of the full page or of one element, not both');
      return takes(0, 'only a tab id and its flags') ?? { ok: true, command: { verb, tab, full: flags.has('--full'), element } };
    }
    case 'click': return takes(1, 'a tab id and a ref from `browser snapshot`') ?? { ok: true, command: { verb, tab, ref: words[0] } };
    case 'type': return takes(2, 'a tab id, a ref and the text') ?? { ok: true, command: { verb, tab, ref: words[0], text: words[1] } };
    case 'press': {
      if (words.length !== 1 && words.length !== 2) return refuse('browser press takes a tab id, a key and maybe a ref');
      return { ok: true, command: { verb, tab, key: words[0], ref: words[1] ?? null } };
    }
    case 'upload': {
      if (words.length < 2) return refuse('browser upload takes a tab id, a ref and one file or more');
      return { ok: true, command: { verb, tab, ref: words[0], files: words.slice(1) } };
    }
    case 'eval': return takes(1, 'a tab id and a script file') ?? { ok: true, command: { verb, tab, file: words[0], waitFor: flags.get('--wait-for') ?? null } };
    default: return refuse(`no such verb: browser ${verb}\n\n${BROWSER_USAGE}`);
  }
}

export function parseBrowserCommand(words: readonly string[]): Parsed {
  const [verb, ...given] = words;
  if (verb === undefined) return refuse(BROWSER_USAGE);
  const parsed = flagsOf(verb, given);
  if (typeof parsed === 'string') return refuse(parsed);
  const { flags, rest } = parsed;
  const project = flags.get('--project') ?? null;
  if (verb === 'open') {
    if (rest.length !== 1) return refuse('browser open takes one address');
    return { ok: true, command: { verb, url: rest[0], project } };
  }
  if (verb === 'tabs') return rest.length === 0 ? { ok: true, command: { verb, project } } : refuse('browser tabs takes no words');
  return parseOnTab(verb, rest, flags);
}

// The command's one refusal outside a pane: a tab is held by a pane, and a terminal of its own is none.
export const OUTSIDE_PANE = 'browser runs only in a Dashboard pane: a tab is held by the agent in a pane, and this terminal is none';
