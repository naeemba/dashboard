import type { DashboardBridge } from './bridge';
import { mcpActions, mcpNotice, mcpRows } from './chat-mcp';
import type { ChatViewOptions } from './chat-view';
import { failureText } from './failure';
import { searchOverlay } from './overlay';

// /mcp's two sheets: the session's MCP servers with how each stands, then what to do to the one picked.
export async function manageMcp(
  bridge: DashboardBridge, slot: number, say: Pick<ChatViewOptions, 'onError' | 'onNotice'>,
): Promise<void> {
  try {
    const servers = await bridge.chatMcpServers(slot);
    if (servers.length === 0) {
      say.onNotice('This session has no MCP servers.');
      return;
    }
    const server = await searchOverlay({
      name: 'chat-mcp', placeholder: 'Search MCP servers', rows: (query) => mcpRows(servers, query),
      empty: 'No server matches.', glyph: () => 'claude',
    });
    if (server === undefined) return;
    const action = await searchOverlay({
      name: 'chat-mcp', placeholder: server.name, rows: (query) => mcpActions(server, query),
      empty: 'Nothing to do matches.', glyph: () => 'claude',
    });
    if (action === undefined) return;
    await bridge.chatChangeMcpServer(slot, server.name, action);
    say.onNotice(mcpNotice(server, action));
  } catch (error) {
    say.onError(`MCP: ${failureText(error)}`);
  }
}
