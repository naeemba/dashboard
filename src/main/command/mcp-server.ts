import { failureLine } from './failure-line';
import { DASHBOARD_TOOLS, inputSchema, MCP_SERVER_NAME, SERVER_INSTRUCTIONS, toolNamed, type DashboardTool } from './mcp-tools';

// `dashboard mcp`: the command's verbs as tools, over MCP's stdio transport, one JSON-RPC message a
// line. Only what Claude Code asks of a tools server is answered: initialize, ping, tools/list and
// tools/call; a notification gets no answer, any other method an error.

export type ToolContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

export type ToolResult = { content: ToolContent[]; isError: boolean };

// What a tool call runs: the command with these words, its output and how it exited.
export type CommandRun = (commandArguments: string[]) => Promise<{ code: number; output: string }>;

type Message = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

// The version MCP first shipped tools in, answered when the client names none.
const FALLBACK_PROTOCOL = '2025-06-18';

const reply = (id: Message['id'], result: object) => ({ jsonrpc: '2.0', id, result });
const failure = (id: Message['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

// A call's answer: the command's output as text, a refusal or failure (any exit but 0) as a tool
// error in the command's own words, and a screenshot's printed path as the picture it names.
export async function callTool(
  chosen: DashboardTool, commandArguments: string[], run: CommandRun, readPicture: (file: string) => Promise<string>,
): Promise<ToolResult> {
  const { code, output } = await run(commandArguments);
  const text = output.trim() === '' ? 'done' : output.trim();
  if (code !== 0 || !chosen.image) return { content: [{ type: 'text', text }], isError: code !== 0 };
  return { content: [{ type: 'image', data: await readPicture(text), mimeType: 'image/png' }, { type: 'text', text }], isError: false };
}

export async function answer(
  message: Message, version: string, call: (chosen: DashboardTool, input: Record<string, unknown>) => Promise<ToolResult>,
): Promise<object | null> {
  if (typeof message.method !== 'string') return failure(message.id, -32600, 'not a request');
  // A notification has no id and wants no answer.
  if (message.id === undefined) return null;
  switch (message.method) {
    case 'initialize': {
      const asked = message.params?.protocolVersion;
      return reply(message.id, {
        protocolVersion: typeof asked === 'string' ? asked : FALLBACK_PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: { name: MCP_SERVER_NAME, version },
        instructions: SERVER_INSTRUCTIONS,
      });
    }
    case 'ping': return reply(message.id, {});
    case 'tools/list':
      return reply(message.id, {
        tools: DASHBOARD_TOOLS.map((each) => ({ name: each.name, description: each.description, inputSchema: inputSchema(each) })),
      });
    case 'tools/call': {
      const name = message.params?.name;
      const chosen = typeof name === 'string' ? toolNamed(name) : undefined;
      if (chosen === undefined) return failure(message.id, -32602, `no such tool: ${String(name)}`);
      const input = message.params?.arguments;
      // A call that throws, such as a screenshot whose file went missing, is still answered: an
      // unanswered one holds the session until it gives up on the server.
      try {
        return reply(message.id, await call(chosen, typeof input === 'object' && input !== null ? input as Record<string, unknown> : {}));
      } catch (error: unknown) {
        return reply(message.id, { content: [{ type: 'text', text: failureLine(error) }], isError: true });
      }
    }
    default: return failure(message.id, -32601, `no such method: ${message.method}`);
  }
}

// One line in, its answer out. A line that is not JSON is answered as JSON-RPC says, with a null id.
export async function answerLine(
  line: string, version: string, call: (chosen: DashboardTool, input: Record<string, unknown>) => Promise<ToolResult>,
): Promise<object | null> {
  if (line.trim() === '') return null;
  let message: unknown;
  try {
    message = JSON.parse(line);
  } catch {
    return failure(null, -32700, 'not JSON');
  }
  if (typeof message !== 'object' || message === null) return failure(null, -32600, 'not a request');
  return answer(message as Message, version, call);
}
