// What a pane's agent runs as: a Claude screen drawn over the pane, or Claude Code in its terminal.
// Shared because the session index records it on each conversation's row, which the drawer reads.
export type PaneKind = 'screen' | 'terminal';
