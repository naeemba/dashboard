// The PreToolUse hook that keeps agents from quitting, killing, restarting or replacing the Dashboard
// running on this machine (workflow-rule-1, workflow-decision-7). A quit stops every Claude screen
// mid-turn and, with no pane host, every worker's shell with it.
//
// It runs inside `board guard` (board-program.ts), so it reaches every door the board guard does:
// a terminal worker's --settings, a Claude screen's, and the user's ~/.claude/settings.json.
//
// A `pkill`, `killall` or a `kill` fed by `pgrep`/`pidof` is checked against the processes it would
// hit, not its words: each one whose command line is the app's (the app, its pane host, its screen
// host, its Claude) refuses it, and `pkill -f vitest` goes through. Every other check anchors its verb
// at the start of a simple command, so a commit message or a grep naming one goes through.
//
// What goes through: scripts/rebuild.sh and scripts/release.sh, which swap a new build in beside the
// running one without stopping it, and any build into out/ or .vite/ (no-running-app.mjs refuses
// that while an app runs out of the checkout).
// ponytail: it reads the command's text. A script of your own, a `$(…)` built at run time, a
// `python -c` or an `xargs`/`find -exec` running pkill still gets through, a heredoc line that starts
// with a verb is refused, and a lone `'` in a heredoc body (`Don't`) hides every command after it;
// matching those means running the shell, and this is a guard rail.

import { hookRefusal, invocation, pipelines, SHELL_REDIRECT, shellBody, simpleCommands, textField, wordsOf } from '../board/hook-answer';

// A process as /proc shows it: its names (comm, argv[0] and argv[0]'s basename), its argv and its
// command line.
export type RunningProcess = {
  pid: number;
  names: string[];
  argv: readonly string[];
  commandLine: string;
}

// A process from its comm and argv, as /proc gives them.
export function runningProcess(pid: number, comm: string, argv: readonly string[]): RunningProcess {
  const program = argv[0] ?? '';
  return { pid, names: [comm, program, program.split('/').at(-1) ?? ''], argv, commandLine: argv.join(' ') };
}

// The processes running, or null where they cannot be read (a mac has no /proc).
export type ProcessList = () => readonly RunningProcess[] | null;

// The command line of a process that is the running Dashboard: anything out of the installed build on
// Linux, a mac or Windows (the app, its pane and screen hosts, its Claude), a pane or screen host anywhere, or
// electron run out of a checkout whose folder is named dashboard (the shape running-app.mjs looks for).
// ponytail: a checkout cloned under another name is not recognised; the installed build always is.
const RUNNING_APP = /\/\.local\/opt\/dashboard\/|\/Dashboard\.app\/|[\\/]AppData[\\/]Local[\\/](?:Programs[\\/])?Dashboard[\\/]|\b(?:pane|screen)-host-entry\.|\/dashboard[^/\s]*\/(?:[^/\s]+\/)?node_modules\/electron\//i;

// Where the process list cannot be read: the names a pattern must carry to be taken for the app's.
const NAMES_APP = /dashboard|electron|claude|\bnode\b|(?:pane|screen)-host/i;

// A word matched in any case, for the Windows path: its filesystem ignores case, Linux's does not.
const anyCase = (word: string) => [...word].map((letter) => `[${letter.toLowerCase()}${letter.toUpperCase()}]`).join('');

// The installed build named in a command, by its tail, so any spelling of home (on Windows, of
// %LOCALAPPDATA%, quoted or through cygpath) is caught. The Start menu's own Programs folder, where
// rebuild.sh puts its "Dashboard (rebuild)" shortcut, is not the build. The Squirrel install,
// %LOCALAPPDATA%\Dashboard, is matched behind AppData\Local or the variable's name, never a bare
// /Dashboard tail, which a checkout named dashboard has too.
const SQUIRREL = String.raw`(?:${anyCase('LOCALAPPDATA')}[%}"')]*|${anyCase('AppData')}[\\/]+${anyCase('Local')})[\\/]+${anyCase('Dashboard')}`;
const INSTALLED = new RegExp(String.raw`(?:\.local\/opt\/dashboard|\/Applications\/Dashboard\.app|(?<!${anyCase('Start Menu')})[\\/]${anyCase('Programs')}[\\/]+${anyCase('Dashboard')}|${SQUIRREL})(?![\w.-])`);
const WRITES_INTO = new RegExp(String.raw`${SHELL_REDIRECT}\s*["']?[^\s"']*${INSTALLED.source}`);

