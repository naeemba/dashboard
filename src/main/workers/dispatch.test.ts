import { describe, expect, it } from 'vitest';
import {
  appSessionSettings, mainPrompt, mainSessionName, workerArguments, workerResumeArguments, workerSessionName, workerSettings,
} from './dispatch';
import { quoteForShell, windowsPowerShellWraps } from '../../shared/panes/shell';
import { MANAGER_FOLDER } from '../manager/manager-terminals';

describe('session names', () => {
  // Two open projects each have a main, and SendMessage addresses one by its name.
  it('names main after its project', () => {
    expect(mainSessionName('/work/My API')).toBe('main-my-api');
  });

  it('names a worker after its project and the pane it is in', () => {
    expect(workerSessionName('/work/api', 2)).toBe('api-terminal-3');
  });

  it('collapses punctuation and trims the hyphens off both ends', () => {
    expect(mainSessionName('/work/--My  "API" v2!--')).toBe('main-my-api-v2');
  });

  // A branch name is cut to fit a shell prompt; a session name is not.
  it('keeps a long project name whole', () => {
    const long = 'a'.repeat(60);
    expect(mainSessionName(`/work/${long}`)).toBe(`main-${long}`);
  });

  it('falls back to project when the name leaves nothing behind', () => {
    expect(mainSessionName('/work/پروژه')).toBe('main-project');
    expect(workerSessionName('/work/!!!', 2)).toBe('project-terminal-3');
  });
});

describe('the manager\'s session names', () => {
  // Its folder is .dashboard, which on its own would name it after a checkout called dashboard.
  it('names main and its workers manager', () => {
    expect(mainSessionName(MANAGER_FOLDER)).toBe('main-manager');
    expect(workerSessionName(MANAGER_FOLDER, 1)).toBe('manager-terminal-2');
    expect(mainSessionName('/work/dashboard')).toBe('main-dashboard');
  });

  it('tells the manager\'s main where projects.yaml is', () => {
    expect(mainPrompt(MANAGER_FOLDER)).toContain(`You work in ${MANAGER_FOLDER}`);
    expect(mainPrompt('/work/api')).not.toContain('projects.yaml');
  });
});

describe('mainPrompt', () => {
  it('carries the card\'s dispatch rule word for word', () => {
    expect(mainPrompt('/work/api')).toContain(
      'a pane is for a task I asked for (do X, review X, research X), never for a lookup you need mid-task;'
      + ' those stay inline or in the Agent tool.',
    );
  });

  // A plain run is a screen where there is a screen host and a terminal on Windows (parseRun).
  it('tells main what a plain run starts on its platform', () => {
    expect(mainPrompt('/work/api', 'linux')).toContain('--terminal runs Claude Code in its terminal instead');
    expect(mainPrompt('/work/api', 'win32')).toContain('--screen runs it as a Claude screen instead');
  });
});

describe('mainPrompt verbs', () => {
  // Main once rebuilt dispatch, finish and land as /tmp scripts it lost; the prompt names the verbs.
  // Main once told the user they were on an older build than the one installed.
  // Main once ran another repository's work in a pane on its own page, not knowing project add.
  // Main once landed a loop that swapped the card's rule for its own, relaying the change.
  it('dispatches a card with board ship and names finish, pr land, the budget limit, --version and project add', () => {
    const prompt = mainPrompt('/work/api');
    expect(prompt).toContain('`node "$DASHBOARD_BOARD" ship <id>`');
    expect(prompt).toContain('finish <id>');
    expect(prompt).toContain('`node "$DASHBOARD_COMMAND" pr land <n>`');
    expect(prompt).toContain('`node "$DASHBOARD_COMMAND" pr wait <n>`');
    expect(prompt).toContain('On a conflict it sends /pr-conflicts to the agent on the branch');
    // The queue holds over the limit, so main no longer runs budget before each round.
    expect(prompt).toContain('The queue also holds while the 7-day usage is at or over the limit');
    expect(prompt).toContain('`budget --cap <n>`');
    expect(prompt).toContain('`node "$DASHBOARD_COMMAND" --version`');
    expect(prompt).toContain('`node "$DASHBOARD_COMMAND" project add <path> --name <name>`');
    expect(prompt).toContain('ask me before landing it rather than relaying the change');
  });

  // A cold install outlasts Bash's two-minute default, and main retried a worker that had started.
  it('tells main to wait ten minutes for ship and start --worktree', () => {
    expect(mainPrompt('/work/api')).toContain('start --worktree, like ship');
    expect(mainPrompt('/work/api')).toContain('ten-minute timeout (600000 ms)');
  });

  // The app counts the slots: main starts work and is told when a queued start starts.
  it('dispatches with pane start, never claim then run', () => {
    const prompt = mainPrompt('/work/api');
    expect(prompt).toContain('  start [--project <name|aka>]');
    expect(prompt).toContain('queues a start past it, answering `queued <queue id>, <position>`');
    expect(prompt).toContain('  unqueue <queue id>');
    expect(prompt).not.toContain('  claim [');
    expect(prompt).not.toContain('  run <id>');
  });

  // ~/.dashboard is in no project: both commands refuse there without --project.
  it('tells the manager\'s main which project ship and pr land run in', () => {
    const prompt = mainPrompt(MANAGER_FOLDER);
    expect(prompt).toContain('`node "$DASHBOARD_BOARD" ship <id> --project <name|aka>`');
    expect(prompt).toContain('`node "$DASHBOARD_COMMAND" pr land <n> --project <name|aka>`');
    expect(prompt).toContain('timeout 7200000');
  });
});

