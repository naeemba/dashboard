// What a pane's agent runs as: a Claude screen drawn over the pane, or Claude Code in its terminal.
// Shared because the session index records it on each conversation's row, which the drawer reads.
export type PaneKind = 'screen' | 'terminal';

export const isPaneKind = (value: unknown): value is PaneKind => value === 'screen' || value === 'terminal';

// `pane run --screen` or `--terminal`, a resume's recorded kind, or null for neither.
export const isPaneKindOrNull = (value: unknown): value is PaneKind | null => value === null || isPaneKind(value);