// The flags of each process finder that take a value, so the value is not read as a name.
const VALUE_FLAGS: Record<string, readonly string[]> = {
  pkill: ['-d', '-g', '-G', '-P', '-s', '-t', '-u', '-U', '-F', '--signal'],
  pgrep: ['-d', '-g', '-G', '-P', '-s', '-t', '-u', '-U', '-F'],
  killall: ['-s', '-u', '-o', '-y', '-n', '--signal', '--user'],
  pidof: ['-o'],
};

const RUNNING_APP_REASON = 'This would quit, kill, restart or replace the Dashboard running on this machine, '
  + 'which stops every Claude screen mid-turn. Say the installed app needs a rebuild and restart, and stop; '
  + 'scripts/rebuild.sh installs a new build beside the running one without touching it.';

// What moves or deletes files: the POSIX verbs, then PowerShell's (and their aliases) and cmd's, which
// Windows reads in any case.
const WINDOWS_FILE_VERBS = ['Remove-Item', 'Move-Item', 'Copy-Item', 'Rename-Item', 'ri', 'mi', 'cpi', 'rni', 'del', 'erase', 'rd',
  'rmdir', 'move', 'copy', 'xcopy', 'robocopy', 'ren'].map(anyCase).join('|');
const FILE_VERBS = `cp|mv|rm|rsync|ditto|ln|tar|unzip|install|unlink|${WINDOWS_FILE_VERBS}`;

// What kills a Windows process by its image name: taskkill (/IM, /FI "IMAGENAME eq …") and
// PowerShell's Stop-Process (-Name, or fed by Get-Process). Windows has no /proc to read, and from WSL
// /proc shows the wrong machine, so these are judged by the names they carry: a word of the pipeline
// that, as a wildcard, names one of the app's images (the app and its hosts run as Dashboard.exe or
// node.exe, its Claude as claude.exe). A pid (`/PID`, `-Id`) is not known and goes through.
// ponytail: wmic, PowerShell's `kill` alias and Git Bash's `kill -f` are not read.
const WINDOWS_KILLERS = [String.raw`${anyCase('taskkill')}(?:\.exe)?`, anyCase('Stop-Process'), anyCase('spps')].join('|');
const WINDOWS_APP = ['Dashboard', 'electron', 'node', 'claude'];

function namesWindowsApp(word: string): boolean {
  const glob = word.replace(/\.exe$/i, '').replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  const pattern = new RegExp(`^${glob}$`, 'i');
  return WINDOWS_APP.some((name) => pattern.test(name));
}

function killsWindowsApp(pipeline: string): boolean {
  return simpleCommands(pipeline).some((part) => invocation(part, WINDOWS_KILLERS) !== null)
    && wordsOf(pipeline).flatMap((word) => word.split(',')).some(namesWindowsApp);
}