const USER_DATA = '/tmp/dash-copy';

describe('appSessionSettings', () => {
  // A worker screen is denied the prompt as a terminal worker is; main, where you are, still asks.
  it('denies prompts to a worker only', () => {
    expect(appSessionSettings(USER_DATA, 'worker').permissions.denyInsteadOfPrompting).toBe(true);
    expect(appSessionSettings(USER_DATA, 'main').permissions).not.toHaveProperty('denyInsteadOfPrompting');
  });
});

describe('workerSettings', () => {
  // Stop reports done whatever the worker remembered to say; the permission prompt reports blocked.
  it('hooks the end of the turn and the permission prompt to the session command', () => {
    const settings = JSON.parse(workerSettings('2:3', USER_DATA));
    expect(settings.hooks.Stop[0].hooks[0].command).toBe('node "$DASHBOARD_SESSION" notify 2:3 done --stop-input');
    expect(settings.hooks.Notification[0].matcher).toBe('permission_prompt');
    expect(settings.hooks.Notification[0].hooks[0].command).toBe('node "$DASHBOARD_SESSION" notify 2:3 blocked');
  });

  // A follow-up typed into a finished worker, or a permission answered, puts it back to work.
  it('reports running when a prompt is submitted or a tool has run', () => {
    const settings = JSON.parse(workerSettings('2:3', USER_DATA));
    expect(settings.hooks.UserPromptSubmit[0].hooks[0].command).toBe('node "$DASHBOARD_SESSION" notify 2:3 running --prompt-input');
    expect(settings.hooks.PostToolUse[0].hooks[0].command).toBe('node "$DASHBOARD_SESSION" notify 2:3 running');
  });

  // A fresh machine has no rule for them in ~/.claude/settings.json.
  it('allows the pane, session and board commands, and reading the budget and the version', () => {
    expect(JSON.parse(workerSettings('2:3', USER_DATA)).permissions.allow).toEqual(expect.arrayContaining([
      'Bash(node "$DASHBOARD_COMMAND" pane *)', 'Bash(node "$DASHBOARD_COMMAND" session *)', 'Bash(node "$DASHBOARD_BOARD" *)',
      'Bash(node "$DASHBOARD_COMMAND" budget)', 'Bash(node "$DASHBOARD_COMMAND" --version)',
    ]));
  });

  // A copy started with --user-data-dir saves its screenshots under its own folder, so that is the one read.
  it('allows reading the screenshots and script answers in the folder the app saves into', () => {
    expect(JSON.parse(workerSettings('2:3', USER_DATA)).permissions.allow).toContain('Read(//tmp/dash-copy/browser-files/**)');
  });

  // A terminal worker carries everything a screen does, so a key added to the shared settings reaches both.
  it('carries every app session setting', () => {
    expect(JSON.parse(workerSettings('2:3', USER_DATA))).toMatchObject(appSessionSettings(USER_DATA, 'worker'));
  });

  // Every other space in it is inside a string, and Windows PowerShell wraps a word for claude only when
  // it finds one outside: without this one the JSON reached claude cut at each space, claude took the
  // first piece for a settings file that was not there, and the worker's pane never started.
  it('has a space outside its strings, so Windows PowerShell hands it over whole', () => {
    expect(workerSettings('2:3', USER_DATA).startsWith('{ "hooks":')).toBe(true);
    expect(windowsPowerShellWraps(workerSettings('2:3', USER_DATA))).toBe(true);
  });
});

describe('workerArguments', () => {
  it('hands the prompt over as the argument, ending with the message to main', () => {
    const agentArguments = workerArguments('/bin/zsh', '/work/api', '2:3', 3, 'fix the tests', '/work/api', 'ccaaf965-c864-48db-8044-30bf27d93087', USER_DATA);
    expect(agentArguments[1]).toContain('--session-id ccaaf965-c864-48db-8044-30bf27d93087 --name api-terminal-4 --permission-mode auto --settings ');
    expect(agentArguments[1]).toMatch(/'fix the tests\n\nSendMessage to main-api when done, saying what you did\.'$/);
  });
});

describe('workerResumeArguments', () => {
  // Resumed into another pane after a restart, its hooks must report to that pane.
  it('resumes with the flags a worker starts with, reporting to the pane it is in now', () => {
    const agentResumeArguments = workerResumeArguments('/bin/zsh', '2:5', 'ccaaf965-c864-48db-8044-30bf27d93087', USER_DATA);
    expect(agentResumeArguments[1]).toContain('--resume ccaaf965-c864-48db-8044-30bf27d93087 --permission-mode auto --settings ');
    expect(agentResumeArguments[1]).toContain(quoteForShell(workerSettings('2:5', USER_DATA), '/bin/zsh'));
  });
});
