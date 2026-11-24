import { PRIORITIES } from '../../shared/board/board';

// The `dashboard` command's verbs as MCP tools, served by `dashboard mcp` (mcp-server.ts). A tool is
// the command's words and its typed parameters turned back into them: a call runs the same program
// the command line runs, so every parser, refusal and action stays where it is (command-decision-8).
//
// A new verb is a row here as well as in its noun's usage, or a line in COMMAND_ONLY saying why it
// has no tool; mcp-tools.test.ts reads every usage and fails on a verb that is in neither.

type ParameterType = 'string' | 'number' | 'boolean' | 'strings';

// A positional parameter is a word after the verb, in the order listed; a flag is `--<name>`, a
// boolean one a switch, `strings` the flag given once for each item.
export type ToolParameter = {
  name: string;
  type: ParameterType;
  description: string;
  flag: boolean;
  required: boolean;
  values?: readonly string[];
};

export type DashboardTool = {
  name: string;
  words: readonly string[];
  description: string;
  parameters: readonly ToolParameter[];
  // Run without asking, as the command's own Bash rule is (appSessionSettings in workers/dispatch.ts).
  allowed: boolean;
  // Prints a PNG's path, which the tool answers with the picture itself.
  image?: boolean;
};

const word = (name: string, description: string, type: ParameterType = 'string'): ToolParameter =>
  ({ name, type, description, flag: false, required: true });
const optionalWord = (name: string, description: string): ToolParameter =>
  ({ name, type: 'string', description, flag: false, required: false });
const flag = (name: string, description: string, type: ParameterType = 'string', values?: readonly string[]): ToolParameter =>
  ({ name, type, description, flag: true, required: false, values });

const PROJECT = flag('project', 'a project name or aka from ~/.dashboard/projects.yaml');
const CARD = word('id', 'card id, or any start of it only one card has');
const PANE = word('id', 'pane id <page>:<pane>, as pane_claim prints it');
const TAB = word('tab', 'tab id, as browser_open or browser_tabs prints it', 'number');
const REF = word('ref', 'a ref from browser_snapshot, such as e3');
const PRIORITY = flag('priority', 'priority', 'string', PRIORITIES);
const NOTES = flag('notes', 'replaces the description');

const tool = (
  words: string, description: string, parameters: ToolParameter[], allowed = true, image = false,
): DashboardTool => ({ name: words.replace(' ', '_'), words: words.split(' '), description, parameters, allowed, image });

export const DASHBOARD_TOOLS: readonly DashboardTool[] = [
  tool('board list', 'Cards on the board, Done and Cancelled left out unless all or column names them', [
    flag('all', 'every column', 'boolean'), flag('column', 'only this column'), PROJECT]),
  tool('board show', 'One card: description, subtasks, trail', [CARD, PROJECT]),
  tool('board add', 'Add a card; prints its id', [
    word('title', 'title'), flag('column', 'column, Backlog when left out'), PRIORITY, NOTES, PROJECT]),
  tool('board move', 'Move a card; into Ship ships it, into Review starts its review, Cancelled for one not to be done', [
    CARD, word('column', 'column name'), PROJECT]),
  tool('board ship', 'Ship a card to an agent in its own worktree; answers once packages are installed, minutes', [CARD, PROJECT]),
  tool('board review', 'Start a card\'s review loop', [CARD, PROJECT]),
  tool('board set', 'Change a card\'s fields; an empty branch or pull-request clears it', [
    CARD, flag('branch', 'branch'), flag('pull-request', 'pull request number'), PRIORITY, NOTES, PROJECT]),
  tool('board comment', 'Append to a card\'s trail; the way to record what you found', [CARD, word('text', 'the comment'), PROJECT]),

  tool('pane claim', 'Open a worker pane; prints its id', [flag('project', 'open it on that project\'s page, opening the project')]),
  tool('pane run', 'Start Claude in a claimed pane with the prompt; worktree and card answer once packages are installed', [
    PANE, word('prompt', 'the task'), flag('card', 'run in the worktree this card was shipped into'),
    flag('worktree', 'run in a throwaway worktree', 'boolean'), flag('in', 'run in this existing folder'),
    flag('terminal', 'Claude Code in the pane\'s terminal rather than a screen', 'boolean'),
    flag('screen', 'a Claude screen, where the terminal is the default', 'boolean')]),
  tool('pane list', 'Every pane and whether its worker is running, blocked or done', [
    flag('all', 'every open project', 'boolean'), flag('reports', 'with the end of each last message', 'boolean')]),
  tool('pane send', 'Type text into a pane and press Enter, or hand it to a screen as its next prompt', [PANE, word('text', 'the text')]),
  tool('pane report', 'A worker\'s line from pane_list and its last message', [PANE]),
  tool('pane release', 'Close a worker\'s pane now', [PANE]),
  tool('pane finish', 'Release a worker whose card is Done or Cancelled or whose branch merged; refused otherwise', [PANE]),

  tool('project list', 'Every project in ~/.dashboard/projects.yaml, open ones marked', []),
  tool('project find', 'Projects whose name, aka or about match the word', [word('word', 'what to look for')]),
  tool('project add', 'List a folder as a project', [
    word('path', 'the folder'), flag('name', 'name'), flag('aka', 'other names, comma separated'),
    flag('site', 'url'), flag('about', 'one line')], false),
  tool('project set', 'Change a project; aka adds names, deploy adds or changes one by name, site and about replace', [
    word('name', 'name or aka'), flag('aka', 'names to add, comma separated'), flag('site', 'url'), flag('about', 'one line'),
    flag('deploy', 'name=<n>,role=<r>,address=<a>, one per deploy', 'strings'),
    flag('clear', 'aka, site, about or deploy', 'strings')], false),
  tool('project open', 'Open a project in the app with its main session', [word('name', 'name or aka')], false),
  tool('project close', 'Close a project; refused while any of its panes runs something', [word('name', 'name or aka')], false),
  tool('project focus', 'Bring the app to the front on a project\'s page', [word('name', 'name or aka')], false),

  tool('budget', 'The 7-day usage against the cap; an error at or over it, or when the reading is stale', []),
  { name: 'version', words: ['--version'], description: 'The installed Dashboard build, version+commit', parameters: [], allowed: true },

  tool('browser open', 'Open a tab you hold in the project\'s browser; prints its id', [word('url', 'address'), PROJECT]),
  tool('browser tabs', 'Every tab: id, who holds it, address, title', [PROJECT]),
  tool('browser claim', 'Hold a tab the user opened', [TAB]),
  tool('browser release', 'Hand a tab back to the user', [TAB]),
  tool('browser go', 'Load an address in a tab', [TAB, word('url', 'address')]),
  tool('browser back', 'Go back in a tab', [TAB]),
  tool('browser forward', 'Go forward in a tab', [TAB]),
  tool('browser reload', 'Reload a tab', [TAB]),
  tool('browser resize', 'Lay the page out at a size', [TAB, word('size', '<width>x<height>, such as 390x844 for a phone')]),
  tool('browser reset', 'Lay the page out at the view\'s own size again', [TAB]),
  tool('browser read', 'The page\'s main content as markdown, with its token estimate', [
    TAB, flag('max-tokens', 'cut at this many', 'number'), flag('selector', 'read only this CSS selector')]),
  tool('browser screenshot', 'A picture of the page', [
    TAB, flag('full', 'the whole page, not only the view', 'boolean'), flag('element', 'only this CSS selector')], true, true),
  tool('browser snapshot', 'What can be clicked or typed in, each with a ref', [TAB]),
  tool('browser click', 'Click a ref', [TAB, REF]),
  tool('browser type', 'Type at the end of what a field holds', [TAB, REF, word('text', 'what to type')]),
  tool('browser press', 'Press Enter, Tab, Escape, an arrow or one character, in a ref or the page', [
    TAB, word('key', 'the key'), optionalWord('ref', 'the ref to press it in')]),
  tool('browser console', 'The last errors the page logged', [TAB]),
  tool('browser network', 'The last requests that failed', [TAB]),
];

