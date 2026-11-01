import { describe, expect, it } from 'vitest';
import { DASHBOARD_USAGE, routeDashboardCommand } from './dashboard-cli';

describe('routeDashboardCommand', () => {
  it('hands everything after the noun to that noun, untouched', () => {
    expect(routeDashboardCommand(['board', 'set', 'abc', '--pull-request', '12']))
      .toEqual({ ok: true, noun: 'board', commandArguments: ['set', 'abc', '--pull-request', '12'] });
    expect(routeDashboardCommand(['pane', 'run', '2:3', '--card', 'x', 'do it']))
      .toEqual({ ok: true, noun: 'pane', commandArguments: ['run', '2:3', '--card', 'x', 'do it'] });
  });

  it('reads session as pane', () => {
    expect(routeDashboardCommand(['session', 'claim'])).toEqual({ ok: true, noun: 'pane', commandArguments: ['claim'] });
  });

  it('gives a noun with no verb to its program, which prints its own usage', () => {
    expect(routeDashboardCommand(['board'])).toEqual({ ok: true, noun: 'board', commandArguments: [] });
  });

  it('answers no words with the usage and an unknown noun with its name and the usage', () => {
    expect(routeDashboardCommand([])).toEqual({ ok: false, message: DASHBOARD_USAGE });
    expect(routeDashboardCommand(['cards'])).toEqual({ ok: false, message: `no such noun: cards\n\n${DASHBOARD_USAGE}` });
  });

  it('does not take an Object.prototype name for a noun', () => {
    expect(routeDashboardCommand(['toString']).ok).toBe(false);
  });
});
