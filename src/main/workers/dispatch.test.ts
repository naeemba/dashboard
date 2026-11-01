import { describe, expect, it } from 'vitest';
import {
  mainPrompt, mainSessionName, workerArguments, workerResumeArguments, workerSessionName, workerSettings,
} from './dispatch';
import { quoteForShell } from '../../shared/panes/shell';
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
});

describe('workerSettings', () => {
  // Stop reports done whatever the worker remembered to say; the permission prompt reports blocked.
  it('hooks the end of the turn and the permission prompt to the session command', () => {
    const settings = JSON.parse(workerSettings('2:3'));
    expect(settings.hooks.Stop[0].hooks[0].command).toBe('node "$DASHBOARD_SESSION" notify 2:3 done');
    expect(settings.hooks.Notification[0].matcher).toBe('permission_prompt');
    expect(settings.hooks.Notification[0].hooks[0].command).toBe('node "$DASHBOARD_SESSION" notify 2:3 blocked');
  });

  // A follow-up typed into a finished worker, or a permission answered, puts it back to work.
  it('reports running when a prompt is submitted or a tool has run', () => {
    const settings = JSON.parse(workerSettings('2:3'));
    expect(settings.hooks.UserPromptSubmit[0].hooks[0].command).toBe('node "$DASHBOARD_SESSION" notify 2:3 running');
    expect(settings.hooks.PostToolUse[0].hooks[0].command).toBe('node "$DASHBOARD_SESSION" notify 2:3 running');
  });
});

describe('workerArguments', () => {
  it('hands the prompt over as the argument, ending with the message to main', () => {
    const agentArguments = workerArguments('/bin/zsh', '/work/api', '2:3', 3, 'fix the tests', '/work/api');
    expect(agentArguments[1]).toContain('--name api-terminal-4 --permission-mode auto --settings ');
    expect(agentArguments[1]).toMatch(/'fix the tests\n\nSendMessage to main-api when done, saying what you did\.'$/);
  });
});

describe('workerResumeArguments', () => {
  // Resumed into another pane after a restart, its hooks must report to that pane.
  it('resumes with the flags a worker starts with, reporting to the pane it is in now', () => {
    const agentResumeArguments = workerResumeArguments('/bin/zsh', '2:5', 'ccaaf965-c864-48db-8044-30bf27d93087');
    expect(agentResumeArguments[1]).toContain('--resume ccaaf965-c864-48db-8044-30bf27d93087 --permission-mode auto --settings ');
    expect(agentResumeArguments[1]).toContain(quoteForShell(workerSettings('2:5'), '/bin/zsh'));
  });
});
