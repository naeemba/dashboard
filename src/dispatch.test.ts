import { describe, expect, it } from 'vitest';
import {
  mainPrompt, mainSessionName, workerArguments, workerResumeArguments, workerSessionName, workerSettings,
} from './dispatch';
import { quoteForShell } from './shell';

describe('session names', () => {
  // Two open projects each have a main, and SendMessage addresses one by its name.
  it('names main after its project', () => {
    expect(mainSessionName('/work/My API')).toBe('main-my-api');
  });

  it('names a worker after its project and the pane it is in', () => {
    expect(workerSessionName('/work/api', 2)).toBe('api-terminal-3');
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
    const args = workerArguments('/bin/zsh', '/work/api', '2:3', 3, 'fix the tests');
    expect(args[1]).toContain('--name api-terminal-4 --permission-mode auto --settings ');
    expect(args[1]).toMatch(/'fix the tests\n\nSendMessage to main-api when done, saying what you did\.'$/);
  });
});

describe('workerResumeArguments', () => {
  // Resumed into another pane after a restart, its hooks must report to that pane.
  it('resumes with the flags a worker starts with, reporting to the pane it is in now', () => {
    const args = workerResumeArguments('/bin/zsh', '2:5', 'ccaaf965-c864-48db-8044-30bf27d93087');
    expect(args[1]).toContain('--resume ccaaf965-c864-48db-8044-30bf27d93087 --permission-mode auto --settings ');
    expect(args[1]).toContain(quoteForShell(workerSettings('2:5'), '/bin/zsh'));
  });
});
