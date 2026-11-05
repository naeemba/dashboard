import { biggestFirst, breakdownRow, moreKey, toneOf, type BreakdownRow, type ContextBreakdown } from './chat-context';
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
  const { entries, readings } = conversation;
  const starts = entries.flatMap((entry, index) => (startsTurn(entry) ? [index] : []));
  const rows: LevelRow[] = [];
  let before: number | null = null;
  // Readings are in entry order, so one walk hands each turn its own.
  let next = 0;
  for (const [at, start] of starts.entries()) {
    const end = starts[at + 1] ?? Infinity;
    while (next < readings.length && readings[next].after <= start) next++;
    const first = readings[next];
    let last: Reading | undefined;
    while (next < readings.length && readings[next].after <= end) last = readings[next++];
    if (last === undefined) continue;
    const tokens = last.total - Math.min(before ?? first.input, first.input);
    before = last.total;
    if (tokens <= 0) continue;
    const row = breakdownRow(`turn:${start}`, turnName(entries[start]), null, tokens, size, toneOf('messages'));
    rows.push({ ...row, choice: { kind: 'entry', index: start } });
  }
  return biggestFirst(rows).slice(0, TURN_CAP);
}

const fileRow = (row: BreakdownRow): LevelRow => ({ ...row, choice: { kind: 'file', path: row.key } });

function servers(tools: BreakdownRow[], size: number): LevelRow[] {
  const byServer = Map.groupBy(tools, (tool) => tool.detail ?? '');
  return biggestFirst([...byServer].map(([server, own]) => {
    const tokens = own.reduce((sum, tool) => sum + tool.tokens, 0);
    const detail = own.length === 1 ? '1 tool' : `${own.length} tools`;
    const row = breakdownRow(`server:${server}`, server, detail, tokens, size, own[0].tone);
    return { ...row, choice: { kind: 'list', list: { kind: 'mcpTools', server } } };
  }));
}

// The rows a list holds, with what each opens in turn.
function listRows(list: ContextList, breakdown: ContextBreakdown, conversation: Conversation, size: number): LevelRow[] {
  const { all } = breakdown;
  switch (list.kind) {
    case 'memoryFiles': return all.memoryFiles.map(fileRow);
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

// The heading's name for the level `list` opens; null is the top.
export function levelTitle(list: ContextList | null): string | null {
  if (list === null) return null;
  return list.kind === 'mcpTools' ? `${LIST_TITLES.mcpTools} of ${list.server}` : LIST_TITLES[list.kind];
}

// Whether a list has a row, read off what the breakdown already counted where it can: an older CLI
// names no skills, and a conversation this screen holds no usage for has no turns.
function holdsRows(list: ContextList, breakdown: ContextBreakdown, conversation: Conversation, size: number): boolean {
  switch (list.kind) {
    case 'memoryFiles': return breakdown.all.memoryFiles.length > 0;
    case 'mcpServers': return breakdown.all.mcpTools.length > 0;
    case 'skills': return breakdown.all.skills.length > 0;
    case 'agents': return breakdown.all.agents.length > 0;
    default: return listRows(list, breakdown, conversation, size).length > 0;
  }
}

// The level `list` opens, or the top with none. A row that would open an empty list opens nothing.
export function contextLevel(breakdown: ContextBreakdown, list: ContextList | null, conversation: Conversation, size: number): ContextLevel {
  if (list !== null) return { title: levelTitle(list), sections: [{ title: null, rows: listRows(list, breakdown, conversation, size) }] };
  const open = (row: BreakdownRow, opened: ContextList | undefined): LevelRow =>
    (opened && holdsRows(opened, breakdown, conversation, size) ? { ...row, choice: { kind: 'list', list: opened } } : row);
  const sections: LevelSection[] = [
    { title: null, rows: breakdown.categories.map((row) => open(row, CATEGORY_LISTS[row.key])) },
    { title: 'Memory files', rows: breakdown.memoryFiles.map((row) => (row.key === moreKey('memoryFiles') ? open(row, { kind: 'memoryFiles' }) : fileRow(row))) },
    {
      title: 'MCP tools',
      rows: breakdown.mcpTools.map((row) => open(row, row.key === moreKey('mcpTools') ? { kind: 'mcpServers' } : { kind: 'mcpTools', server: row.detail ?? '' })),
    },
  ];
  return { title: null, sections: sections.filter((section) => section.rows.length > 0) };
}

// Where the popup goes once a row is picked: a list a level down, back one level, or out of the levels
// to jump to an entry or read a file, after which the reading comes back to the same level. Each level
// opened keeps the key of the row that opened it, and `start` is the row a level opens on, so going
// back, or putting a file away, lands on the row that was picked rather than the first.
export type Picked = ContextChoice | { kind: 'back' };
export type Opened = { list: ContextList; from: string };
export type Step = { trail: Opened[]; start?: string } | { jump: number } | { read: string; trail: Opened[]; start: string };

export function nextStep(trail: readonly Opened[], picked: Picked, key = ''): Step {
  switch (picked.kind) {
    case 'back': return { trail: trail.slice(0, -1), start: trail.at(-1)?.from };
    case 'list': return { trail: [...trail, { list: picked.list, from: key }] };
    case 'entry': return { jump: picked.index };
    case 'file': return { read: picked.path, trail: [...trail], start: key };
  }
}
