import { biggestFirst, type BreakdownRow, type ContextBreakdown } from './chat-context';
import type { ChatEntry, Reading } from './chat-transcript';

// What is behind each row of the Claude screen's context popup. The popup opens on the session's
// categories, its biggest memory files and MCP tools; Enter on a row opens what it holds, a level down:
// a memory file in the doc viewer, the MCP tools row the servers and a server its tools, the skills and
// custom agents rows their lists, the messages row the conversation's largest turns, where Enter jumps
// to that turn's prompt. Escape goes back a level. A row with nothing behind it is only read.

export type ContextList =
  | { kind: 'memoryFiles' } | { kind: 'mcpServers' } | { kind: 'mcpTools'; server: string }
  | { kind: 'skills' } | { kind: 'agents' } | { kind: 'turns' };

export type ContextChoice = { kind: 'list'; list: ContextList } | { kind: 'file'; path: string } | { kind: 'entry'; index: number };

export type LevelRow = BreakdownRow & { choice?: ContextChoice };
export type LevelSection = { title: string | null; rows: LevelRow[] };
// `title` names the level for the popup's heading; null is the top, which the measure's own line heads.
export type ContextLevel = { title: string | null; sections: LevelSection[] };

// What the screen holds of the conversation: its entries and what each of Claude's messages read.
export type Conversation = { entries: readonly ChatEntry[]; readings: readonly Reading[] };

// How many of the largest turns the messages row lists.
export const TURN_CAP = 10;

// The category rows that open a list, by the session's stable id.
const CATEGORY_LISTS: Record<string, ContextList> = {
  memory_files: { kind: 'memoryFiles' }, mcp_tools: { kind: 'mcpServers' },
  skills: { kind: 'skills' }, custom_agents: { kind: 'agents' }, messages: { kind: 'turns' },
};

const share = (tokens: number, size: number): number => (size > 0 ? (tokens / size) * 100 : 0);

// Where a turn starts: a prompt, a command run with `!`, or a message that opens a turn as one does.
function startsTurn(entry: ChatEntry): boolean {
  return entry.kind === 'user' || (entry.kind === 'event' && entry.startsTurn === true);
}

function turnName(entry: ChatEntry): string {
  const said = entry.kind === 'user' ? entry.text : entry.kind === 'event' ? entry.title : '';
  return said.trim().split('\n')[0] || '(an image)';
}

// Each turn's weight is what it added to the window: the last total its messages read and wrote, less
// where the window stood before it, the previous turn's last total. After a compaction the window
// shrank, so the turn is counted from what its own first message read instead. A turn none of whose
// messages carried a usage, or one that added nothing, is left out.
export function largestTurns(conversation: Conversation, size: number): LevelRow[] {
  const starts = conversation.entries.flatMap((entry, index) => (startsTurn(entry) ? [index] : []));
  let before: number | null = null;
  const rows = starts.flatMap((start, at): LevelRow[] => {
    const end = starts[at + 1] ?? Infinity;
    const own = conversation.readings.filter((reading) => reading.after > start && reading.after <= end);
    if (own.length === 0) return [];
    const baseline = Math.min(before ?? own[0].input, own[0].input);
    const last = own[own.length - 1].total;
    before = last;
    const tokens = last - baseline;
    if (tokens <= 0) return [];
    const name = turnName(conversation.entries[start]);
    return [{ key: `turn:${start}`, name, detail: null, tokens, percentage: share(tokens, size), tone: 'brightBlue', choice: { kind: 'entry', index: start } }];
  });
  return biggestFirst(rows).slice(0, TURN_CAP);
}

function servers(tools: BreakdownRow[], size: number): LevelRow[] {
  const byServer = Map.groupBy(tools, (tool) => tool.detail ?? '');
  return biggestFirst([...byServer].map(([server, own]) => {
    const tokens = own.reduce((sum, tool) => sum + tool.tokens, 0);
    const detail = own.length === 1 ? '1 tool' : `${own.length} tools`;
    return { key: `server:${server}`, name: server, detail, tokens, percentage: share(tokens, size), tone: own[0].tone, choice: { kind: 'list', list: { kind: 'mcpTools', server } } };
  }));
}

// The rows a list holds, with what each opens in turn.
function listRows(list: ContextList, breakdown: ContextBreakdown, conversation: Conversation, size: number): LevelRow[] {
  const { all } = breakdown;
  switch (list.kind) {
    case 'memoryFiles': return all.memoryFiles.map((row) => ({ ...row, choice: { kind: 'file', path: row.key } }));
    case 'mcpServers': return servers(all.mcpTools, size);
    case 'mcpTools': return all.mcpTools.filter((row) => row.detail === list.server).map((row) => ({ ...row, detail: null }));
    case 'skills': return all.skills;
    case 'agents': return all.agents;
    case 'turns': return largestTurns(conversation, size);
  }
}

const LIST_TITLES: Record<ContextList['kind'], string> = {
  memoryFiles: 'Memory files', mcpServers: 'MCP servers', mcpTools: 'MCP tools', skills: 'Skills', agents: 'Custom agents', turns: 'Largest turns',
};

function listTitle(list: ContextList): string {
  return list.kind === 'mcpTools' ? `${LIST_TITLES.mcpTools} of ${list.server}` : LIST_TITLES[list.kind];
}

// A row that would open an empty list opens nothing: an older CLI that names no skills, or a
// conversation this screen holds no usage for.
function opening(row: BreakdownRow, list: ContextList | undefined, breakdown: ContextBreakdown, conversation: Conversation, size: number): LevelRow {
  return list && listRows(list, breakdown, conversation, size).length > 0 ? { ...row, choice: { kind: 'list', list } } : row;
}

// The level `list` opens, or the top with none.
export function contextLevel(breakdown: ContextBreakdown, list: ContextList | null, conversation: Conversation, size: number): ContextLevel {
  if (list !== null) return { title: listTitle(list), sections: [{ title: null, rows: listRows(list, breakdown, conversation, size) }] };
  const open = (row: BreakdownRow, list: ContextList | undefined): LevelRow => opening(row, list, breakdown, conversation, size);
  const sections: LevelSection[] = [
    { title: null, rows: breakdown.categories.map((row) => open(row, CATEGORY_LISTS[row.key])) },
    {
      title: 'Memory files',
      rows: breakdown.memoryFiles.map((row) => (row.key.startsWith('more:') ? open(row, { kind: 'memoryFiles' }) : { ...row, choice: { kind: 'file', path: row.key } })),
    },
    {
      title: 'MCP tools',
      rows: breakdown.mcpTools.map((row) => open(row, row.key.startsWith('more:') ? { kind: 'mcpServers' } : { kind: 'mcpTools', server: row.detail ?? '' })),
    },
  ];
  return { title: null, sections: sections.filter((section) => section.rows.length > 0) };
}
