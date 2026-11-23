import { describe, expect, it } from 'vitest';
import { answerLine, callTool, type ToolResult } from './mcp-server';
import { DASHBOARD_TOOLS, toolNamed } from './mcp-tools';

const never = (): Promise<ToolResult> => { throw new Error('not called'); };
const line = (message: object) => JSON.stringify(message);

describe('answerLine', () => {
  it('answers initialize in the protocol version asked, with the tools capability', async () => {
    expect(await answerLine(line({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } }), '2.53.0+abc', never))
      .toMatchObject({ id: 1, result: { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'dashboard', version: '2.53.0+abc' } } });
  });

  it('lists every tool with its schema', async () => {
    const answer = await answerLine(line({ jsonrpc: '2.0', id: 2, method: 'tools/list' }), 'v', never) as { result: { tools: { name: string; inputSchema: object }[] } };
    expect(answer.result.tools.map((each) => each.name)).toEqual(DASHBOARD_TOOLS.map((each) => each.name));
    expect(answer.result.tools[0].inputSchema).toMatchObject({ type: 'object' });
  });

  it('calls the tool named with its arguments', async () => {
    const seen: unknown[] = [];
    const answer = await answerLine(line({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'board_show', arguments: { id: 'ab' } } }), 'v',
      async (chosen, input) => { seen.push(chosen.name, input); return { content: [{ type: 'text', text: 'card' }], isError: false }; });
    expect(seen).toEqual(['board_show', { id: 'ab' }]);
    expect(answer).toEqual({ jsonrpc: '2.0', id: 3, result: { content: [{ type: 'text', text: 'card' }], isError: false } });
  });

  // An unanswered call holds the session until it gives up on the server.
  it('answers a call that throws as a tool error', async () => {
    const answer = await answerLine(line({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'version' } }), 'v',
      () => Promise.reject(Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' })));
    expect(answer).toMatchObject({ id: 4, result: { isError: true, content: [{ type: 'text', text: 'ENOENT: no such file' }] } });
  });

  it('refuses an unknown tool or method, and leaves a notification and a blank line unanswered', async () => {
    expect(await answerLine(line({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'nope' } }), 'v', never))
      .toMatchObject({ id: 5, error: { code: -32602 } });
    expect(await answerLine(line({ jsonrpc: '2.0', id: 6, method: 'resources/list' }), 'v', never)).toMatchObject({ id: 6, error: { code: -32601 } });
    expect(await answerLine(line({ jsonrpc: '2.0', method: 'notifications/initialized' }), 'v', never)).toBeNull();
    expect(await answerLine('', 'v', never)).toBeNull();
    expect(await answerLine('{not json', 'v', never)).toMatchObject({ id: null, error: { code: -32700 } });
  });
});

describe('callTool', () => {
  const tool = (name: string) => toolNamed(name) ?? DASHBOARD_TOOLS[0];
  const unread = () => Promise.reject(new Error('not read'));

  it('answers with the command\'s output, and a refusal as an error in its own words', async () => {
    expect(await callTool(tool('board_show'), [], async () => ({ code: 0, output: 'a card\n' }), unread))
      .toEqual({ content: [{ type: 'text', text: 'a card' }], isError: false });
    expect(await callTool(tool('board_show'), [], async () => ({ code: 1, output: 'no card begins with zz\n' }), unread))
      .toEqual({ content: [{ type: 'text', text: 'no card begins with zz' }], isError: true });
    expect(await callTool(tool('pane_release'), [], async () => ({ code: 0, output: '' }), unread))
      .toEqual({ content: [{ type: 'text', text: 'done' }], isError: false });
  });

  it('answers a screenshot with the picture its printed path names', async () => {
    const read: string[] = [];
    const answer = await callTool(tool('browser_screenshot'), [], async () => ({ code: 0, output: '/shots/tab-1.png\n' }),
      async (file) => { read.push(file); return 'BASE64'; });
    expect(read).toEqual(['/shots/tab-1.png']);
    expect(answer.content).toEqual([{ type: 'image', data: 'BASE64', mimeType: 'image/png' }, { type: 'text', text: '/shots/tab-1.png' }]);
  });

  it('answers a refused screenshot with its reason, never reading the reason as a file', async () => {
    expect(await callTool(tool('browser_screenshot'), [],
      async () => ({ code: 1, output: 'tab 4 drew nothing to take a picture of\n' }), unread))
      .toEqual({ content: [{ type: 'text', text: 'tab 4 drew nothing to take a picture of' }], isError: true });
  });
});
