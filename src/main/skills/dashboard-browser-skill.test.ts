import { describe, expect, it } from 'vitest';
import { SERVER_INSTRUCTIONS } from '../command/mcp-tools';
import { DASHBOARD_BROWSER_SKILL } from './dashboard-browser-skill';

describe('the dashboard-browser skill', () => {
  it('loads every browser tool by its full name in one ToolSearch call', () => {
    expect(DASHBOARD_BROWSER_SKILL).toMatch(/select:mcp__dashboard__browser_open,.*mcp__dashboard__browser_eval/);
  });

  it('names the browser mode key it and the server send a sign-in to', () => {
    expect(DASHBOARD_BROWSER_SKILL).toContain('(Ctrl+Shift+B by default)');
    expect(SERVER_INSTRUCTIONS).toContain('(Ctrl+Shift+B by default)');
  });
});
