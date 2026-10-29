// A tool call as the chat pane folds it: one line saying what it did, and, for the tools that change a
// file, the change as a diff. The input is whatever the model sent, so every field is read as maybe
// missing — a call that was interrupted half-way can arrive with none of them.

export type DiffLine = { sign: ' ' | '-' | '+'; text: string };

function field(input: Record<string, unknown>, name: string): string | undefined {
  const value = input[name];
  return typeof value === 'string' ? value : undefined;
}

// The one thing worth reading about each call without unfolding it. A tool not listed here says its
// first string argument, which for most MCP tools is the thing they were asked about.
export function toolSummary(name: string, input: Record<string, unknown>): string {
  const pick = {
    Bash: 'command', Read: 'file_path', Write: 'file_path', Edit: 'file_path', MultiEdit: 'file_path',
    NotebookEdit: 'notebook_path', Glob: 'pattern', Grep: 'pattern', WebFetch: 'url', WebSearch: 'query',
    Agent: 'description', Task: 'description', Skill: 'skill',
  }[name];
  const text = (pick ? field(input, pick) : Object.values(input).find((value) => typeof value === 'string')) ?? '';
  const line = String(text).split('\n')[0];
  return line.length > 160 ? `${line.slice(0, 159)}…` : line;
}

// The lines that changed, with the unchanged run at either end trimmed to the line it touches.
// ponytail: prefix and suffix trimming, not a real diff — an edit that changes two lines far apart
// shows everything between them as removed and added again. Swap for a line LCS if that reads badly.
export function lineDiff(before: string, after: string): DiffLine[] {
  const old = before.split('\n');
  const next = after.split('\n');
  let start = 0;
  while (start < old.length && start < next.length && old[start] === next[start]) start++;
  let end = 0;
  while (
    end < old.length - start && end < next.length - start
    && old[old.length - 1 - end] === next[next.length - 1 - end]
  ) end++;
  return [
    ...old.slice(Math.max(0, start - 1), start).map((text): DiffLine => ({ sign: ' ', text })),
    ...old.slice(start, old.length - end).map((text): DiffLine => ({ sign: '-', text })),
    ...next.slice(start, next.length - end).map((text): DiffLine => ({ sign: '+', text })),
    ...old.slice(old.length - end, old.length - end + 1).map((text): DiffLine => ({ sign: ' ', text })),
  ];
}

// The change a file tool asked for, or null for every other tool. Write is a whole new file, so all of
// it is added; MultiEdit is its edits one after another.
export function toolDiff(name: string, input: Record<string, unknown>): DiffLine[] | null {
  if (name === 'Edit') return lineDiff(field(input, 'old_string') ?? '', field(input, 'new_string') ?? '');
  if (name === 'Write') return (field(input, 'content') ?? '').split('\n').map((text) => ({ sign: '+', text }));
  if (name === 'MultiEdit' && Array.isArray(input.edits)) {
    return input.edits.flatMap((edit: Record<string, unknown>) => lineDiff(field(edit, 'old_string') ?? '', field(edit, 'new_string') ?? ''));
  }
  return null;
}
