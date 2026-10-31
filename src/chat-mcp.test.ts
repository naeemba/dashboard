import { describe, expect, it } from 'vitest';
import { changeMcpServer, mcpActions, mcpNotice, mcpRows, mcpServers, type McpServer } from './chat-mcp';

const server = (name: string, extra: Partial<McpServer> = {}): McpServer => ({ name, status: 'connected', tools: 0, ...extra });

describe('mcpServers', () => {
  it('keeps the name, status and error, and counts the tools', () => {
    expect(mcpServers([
      { name: 'codegraph', status: 'connected', tools: [{ name: 'explore' }, { name: 'search' }], scope: 'user' },
      { name: 'figma', status: 'failed', error: 'timed out' },
    ])).toEqual([
      { name: 'codegraph', status: 'connected', error: undefined, tools: 2 },
      { name: 'figma', status: 'failed', error: 'timed out', tools: 0 },
    ]);
  });
});

describe('mcpRows', () => {
  it('says how each server stands, in the session order', () => {
    const rows = mcpRows([
      server('codegraph', { tools: 1 }),
      server('figma', { status: 'failed', error: 'timed out' }),
      server('docs', { status: 'needs-auth' }),
      server('playwright', { status: 'pending' }),
      server('github', { tools: 2 }),
    ], '');
    expect(rows.map((row) => [row.name, row.detail])).toEqual([
      ['codegraph', 'connected · 1 tool'],
      ['figma', 'failed: timed out'],
      ['docs', 'needs sign-in'],
      ['playwright', 'connecting'],
      ['github', 'connected · 2 tools'],
    ]);
  });

  it('keeps only the servers matching what is typed', () => {
    expect(mcpRows([server('codegraph'), server('figma')], 'fig').map((row) => row.name)).toEqual(['figma']);
  });
});

describe('mcpActions', () => {
  it('offers reconnect and disable for a server that is on', () => {
    expect(mcpActions(server('figma', { status: 'failed' }), '').map((row) => row.choice)).toEqual(['reconnect', 'disable']);
  });

  it('offers only enable for a disabled server', () => {
    expect(mcpActions(server('figma', { status: 'disabled' }), '').map((row) => row.choice)).toEqual(['enable']);
  });

  it('filters by what is typed', () => {
    expect(mcpActions(server('figma'), 'dis').map((row) => row.choice)).toEqual(['disable']);
  });
});

describe('mcpNotice', () => {
  it('names the server and what was done', () => {
    expect(mcpNotice(server('figma'), 'reconnect')).toBe('MCP server figma reconnected.');
    expect(mcpNotice(server('figma'), 'enable')).toBe('MCP server figma enabled.');
  });
});

describe('changeMcpServer', () => {
  const calls: unknown[][] = [];
  const query = {
    reconnectMcpServer: async (name: string) => { calls.push(['reconnect', name]); },
    toggleMcpServer: async (name: string, enabled: boolean) => { calls.push(['toggle', name, enabled]); },
  };

  it('reconnects, disables or enables through the matching call', async () => {
    await changeMcpServer(query, 'figma', 'reconnect');
    await changeMcpServer(query, 'figma', 'disable');
    await changeMcpServer(query, 'figma', 'enable');
    expect(calls).toEqual([['reconnect', 'figma'], ['toggle', 'figma', false], ['toggle', 'figma', true]]);
  });
});
