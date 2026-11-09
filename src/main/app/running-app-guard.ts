// The PreToolUse hook that keeps agents from quitting, killing, restarting or replacing the Dashboard
// running on this machine (workflow-rule-1, workflow-decision-7). A quit stops every Claude screen
// mid-turn and, with no pane host, every worker's shell with it.
//
// It runs inside `board guard` (board-program.ts), so it reaches every door the board guard does:
// a terminal worker's --settings, a Claude screen's, and the user's ~/.claude/settings.json.
//
// What goes through: scripts/rebuild.sh and scripts/release.sh, which swap a new build in beside the
// running one without stopping it, and any build into out/ or .vite/ (no-running-app.mjs refuses
// that while an app runs out of the checkout).
// ponytail: it reads the command's text. A script of your own, a `$(…)` built at run time or a
// `python -c` still gets through; matching those means running the shell, and this is a guard rail.

import { hookRefusal, SHELL_REDIRECT, textField } from './hook-answer';

// The command line of a process that is the running Dashboard: the installed build on Linux or a
// mac, or electron run out of a checkout (the shape running-app.mjs looks for).
const RUNNING_APP = /\/\.local\/opt\/dashboard\/|\/Dashboard\.app\/|\/node_modules\/electron\//;

// The installed build named in a command, by any spelling of home.
const INSTALLED = String.raw`(?:\.local\/opt\/dashboard|\/Applications\/Dashboard\.app)(?![\w.-])`;

const NAMES_APP = /dashboard|electron/i;
// A copy, move, removal or link that names the installed build, or a redirect or tee into it. A read
// (`ls`, `cat`, running its dashboard-cli-entry.js) goes through.
const REPLACES = new RegExp(String.raw`\b(?:cp|mv|rm|rsync|ditto|ln)\b.*${INSTALLED}`);
const WRITES_INTO = new RegExp(String.raw`${SHELL_REDIRECT}\s*["']?[^\s"']*${INSTALLED}`);
const FINDS_PID = new RegExp(String.raw`\b(?:pgrep|pidof)\b[^;&|)]*(?:${NAMES_APP.source})`, 'i');

const RUNNING_APP_REASON = 'This would quit, kill, restart or replace the Dashboard running on this machine, '
  + 'which stops every Claude screen mid-turn. Say the installed app needs a rebuild and restart, and stop; '
  + 'scripts/rebuild.sh installs a new build beside the running one without touching it.';

// The simple commands of a command line, split at `;`, `&&`, `||`, `|`, `&` and newlines.
function simpleCommands(command: string): string[] {
  return command.split(/&&|\|\||[;|&\n]/).map((part) => part.trim());
}

// The literal pids a `kill` names, flags and job specs left out.
function killedPids(part: string): number[] {
  const words = /^(?:sudo\s+)?kill\s+(.*)$/.exec(part)?.[1].split(/\s+/) ?? [];
  return words.filter((word) => /^\d+$/.test(word)).map(Number);
}

// `commandLineOf` answers a pid's command line, or null when there is none to read.
export function stopsRunningApp(command: string, commandLineOf: (pid: number) => string | null): boolean {
  if (/\bkill\b/.test(command) && FINDS_PID.test(command)) return true;
  return simpleCommands(command).some((part) =>
    (/\b(?:pkill|killall)\b/.test(part) && NAMES_APP.test(part))
    || (/\bosascript\b/.test(part) && /\bquit\b/.test(part) && /dashboard/i.test(part))
    || /\bopen\b.*(?:-a\s+["']?Dashboard\b|Dashboard\.app)/.test(part)
    || REPLACES.test(part) || WRITES_INTO.test(part)
    || killedPids(part).some((pid) => RUNNING_APP.test(commandLineOf(pid) ?? '')));
}

// The hook's answer, as `board guard` prints it on stdout; undefined lets the call through.
export function runningAppGuard(toolName: string, toolInput: unknown, commandLineOf: (pid: number) => string | null) {
  const stops = toolName === 'Bash' && stopsRunningApp(textField(toolInput, 'command'), commandLineOf);
  return stops ? hookRefusal(RUNNING_APP_REASON) : undefined;
}