// pr land and pr wait wait on CI for as long as it takes, longer than a tool call should hold a session.
const LAND_IN_BASH = 'run `node "$DASHBOARD_COMMAND" pr land <n>` in Bash in the background';
const WAIT_IN_BASH = 'run `node "$DASHBOARD_COMMAND" pr wait <n>` in Bash in the background';

// The verbs that stay the command's alone, by `<noun> <verb>` as the usage spells them, and why.
export const COMMAND_ONLY: Record<string, string> = {
  'board guard': 'a hook, reading its input on stdin',
  'pane notify': 'a hook a worker\'s settings call',
  'project init': 'written once, on a machine with no projects.yaml',
  'project remove': 'rare, and asked for by a person',
  'pr land': LAND_IN_BASH,
  'pr wait': WAIT_IN_BASH,
};

// What the server tells every session about itself, once.
export const SERVER_INSTRUCTIONS = 'The Dashboard app this session runs in: its board, its worker panes, its projects and its'
  + ` browser. To land a pull request, ${LAND_IN_BASH}; to wait on its CI without merging, ${WAIT_IN_BASH}.`;

export const MCP_SERVER_NAME = 'dashboard';

export function toolNamed(name: string): DashboardTool | undefined {
  return DASHBOARD_TOOLS.find((each) => each.name === name);
}

// The command line a call stands for. A required word left out is left out here too, so the noun's
// own parser refuses it in its own words.
export function toolArguments(chosen: DashboardTool, input: Record<string, unknown>): string[] {
  const words = [...chosen.words];
  const flags: string[] = [];
  for (const parameter of chosen.parameters) {
    const value = input[parameter.name];
    if (value === undefined || value === null || value === false) continue;
    if (!parameter.flag) words.push(String(value));
    else if (parameter.type === 'boolean') flags.push(`--${parameter.name}`);
    else if (Array.isArray(value)) flags.push(...value.flatMap((item) => [`--${parameter.name}`, String(item)]));
    else flags.push(`--${parameter.name}`, String(value));
  }
  return [...words, ...flags];
}

const SCHEMA_TYPES: Record<ParameterType, object> = {
  string: { type: 'string' },
  number: { type: 'number' },
  boolean: { type: 'boolean' },
  strings: { type: 'array', items: { type: 'string' } },
};

export function inputSchema(chosen: DashboardTool): object {
  return {
    type: 'object',
    properties: Object.fromEntries(chosen.parameters.map((parameter) => [parameter.name, {
      ...SCHEMA_TYPES[parameter.type],
      description: parameter.description,
      ...(parameter.values ? { enum: parameter.values } : {}),
    }])),
    required: chosen.parameters.filter((parameter) => parameter.required).map((parameter) => parameter.name),
    additionalProperties: false,
  };
}

// Each tool a session the app starts may call without asking, as permission rules.
export function allowedToolRules(): string[] {
  return DASHBOARD_TOOLS.filter((each) => each.allowed).map((each) => `mcp__${MCP_SERVER_NAME}__${each.name}`);
}

// The server as a session's MCP configuration. Its environment is the session's own, which carries the
// pane, project and socket every command run from a pane reads.
export function mcpServerConfiguration(commandFile: string): { type: 'stdio'; command: string; args: string[] } {
  return { type: 'stdio', command: 'node', args: [commandFile, 'mcp'] };
}
