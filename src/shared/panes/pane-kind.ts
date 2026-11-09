// What a pane's agent runs as: a Claude screen drawn over the pane, or Claude Code in its terminal.
// Shared because the session index records it on each conversation's row, which the drawer reads.
export type PaneKind = 'screen' | 'terminal';

// `pane run --screen` or `--terminal`, a resume's recorded kind, or null for neither.
export function isPaneKindOrNull(value: unknown): value is PaneKind | null {
  return value === null || value === 'screen' || value === 'terminal';
}