// The command a `powershell -Command`, `pwsh -c` or `cmd /c` (`//c` from Git Bash) runs, unquoted.
// ponytail: a PowerShell command given with no -Command is not read.
function windowsShellBody(part: string): string | null {
  if (!invocation(part, String.raw`(?:${['powershell', 'pwsh', 'cmd'].map(anyCase).join('|')})(?:\.exe)?`)) return null;
  const body = /\s(?:-c(?:ommand)?|\/\/?[ck])\s+(.*)$/i.exec(part)?.[1];
  return body === undefined ? null : body.replace(/^(["'])(.*)\1$/, '$2');
}

type Selector = { pattern: string; full: boolean; regex: boolean }

// What a pkill, pgrep, killall or pidof picks processes by: pkill and pgrep take one pattern (against
// the whole command line with -f), killall and pidof every name (a pattern with killall -r).
function selectors(verb: string, words: string[]): Selector[] {
  const finder = verb === 'pkill' || verb === 'pgrep';
  const full = finder && words.some((word) => word === '--full' || /^-[a-z]*f[a-z]*$/.test(word));
  const regex = finder || words.includes('-r') || words.includes('--regexp');
  const patterns: string[] = [];
  for (let index = 0; index < words.length; index += 1) {
    if (VALUE_FLAGS[verb].includes(words[index])) index += 1;
    else if (!words[index].startsWith('-')) patterns.push(words[index]);
  }
  return (finder ? patterns.slice(0, 1) : patterns).map((pattern) => ({ pattern, full, regex }));
}

// Case is ignored on purpose: a refusal that is a little wide costs a reworded command, a narrow one a
// dead app.
function picks(selector: Selector, process: RunningProcess): boolean {
  if (!selector.regex) return process.names.some((name) => name.toLowerCase() === selector.pattern.toLowerCase());
  try {
    const pattern = new RegExp(selector.pattern, 'i');
    return selector.full ? pattern.test(process.commandLine) : process.names.some((name) => pattern.test(name));
  } catch {
    return false;
  }
}

// The pids a `kill` names, a process group (`-<pid>` after the signal or `--`) as its leader's pid, or
// 'everything' for `-1` in a pid's place, every process the user owns (`kill -1 <pid>` is SIGHUP).
function killedPids(words: string[]): number[] | 'everything' {
  const pids: number[] = [];
  let signalled = false;
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    if (/^-?\d+$/.test(word) && (signalled || !word.startsWith('-'))) {
      if (word === '-1') return 'everything';
      pids.push(Math.abs(Number(word)));
    }
    else if (word === '-s' || word === '-n') index += 1;
    if (word.startsWith('-') || /^\d+$/.test(word)) signalled = true;
  }
  return pids;
}

// A pipeline that kills what a `pgrep` or `pidof` in it finds: `kill $(pgrep …)`, `pgrep … | xargs kill`.
function foundAndKilled(pipeline: string): Selector[] {
  const kills = simpleCommands(pipeline).some((part) => invocation(part, 'kill') || /^(?:sudo\s+)?xargs\b.*\bkill\b/.test(part));
  if (!kills) return [];
  return [...pipeline.matchAll(/(?:^|[|(`]\s*)(?:sudo\s+)?(pgrep|pidof)\b((?:"[^"]*"|'[^']*'|[^|;&)`"'])*)/g)]
    .flatMap((match) => selectors(match[1], wordsOf(match[2])));
}

export function stopsRunningApp(command: string, listProcesses: ProcessList): boolean {
  // The app's processes, read once and only when a command could kill one.
  let listed: readonly RunningProcess[] | null | undefined;
  const appProcesses = () => (listed === undefined
    ? (listed = listProcesses()?.filter((process) => RUNNING_APP.test(process.commandLine)) ?? null)
    : listed);
  const hitsApp = (selector: Selector) => {
    const app = appProcesses();
    return app === null ? NAMES_APP.test(selector.pattern) : app.some((process) => picks(selector, process));
  };

  if (pipelines(command).some((pipeline) => foundAndKilled(pipeline).some(hitsApp) || killsWindowsApp(pipeline))) return true;
  return simpleCommands(command).some((part) => {
    const body = shellBody(part) ?? windowsShellBody(part);
    if (body !== null && stopsRunningApp(body, listProcesses)) return true;
    const finder = invocation(part, 'pkill|killall');
    if (finder) return selectors(finder.verb, finder.words).some(hitsApp);
    const kill = invocation(part, 'kill');
    if (kill) {
      const pids = killedPids(kill.words);
      return pids === 'everything' || pids.some((pid) => appProcesses()?.some((process) => process.pid === pid) ?? false);
    }
    return (invocation(part, 'osascript') !== null && /\bquit\b/.test(part) && /dashboard/i.test(part))
      || (invocation(part, 'open') !== null && /-a\s+["']?Dashboard\b|Dashboard\.app/.test(part))
      || (invocation(part, FILE_VERBS) !== null && INSTALLED.test(part))
      || (invocation(part, 'find') !== null && /\s-(?:delete|exec(?:dir)?)\b/.test(part) && INSTALLED.test(part))
      || (invocation(part, 'systemctl') !== null && /\b(?:stop|kill|restart)\b/.test(part) && /\b(?:agents|panes)\.slice\b/.test(part))
      || WRITES_INTO.test(part);
  });
}

// The hook's answer, as `board guard` prints it on stdout; undefined lets the call through.
export function runningAppGuard(toolName: string, toolInput: unknown, listProcesses: ProcessList) {
  const stops = toolName === 'Bash' && stopsRunningApp(textField(toolInput, 'command'), listProcesses);
  return stops ? hookRefusal(RUNNING_APP_REASON) : undefined;
}
