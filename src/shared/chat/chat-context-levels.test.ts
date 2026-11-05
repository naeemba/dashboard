import { describe, expect, it } from 'vitest';
import { contextBreakdown, LIST_CAP, type ContextUsageParts } from './chat-context';
import { contextLevel, largestTurns, nextStep, TURN_CAP, type Conversation } from './chat-context-levels';
import type { ChatEntry } from './chat-transcript';

const SIZE = 100_000;

const usage: ContextUsageParts = {
  maxTokens: SIZE,
  categories: [
    { id: 'system_prompt', name: 'System prompt', tokens: 4_000, color: 'x', kind: 'used' },
    { id: 'mcp_tools', name: 'MCP tools', tokens: 3_000, color: 'x', kind: 'used' },
    { id: 'skills', name: 'Skills', tokens: 500, color: 'x', kind: 'used' },
    { id: 'custom_agents', name: 'Custom agents', tokens: 300, color: 'x', kind: 'used' },
    { id: 'messages', name: 'Messages', tokens: 9_000, color: 'x', kind: 'used' },
  ],
  memoryFiles: Array.from({ length: LIST_CAP + 1 }, (_, index) => ({ path: `/m${index}.md`, type: 'Project', tokens: (index + 1) * 10 })),
  mcpTools: [
    { name: 'a1', serverName: 'alpha', tokens: 100 }, { name: 'a2', serverName: 'alpha', tokens: 300 },
    { name: 'b1', serverName: 'beta', tokens: 1_000 },
  ],
  agents: [{ agentType: 'reviewer', source: 'userSettings', tokens: 40 }, { agentType: 'explorer', source: 'plugin', tokens: 90 }],
};

const prompt = (text: string): ChatEntry => ({ kind: 'user', text, images: [] });
const said: ChatEntry = { kind: 'text', text: 'ok' };

// Three turns: the first adds 2k from its first read, the second 8k, the third follows a compaction.
const conversation: Conversation = {
  entries: [prompt('first\nmore'), said, prompt('second'), said, said, { kind: 'notice', text: 'Conversation compacted.' }, prompt('third'), said],
  readings: [
    { after: 2, input: 10_000, total: 12_000 },
    { after: 4, input: 13_000, total: 15_000 },
    { after: 5, input: 18_000, total: 20_000 },
    { after: 8, input: 5_000, total: 6_000 },
  ],
};

describe('largestTurns', () => {
  it('weighs each turn by what it added to the window, biggest first, and jumps to its prompt', () => {
    expect(largestTurns(conversation, SIZE).map((row) => [row.name, row.tokens, row.choice])).toEqual([
      ['second', 8_000, { kind: 'entry', index: 2 }],
      ['first', 2_000, { kind: 'entry', index: 0 }],
      ['third', 1_000, { kind: 'entry', index: 6 }],
    ]);
  });

  it('leaves out a turn with no usage and keeps the largest TURN_CAP', () => {
    const many = Array.from({ length: TURN_CAP + 2 }, (_, index) => [prompt(`p${index}`), said]).flat();
    const readings = Array.from({ length: TURN_CAP + 2 }, (_, index) => ({ after: index * 2 + 2, input: index * 1_000, total: index * 1_000 + 100 * (index + 1) }));
    expect(largestTurns({ entries: many, readings }, SIZE)).toHaveLength(TURN_CAP);
    expect(largestTurns({ entries: [prompt('alone')], readings: [] }, SIZE)).toEqual([]);
  });
});

describe('contextLevel', () => {
  const breakdown = contextBreakdown(usage);
  const top = contextLevel(breakdown, null, conversation, SIZE);
  const choices = (rows: { key: string; choice?: unknown }[]): [string, unknown][] => rows.map((row) => [row.key, row.choice]);

  it('opens a list from the categories that hold one, and only when it has rows', () => {
    expect(choices(top.sections[0].rows)).toEqual([
      ['system_prompt', undefined],
      ['mcp_tools', { kind: 'list', list: { kind: 'mcpServers' } }],
      // The skills row opens nothing: this CLI named none.
      ['skills', undefined],
      ['custom_agents', { kind: 'list', list: { kind: 'agents' } }],
      ['messages', { kind: 'list', list: { kind: 'turns' } }],
    ]);
  });

  it('opens a memory file in the viewer, the "more" row every file, and a tool its server', () => {
    const [, files, tools] = top.sections;
    expect(files.rows[0].choice).toEqual({ kind: 'file', path: `/m${LIST_CAP}.md` });
    expect(files.rows.at(-1)?.choice).toEqual({ kind: 'list', list: { kind: 'memoryFiles' } });
    expect(tools.rows[0].choice).toEqual({ kind: 'list', list: { kind: 'mcpTools', server: 'beta' } });
    const all = contextLevel(breakdown, { kind: 'memoryFiles' }, conversation, SIZE);
    expect(all.sections[0].rows).toHaveLength(LIST_CAP + 1);
  });

  it('lists the servers by what their tools hold, and a server its tools biggest first', () => {
    const servers = contextLevel(breakdown, { kind: 'mcpServers' }, conversation, SIZE).sections[0].rows;
    expect(servers.map((row) => [row.name, row.detail, row.tokens])).toEqual([['beta', '1 tool', 1_000], ['alpha', '2 tools', 400]]);
    const alpha = contextLevel(breakdown, { kind: 'mcpTools', server: 'alpha' }, conversation, SIZE);
    expect(alpha.title).toBe('MCP tools of alpha');
    expect(alpha.sections[0].rows.map((row) => row.name)).toEqual(['a2', 'a1']);
  });

  it('lists the custom agents by size, read only', () => {
    const agents = contextLevel(breakdown, { kind: 'agents' }, conversation, SIZE).sections[0].rows;
    expect(agents.map((row) => [row.name, row.detail, row.choice])).toEqual([['explorer', 'plugin', undefined], ['reviewer', 'userSettings', undefined]]);
  });
});

describe('nextStep', () => {
  const servers = { kind: 'mcpServers' } as const;
  const alpha = { kind: 'mcpTools', server: 'alpha' } as const;

  it('opens a list a level down and goes back one on Escape, onto the row that opened it', () => {
    const opened = { list: servers, from: 'mcp_tools' };
    expect(nextStep([opened], { kind: 'list', list: alpha }, 'server:alpha')).toEqual({ trail: [opened, { list: alpha, from: 'server:alpha' }] });
    expect(nextStep([opened, { list: alpha, from: 'server:alpha' }], { kind: 'back' })).toEqual({ trail: [opened], start: 'server:alpha' });
  });

  it('leaves the levels for a turn, and comes back to the same level and row after a file', () => {
    const files = { list: { kind: 'memoryFiles' }, from: 'memory_files' } as const;
    expect(nextStep([], { kind: 'entry', index: 4 }, 'turn:4')).toEqual({ jump: 4 });
    expect(nextStep([files], { kind: 'file', path: '/m.md' }, '/m.md')).toEqual({ read: '/m.md', trail: [files], start: '/m.md' });
  });
});
