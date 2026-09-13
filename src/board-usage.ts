import { PRIORITIES } from './board';

// The one copy of what the `board` command takes. It lives here rather than in board-cli.ts because
// board-store.ts quotes it into the CLAUDE.md it seeds, and board-store.ts is what main.ts imports:
// reaching into the command for a string would drag the whole command-line module into the app's
// bundle, and would point the arrow the wrong way the day the command wants the board's path back.
export const USAGE = `board — the Dashboard board of the project you are in

  board list
  board add <title> [--column <name>] [--priority <level>] [--notes <text>]
  board move <id> <column>
  board set <id> [--branch <name>] [--pull-request <number>] [--priority <level>] [--notes <text>]

Levels: ${PRIORITIES.join(', ')}. An empty --branch or --pull-request clears the field.`;
