import type { SDKControlGetContextUsageResponse } from '@anthropic-ai/claude-agent-sdk';

// What fills the context window, as the Claude screen's context popup lists it: the session's own
// breakdown from the same getContextUsage answer the status line's meter reads, shaped into rows.

export type ContextUsageParts = Pick<SDKControlGetContextUsageResponse, 'categories' | 'memoryFiles' | 'mcpTools' | 'maxTokens'>;
type Category = SDKControlGetContextUsageResponse['categories'][number];
type CategoryId = NonNullable<Category['id']>;

// A row of the popup. `tone` is a theme colour's name, for the row's bar; null is the plain line colour.
export type BreakdownRow = { key: string; name: string; detail: string | null; tokens: number; percentage: number; tone: string | null };

export type ContextBreakdown = { categories: BreakdownRow[]; memoryFiles: BreakdownRow[]; mcpTools: BreakdownRow[] };

// How many files or tools a list shows before the rest fold into one "N more" row.
export const LIST_CAP = 5;

// The SDK's own `color` is a key of Claude Code's terminal theme, not a colour a page can paint, so each
// row takes one of the app's theme colours by its stable id. A row with no id, or one a later CLI adds,
// is drawn in the line colour.
const CATEGORY_TONES: Partial<Record<CategoryId, string>> = {
  system_prompt: 'blue', system_tools: 'cyan', mcp_tools: 'magenta', mcp_instructions: 'brightMagenta',
  custom_agents: 'green', memory_files: 'yellow', skills: 'brightGreen', messages: 'brightBlue',
  autocompact_buffer: 'brightBlack', compact_buffer: 'brightBlack',
};

function toneOf(id: string | undefined): string | null {
  return (id ? CATEGORY_TONES[id as CategoryId] : undefined) ?? null;
}

function share(tokens: number, size: number): number {
  return size > 0 ? (tokens / size) * 100 : 0;
}

// Biggest first, at most LIST_CAP rows, then one row counting the rest and what they hold together.
function capped(rows: BreakdownRow[], size: number): BreakdownRow[] {
  const sorted = [...rows].sort((a, b) => b.tokens - a.tokens);
  if (sorted.length <= LIST_CAP) return sorted;
  const rest = sorted.slice(LIST_CAP);
  const tokens = rest.reduce((sum, row) => sum + row.tokens, 0);
  return [...sorted.slice(0, LIST_CAP), { key: 'more', name: `${rest.length} more`, detail: null, tokens, percentage: share(tokens, size), tone: null }];
}

// The categories keep the session's own order, the order Claude Code's /context lists them in. A
// deferred row is a tool schema that is not in the window at all, so it is left out, decided on the
// row's kind; so is a row holding nothing. A file or a tool is drawn in its category's colour.
export function contextBreakdown(usage: ContextUsageParts): ContextBreakdown {
  const size = usage.maxTokens;
  const row = (key: string, name: string, detail: string | null, tokens: number, tone: string | null): BreakdownRow =>
    ({ key, name, detail, tokens, percentage: share(tokens, size), tone });
  return {
    categories: usage.categories
      .filter((category) => category.kind !== 'deferred' && category.tokens > 0)
      .map((category) => row(category.id ?? category.name, category.name, null, category.tokens, toneOf(category.id))),
    memoryFiles: capped(usage.memoryFiles.map((file) => row(file.path, file.path, null, file.tokens, toneOf('memory_files'))), size),
    // A tool the session has not loaded is deferred in the same way, and is not counted in the window.
    mcpTools: capped(usage.mcpTools.filter((tool) => tool.isLoaded !== false)
      .map((tool) => row(tool.name, tool.name, tool.serverName, tool.tokens, toneOf('mcp_tools'))), size),
  };
}
