import { isRecord, stringOrEmpty } from '../../shared/app/is-record';

// A tool call as the chat pane folds it: one line saying what it did, and, for the tools that change a
// file, the change as a diff. The input is whatever the model sent, so every field is read as maybe
// missing — a call that was interrupted half-way can arrive with none of them.

// A gap row ('…') stands for unchanged lines left out, and has no text of its own.
export type DiffLine = { sign: ' ' | '-' | '+' | '…'; text: string };

function field(input: Record<string, unknown>, name: string): string | undefined {
  const value = input[name];
  return typeof value === 'string' ? value : undefined;
}

// The one thing worth reading about each call without unfolding it. A tool not listed here says its
// first string argument, which for most MCP tools is the thing they were asked about. A checklist says
// how much of it is done.
export function toolSummary(name: string, input: Record<string, unknown>): string {
  const todos = todoChecklist(name, input);
  if (todos) return `${todos.filter((todo) => todo.status === 'completed').length}/${todos.length} done`;
  const pick = {
    Bash: 'command', Read: 'file_path', Write: 'file_path', Edit: 'file_path', MultiEdit: 'file_path',
    NotebookEdit: 'notebook_path', Glob: 'pattern', Grep: 'pattern', WebFetch: 'url', WebSearch: 'query',
    Agent: 'description', Task: 'description', Skill: 'skill',
  }[name];
  const text = (pick ? field(input, pick) : Object.values(input).find((value) => typeof value === 'string')) ?? '';
  const line = String(text).split('\n')[0];
  return line.length > 160 ? `${line.slice(0, 159)}…` : line;
}

// The lines that changed, each run of them with the one unchanged line either side. Lines the two
// sides open and close with are kept as they are; a longest common subsequence of the lines between
// decides what else stayed, so two edits far apart show as two runs, with a gap row standing for the
// unchanged lines dropped between them. A gap of one line shows that line instead, at the same cost.
export function lineDiff(before: string, after: string): DiffLine[] {
  const old = before.split('\n');
  const next = after.split('\n');
  let start = 0;
  while (start < old.length && start < next.length && old[start] === next[start]) start++;
  let end = 0;
  while (end < old.length - start && end < next.length - start && old[old.length - 1 - end] === next[next.length - 1 - end]) end++;
  const same = (text: string): DiffLine => ({ sign: ' ', text });
  const lines = [
    ...old.slice(0, start).map(same),
    ...middleDiff(old.slice(start, old.length - end), next.slice(start, next.length - end)),
    ...old.slice(old.length - end).map(same),
  ];
  const changedAt = lines.map((line) => line.sign !== ' ');
  const nearChange = (index: number) => changedAt[index - 1] || changedAt[index] || changedAt[index + 1];
  const shownAt = (index: number) => nearChange(index) || (nearChange(index - 1) && nearChange(index + 1));
  const shown: DiffLine[] = [];
  lines.forEach((line, index) => {
    if (!shownAt(index)) return;
    if (shown.length > 0 && !shownAt(index - 1)) shown.push(gap);
    shown.push(line);
  });
  return shown;
}

const gap: DiffLine = { sign: '…', text: '' };

// The changed middle of an edit, line by line.
// ponytail: the LCS table is old × new lines, so past a million cells the middle shows as all removed
// then all added rather than freeze the pane; Myers' diff if huge edits need reading.
function middleDiff(old: string[], next: string[]): DiffLine[] {
  if (old.length * next.length > 1_000_000) {
    return [
      ...old.map((text): DiffLine => ({ sign: '-', text })),
      ...next.map((text): DiffLine => ({ sign: '+', text })),
    ];
  }
  const common = Array.from({ length: old.length + 1 }, () => new Array<number>(next.length + 1).fill(0));
  for (let oldIndex = old.length - 1; oldIndex >= 0; oldIndex--) {
    for (let nextIndex = next.length - 1; nextIndex >= 0; nextIndex--) {
      common[oldIndex][nextIndex] = old[oldIndex] === next[nextIndex] ? common[oldIndex + 1][nextIndex + 1] + 1 : Math.max(common[oldIndex + 1][nextIndex], common[oldIndex][nextIndex + 1]);
    }
  }
  const lines: DiffLine[] = [];
  let oldIndex = 0;
  let nextIndex = 0;
  while (oldIndex < old.length || nextIndex < next.length) {
    if (oldIndex < old.length && nextIndex < next.length && old[oldIndex] === next[nextIndex]) {
      lines.push({ sign: ' ', text: old[oldIndex] });
      oldIndex++;
      nextIndex++;
    } else if (nextIndex === next.length || (oldIndex < old.length && common[oldIndex + 1][nextIndex] >= common[oldIndex][nextIndex + 1])) {
      lines.push({ sign: '-', text: old[oldIndex++] });
    } else {
      lines.push({ sign: '+', text: next[nextIndex++] });
    }
  }
  return lines;
}

// The change a file tool asked for, or null for every other tool and for an edit that changes nothing,
// so its input shows instead. Write is a whole new file, so all of it is added; MultiEdit is its edits
// one after another, a gap row between each, since nothing says they sit next to each other.
export function toolDiff(name: string, input: Record<string, unknown>): DiffLine[] | null {
  if (name === 'Write') return (field(input, 'content') ?? '').split('\n').map((text) => ({ sign: '+', text }));
  const edits = name === 'Edit' ? [input] : name === 'MultiEdit' && Array.isArray(input.edits) ? input.edits.filter(isRecord) : [];
  const diffs = edits
    .map((edit) => lineDiff(field(edit, 'old_string') ?? '', field(edit, 'new_string') ?? ''))
    .filter((diff) => diff.length > 0);
  return diffs.length > 0 ? diffs.flatMap((diff, index) => (index > 0 ? [gap, ...diff] : diff)) : null;
}

export type TodoItem = { text: string; status: 'pending' | 'in_progress' | 'completed' };

// The list a TodoWrite call put up, each item with its state, or null for every other tool. The item
// being worked on reads as its activeForm, the way Claude Code's own checklist says it.
export function todoChecklist(name: string, input: Record<string, unknown>): TodoItem[] | null {
  if (name !== 'TodoWrite' || !Array.isArray(input.todos)) return null;
  return input.todos.filter(isRecord).map((todo) => {
    const status = todo.status === 'in_progress' || todo.status === 'completed' ? todo.status : 'pending';
    const text = (status === 'in_progress' && stringOrEmpty(todo.activeForm)) || stringOrEmpty(todo.content);
    return { text, status };
  });
}
