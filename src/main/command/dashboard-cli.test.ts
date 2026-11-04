import { describe, expect, it } from 'vitest';
import { DASHBOARD_USAGE, routeDashboardCommand } from './dashboard-cli';

describe('routeDashboardCommand', () => {
  it('hands everything after the noun to that noun, untouched', () => {
    expect(routeDashboardCommand(['board', 'set', 'abc', '--pull-request', '12']))
      .toEqual({ kind: 'program', noun: 'board', commandArguments: ['set', 'abc', '--pull-request', '12'] });
    expect(routeDashboardCommand(['pane', 'run', '2:3', '--card', 'x', 'do it']))
      .toEqual({ kind: 'program', noun: 'pane', commandArguments: ['run', '2:3', '--card', 'x', 'do it'] });
  });

  it('reads session as pane', () => {
    expect(routeDashboardCommand(['session', 'claim'])).toEqual({ kind: 'program', noun: 'pane', commandArguments: ['claim'] });
  });

  it('gives a noun with no verb to its program, which prints its own usage', () => {
    expect(routeDashboardCommand(['board'])).toEqual({ kind: 'program', noun: 'board', commandArguments: [] });
  });

  // No words is what `dashboard` always did: open the app. A flag is the app's own, such as --remote.
  it('leaves no words and a leading flag to the app', () => {
    expect(routeDashboardCommand([])).toEqual({ kind: 'app', appArguments: [] });
    expect(routeDashboardCommand(['--remote'])).toEqual({ kind: 'app', appArguments: ['--remote'] });
  });

  it('answers --help with the whole usage and <noun> --help with that noun\'s, which names its verbs', () => {
    expect(routeDashboardCommand(['--help'])).toEqual({ kind: 'help', text: DASHBOARD_USAGE });
    expect(routeDashboardCommand(['-h'])).toEqual({ kind: 'help', text: DASHBOARD_USAGE });
    const pane = routeDashboardCommand(['pane', '--help']);
    expect(pane).toMatchObject({ kind: 'help', text: expect.stringContaining('session claim [--project <name|aka>]') });
    expect(routeDashboardCommand(['board', 'help'])).toMatchObject({ kind: 'help', text: expect.stringContaining('board move <id> <column>') });
  });

  it('answers an unknown noun with its name and the usage', () => {
    expect(routeDashboardCommand(['cards'])).toEqual({ kind: 'refused', message: `no such noun: cards\n\n${DASHBOARD_USAGE}` });
  });

  it('does not take an Object.prototype name for a noun', () => {
    expect(routeDashboardCommand(['toString']).kind).toBe('refused');
  });
});
