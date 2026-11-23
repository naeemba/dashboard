import { describe, expect, it } from 'vitest';
import { USAGE as BOARD_USAGE } from '../board/board-usage';
import { BROWSER_USAGE } from '../browser/browser-cli';
import { PROJECT_USAGE } from '../projects/project-cli';
import { SESSION_USAGE } from '../workers/session-cli';
import { BUDGET_USAGE } from './budget-cli';
import { PULL_REQUEST_USAGE } from './pull-request-cli';
import { allowedToolRules, COMMAND_ONLY, DASHBOARD_TOOLS, inputSchema, toolArguments, toolNamed } from './mcp-tools';

const named = (name: string) => {
  const found = toolNamed(name);
  if (found === undefined) throw new Error(`no tool ${name}`);
  return found;
};

describe('toolArguments', () => {
  it('puts the words in order, then each flag given, a switch bare and a list once an item', () => {
    expect(toolArguments(named('board_add'), { title: 'Fix it', priority: 'high', notes: 'why' }))
      .toEqual(['board', 'add', 'Fix it', '--priority', 'high', '--notes', 'why']);
    expect(toolArguments(named('pane_run'), { id: '2:3', prompt: 'do it', worktree: true, terminal: false }))
      .toEqual(['pane', 'run', '2:3', 'do it', '--worktree']);
    expect(toolArguments(named('project_set'), { name: 'x', deploy: ['name=a,role=b,address=c', 'name=d'], clear: ['site'] }))
      .toEqual(['project', 'set', 'x', '--deploy', 'name=a,role=b,address=c', '--deploy', 'name=d', '--clear', 'site']);
    expect(toolArguments(named('browser_read'), { tab: 3, 'max-tokens': 500 })).toEqual(['browser', 'read', '3', '--max-tokens', '500']);
    expect(toolArguments(named('version'), {})).toEqual(['--version']);
  });

  // The noun's parser refuses it, in the words the command line gets.
  it('leaves a missing word out rather than refusing it itself', () => {
    expect(toolArguments(named('board_move'), { id: 'abc' })).toEqual(['board', 'move', 'abc']);
    expect(toolArguments(named('browser_press'), { tab: 1, key: 'Enter' })).toEqual(['browser', 'press', '1', 'Enter']);
  });
});

describe('the tools against the usages', () => {
  const usages: Record<string, string> = {
    board: BOARD_USAGE, pane: SESSION_USAGE, project: PROJECT_USAGE, browser: BROWSER_USAGE, pr: PULL_REQUEST_USAGE, budget: BUDGET_USAGE,
  };
  // `  board list ...`, `  browser back|forward|reload <tab>`: the verbs each usage lists.
  const usageVerbs = Object.entries(usages).flatMap(([noun, usage]) => [...usage.matchAll(new RegExp(`^  ${noun} ([a-z|]+)`, 'gm'))]
    .flatMap((match) => match[1].split('|').map((verb) => `${noun} ${verb}`)));

  it('has a tool for every verb a usage lists, or says why the command keeps it', () => {
    const tools = new Set(DASHBOARD_TOOLS.map((each) => each.words.join(' ')));
    expect(usageVerbs.filter((verb) => !tools.has(verb) && !(verb in COMMAND_ONLY))).toEqual([]);
    expect(Object.keys(COMMAND_ONLY).filter((verb) => !usageVerbs.includes(verb))).toEqual([]);
  });

  it('names only verbs and flags the usages have', () => {
    for (const each of DASHBOARD_TOOLS.filter((one) => one.name !== 'version' && one.name !== 'budget')) {
      expect(usageVerbs, each.name).toContain(each.words.join(' '));
      const usage = usages[each.words[0]];
      for (const parameter of each.parameters.filter((one) => one.flag)) expect(usage, `${each.name} --${parameter.name}`).toContain(`--${parameter.name}`);
    }
  });
});

describe('inputSchema', () => {
  it('requires the words and types each parameter', () => {
    expect(inputSchema(named('browser_press'))).toMatchObject({
      required: ['tab', 'key'],
      properties: { tab: { type: 'number' }, key: { type: 'string' }, ref: { type: 'string' } },
      additionalProperties: false,
    });
    expect(inputSchema(named('board_add'))).toMatchObject({ properties: { priority: { enum: ['urgent', 'high', 'medium', 'low'] } } });
  });
});

describe('allowedToolRules', () => {
  // A project verb that changes the file or the app was never in the command's allowed Bash rules.
  it('allows every tool but the project ones that change something', () => {
    expect(allowedToolRules()).toContain('mcp__dashboard__board_ship');
    expect(allowedToolRules()).toContain('mcp__dashboard__browser_screenshot');
    expect(allowedToolRules().filter((rule) => rule.includes('project_'))).toEqual(['mcp__dashboard__project_list', 'mcp__dashboard__project_find']);
  });
});
