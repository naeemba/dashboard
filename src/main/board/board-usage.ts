import { PRIORITIES } from '../../shared/board/board';

// The one copy of what the `board` command takes. It lives here rather than in board-cli.ts because
// board-store.ts quotes it into the CLAUDE.md it seeds, and board-store.ts is what main.ts imports:
// reaching into the command for a string would drag the whole command-line module into the app's
// bundle, and would point the arrow the wrong way the day the command wants the board's path back.
export const USAGE = `board — the Dashboard board of the project you are in

  board list
  board show <id>
  board add "<title>" [--column <name>] [--priority <level>] [--notes "<text>"]
  board move <id> <column>
  board ship <id>
  board review <id>
  board set <id> [--branch <name>] [--pull-request <number>] [--priority <level>] [--notes "<text>"]
  board comment <id> "<text>"

Levels: ${PRIORITIES.join(', ')}. An empty --branch or --pull-request clears the field. Any of them
takes --project <name|aka> to work on that project's board, from ~/.dashboard/projects.yaml, instead
of the board of the folder you are in.

ship, review and a move into Ship or Review ask the running app, starting it when none answers: a move
into Ship ships the card to an agent in a worktree, and one into Review starts its review loop. ship
and review start them without a move; review is how to start a loop with the review.autoLoop setting
off. On a worktree's board a move is only a move. Everything else edits the board's files alone.

--notes replaces the card's description. To record what you found, use \`comment\`: it appends to the
card's trail and takes nothing away. \`show\` prints one card with its description and its trail.`;
