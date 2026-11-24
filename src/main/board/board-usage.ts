import { PRIORITIES } from '../../shared/board/board';

// The one copy of what the `board` command takes, which both board-cli.ts and dashboard-cli.ts print.
// The seeded .dashboard/CLAUDE.md does not quote it: it tells an agent to run the command bare.
export const USAGE = `board — the Dashboard board of the project you are in

  board list [--all] [--column <name>]
  board show <id>
  board add "<title>" [--column <name>] [--priority <level>] [--notes "<text>"]
  board move <id> <column>
  board ship <id>
  board review <id>
  board set <id> [--branch <name>] [--pull-request <number>] [--priority <level>] [--notes "<text>"]
  board comment <id> "<text>"
  board guard            a PreToolUse hook: reads its input on stdin, refuses a hand edit of the board

list leaves out Done and Cancelled unless --all or --column names them. An <id> can be any start of
one that only one card's id begins with, such as its first eight characters.

Levels: ${PRIORITIES.join(', ')}. An empty --branch or --pull-request clears the field. Any of them
takes --project <name|aka> to work on that project's board, from ~/.dashboard/projects.yaml, instead
of the board of the folder you are in.

ship, review and a move into Ship or Review ask the running app, starting it when none answers: a move
into Ship ships the card to an agent in a worktree, and one into Review starts its review loop. ship
and review start them without a move; review is how to start a loop with the review.autoLoop setting
off. Each answers only once the project's packages are installed in the card's worktree, which can
take minutes: give those Bash calls a ten-minute timeout (600000 ms). On a worktree's board a move is
only a move. Everything else edits the board's files alone.

A board git tracks is read and written on the default branch of the project's remote (origin when
there is one, else the only remote, else the one the local main, then master, tracks), from the
project or any worktree, and the project's checkout is brought up to it. Offline, it is written here, with a warning. So no git pull, commit or push is
needed before or after a board command: it does its own.

A card that will not be done is kept, not deleted: \`board move <id> Cancelled\` puts it in the
Cancelled column after Done, which starts nothing.

--notes replaces the card's description. To record what you found, use \`comment\`: it appends to the
card's trail and takes nothing away. \`show\` prints one card with its description, its subtasks and its
trail.`;
