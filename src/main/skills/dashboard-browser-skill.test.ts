import { describe, expect, it } from 'vitest';
import { DASHBOARD_TOOLS, SERVER_INSTRUCTIONS, toolNamed } from '../command/mcp-tools';
import { DASHBOARD_BROWSER_SKILL } from './dashboard-browser-skill';

const toolNames = (text: string): string[] => [...text.matchAll(/\bbrowser_[a-z]+/g)].map((match) => match[0]);
const parametersOf = (name: string): string[] =>
  toolNamed(name)?.parameters.map((parameter) => parameter.name) ?? [];

describe('the dashboard-browser skill', () => {
  it('loads every browser tool by its full name in one ToolSearch call', () => {
    expect(DASHBOARD_BROWSER_SKILL).toMatch(/select:mcp__dashboard__browser_open,.*mcp__dashboard__browser_eval/);
  });

  it('names only tools the server has, in the skill and the server instructions', () => {
    const known = DASHBOARD_TOOLS.map((each) => each.name);
    for (const name of toolNames(DASHBOARD_BROWSER_SKILL + SERVER_INSTRUCTIONS)) expect(known).toContain(name);
  });

  // A step's backticked words that are not tool names, such as `max-tokens`, are parameters of a
  // tool the same step names.
  it('names only parameters of the tools each step names', () => {
    const steps = DASHBOARD_BROWSER_SKILL.split('## The steps')[1].split('\n## ')[0].split(/^\d+\. /m).slice(1);
    for (const step of steps) {
      const parameters = toolNames(step).flatMap(parametersOf);
      const words = [...step.matchAll(/`([a-z][a-z-]*)`/g)].map((match) => match[1]).filter((each) => !each.startsWith('browser_'));
      for (const each of words) expect(parameters).toContain(each);
    }
  });

  it('names the browser mode key it and the server send a sign-in to', () => {
    expect(DASHBOARD_BROWSER_SKILL).toContain('(Ctrl+Shift+B by default)');
    expect(SERVER_INSTRUCTIONS).toContain('(Ctrl+Shift+B by default)');
  });
});
