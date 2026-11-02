import { describe, expect, it } from 'vitest';
import { contextBreakdown, LIST_CAP, type ContextUsageParts } from './chat-context';

const usage: ContextUsageParts = {
  maxTokens: 200_000,
  categories: [
    { id: 'system_prompt', name: 'System prompt', tokens: 4_000, color: 'promptBorder', kind: 'used' },
    { id: 'mcp_tools_deferred', name: 'MCP tools (deferred)', tokens: 9_000, color: 'inactive', kind: 'deferred' },
    { id: 'custom_agents', name: 'Custom agents', tokens: 0, color: 'permission', kind: 'used' },
    { name: 'Something new', tokens: 2_000, color: 'warning', kind: 'used' },
    { id: 'free_space', name: 'Free space', tokens: 150_000, color: 'promptBorder', kind: 'free' },
  ],
  memoryFiles: [{ path: '/a/CLAUDE.md', type: 'Project', tokens: 1_000 }, { path: '/b/CLAUDE.md', type: 'User', tokens: 3_000 }],
  mcpTools: Array.from({ length: LIST_CAP + 2 }, (_, index) => ({ name: `tool${index}`, serverName: 'server', tokens: (index + 1) * 100 }))
    .concat({ name: 'unloaded', serverName: 'server', tokens: 50_000, isLoaded: false } as never),
};

describe('contextBreakdown', () => {
  const breakdown = contextBreakdown(usage);

  it('keeps the session order, leaves out deferred and empty rows on kind and tokens, and colours by id', () => {
    expect(breakdown.categories.map((row) => [row.key, row.percentage, row.tone])).toEqual([
      ['system_prompt', 2, 'blue'],
      ['Something new', 1, null],
      ['free_space', 75, null],
    ]);
  });

  it('lists the memory files biggest first', () => {
    expect(breakdown.memoryFiles.map((row) => row.name)).toEqual(['/b/CLAUDE.md', '/a/CLAUDE.md']);
  });

  it('caps the tools biggest first, folds the rest into one row, and leaves out a tool not loaded', () => {
    const rows = breakdown.mcpTools;
    expect(rows).toHaveLength(LIST_CAP + 1);
    expect(rows[0]).toMatchObject({ name: `tool${LIST_CAP + 1}`, detail: 'server' });
    expect(rows.at(-1)).toMatchObject({ key: 'more:mcpTools', name: '2 more', tokens: 300, percentage: 0.15 });
  });

  it('keys every row of every list apart, so the popup keeps its highlight on the right one', () => {
    const files = Array.from({ length: LIST_CAP + 2 }, (_, index) => ({ path: `/f${index}.md`, type: 'Project', tokens: 10 }));
    const both = contextBreakdown({ ...usage, memoryFiles: files });
    const keys = [...both.categories, ...both.memoryFiles, ...both.mcpTools].map((row) => row.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
