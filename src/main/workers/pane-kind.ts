import { hasScreenHost } from './screen-host-protocol';

// What a pane's agent runs as: a Claude screen drawn over the pane, or Claude Code in its terminal.
export type PaneKind = 'screen' | 'terminal';

// What an agent gets where nobody asked for either: a screen wherever the screen host keeps its turn
// through a quit, a terminal on Windows (workers-decision-5). pane.dispatch starts by it and main's
// prompt tells main by it, so the two cannot disagree.
export function defaultPaneKind(platform: string): PaneKind {
  return hasScreenHost(platform) ? 'screen' : 'terminal';
}
