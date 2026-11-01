import type { McpServerStatus, Query } from '@anthropic-ai/claude-agent-sdk';
import { fuzzyScore, ranked } from '../app/fuzzy';
import type { SearchRow } from '../../renderer/app/overlay';

// /mcp on the Claude screen, as Claude Code's dialog: the session's MCP servers with how each one
// stands, and the one picked reconnected, disabled or enabled. The session answers /mcp sent as a
// prompt with a one-line count, so the list is mcpServerStatus() and the actions its two calls.

export type McpServer = Pick<McpServerStatus, 'name' | 'status' | 'error'> & { tools: number };

export type McpAction = 'reconnect' | 'disable' | 'enable';

const STATUS: Record<McpServerStatus['status'], string> = {
  connected: 'connected',
  failed: 'failed',
  'needs-auth': 'needs sign-in',
  pending: 'connecting',
  disabled: 'disabled',
};

// What main hands the screen: a server's name, how it stands and what it said when it failed, and
// how many tools it gives, not the tools themselves.
export function mcpServers(statuses: McpServerStatus[]): McpServer[] {
  return statuses.map(({ name, status, error, tools }) => ({ name, status, error, tools: tools?.length ?? 0 }));
}

// The servers /mcp lists, in the session's order, or the ones matching what is typed, best first.
export function mcpRows(servers: McpServer[], query: string): SearchRow<McpServer>[] {
  return ranked(servers, (server) => server.name, query)
    .map((server) => ({ name: server.name, detail: serverDetail(server), choice: server }));
}

function serverDetail(server: McpServer): string {
  if (server.status === 'connected') return `connected · ${server.tools} ${server.tools === 1 ? 'tool' : 'tools'}`;
  return server.error ? `${STATUS[server.status]}: ${server.error}` : STATUS[server.status];
}

// What can be done to the server picked: a disabled one can only be enabled; any other can be
// reconnected or disabled.
export function mcpActions(server: McpServer, query: string): SearchRow<McpAction>[] {
  const rows: SearchRow<McpAction>[] = server.status === 'disabled'
    ? [{ name: 'Enable', detail: `Turn ${server.name} back on and connect to it`, choice: 'enable' }]
    : [
      { name: 'Reconnect', detail: `Drop the connection to ${server.name} and open it again`, choice: 'reconnect' },
      { name: 'Disable', detail: `Turn ${server.name} off; its tools leave the session`, choice: 'disable' },
    ];
  return rows.filter((row) => fuzzyScore(row.name, query) !== null);
}

// What the screen says once the action is done.
export function mcpNotice(server: McpServer, action: McpAction): string {
  const done: Record<McpAction, string> = { reconnect: 'reconnected', disable: 'disabled', enable: 'enabled' };
  return `MCP server ${server.name} ${done[action]}.`;
}

// Which of the session's two calls an action is: reconnect, or toggle with enable meaning on.
export function changeMcpServer(
  query: Pick<Query, 'reconnectMcpServer' | 'toggleMcpServer'>, name: string, action: McpAction,
): Promise<void> {
  return action === 'reconnect' ? query.reconnectMcpServer(name) : query.toggleMcpServer(name, action === 'enable');
}
