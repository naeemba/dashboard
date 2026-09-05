import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { emptyBoard, type Board, type Card, type Column } from './board';

// The project's own corner of its repository. Everything the dashboard keeps about a project lives
// here, so there is one thing to commit or to ignore.
export const BOARD_DIRECTORY = '.dashboard';
const BOARD_FILE = 'board.json';

const EXPLANATION_FOR_AGENTS = `# .dashboard

This folder holds the project's kanban board, shown in the Dashboard app under Ctrl+B.

## board.json

    {
      "columns": [
        {
          "name": "Todo",
          "cards": [
            { "id": "0f6a2c5e-...", "title": "Fix the resize race", "notes": "" }
          ]
        }
      ]
    }

- \`columns\` is ordered. The first column is the leftmost on screen.
- \`cards\` is ordered. The first card is at the top of its column.
- \`id\` is a UUID. Keep it stable when you edit a card. A card written without one is given an id
  the next time the app reads the file.
- \`title\` is one line. A card with no \`title\` is dropped when the app reads the file.
- \`notes\` is free text. The app keeps it but has no editor for it yet.

Edit this file directly if you like. The app re-reads it whenever the board is opened, so switch
away from the board and back to see your changes. The app rewrites the whole file on every edit and
drops any field not listed above.
`;

const EXPLANATION_FOR_PEOPLE = `# .dashboard

Project state for the Dashboard app. \`board.json\` holds this project's kanban board.

Commit it if the board belongs to the team; add \`.dashboard/\` to \`.gitignore\` if it is yours alone.

\`CLAUDE.md\` beside this file describes the format.
`;

function boardPath(projectPath: string): string {
  return join(projectPath, BOARD_DIRECTORY, BOARD_FILE);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseCard(value: unknown, makeId: () => string): Card | null {
  if (!isRecord(value) || typeof value.title !== 'string') return null;
  return {
    id: typeof value.id === 'string' ? value.id : makeId(),
    title: value.title,
    notes: typeof value.notes === 'string' ? value.notes : '',
  };
}

function parseColumn(value: unknown, makeId: () => string): Column | null {
  if (!isRecord(value) || typeof value.name !== 'string') return null;
  const cards = Array.isArray(value.cards) ? value.cards : [];
  return {
    name: value.name,
    cards: cards.map((card) => parseCard(card, makeId)).filter((card): card is Card => card !== null),
  };
}

// The board is written by the app, by hand, and by agents working in the repository, so reading it
// keeps whatever it can and never throws. A file it cannot make sense of reads as a fresh board —
// the alternative is a board that refuses to open because one card lost its title.
export function parseBoard(text: string, makeId: () => string = () => crypto.randomUUID()): Board {
  let stored: unknown;
  try {
    stored = JSON.parse(text);
  } catch {
    return emptyBoard();
  }
  if (!isRecord(stored) || !Array.isArray(stored.columns)) return emptyBoard();
  const columns = stored.columns
    .map((column) => parseColumn(column, makeId))
    .filter((column): column is Column => column !== null);
  return columns.length > 0 ? { columns } : emptyBoard();
}

export function readBoard(projectPath: string): Board {
  try {
    return parseBoard(readFileSync(boardPath(projectPath), 'utf8'));
  } catch {
    return emptyBoard();
  }
}

// Unlike reading, a failed write is reported. Swallowing it would show cards on screen that are not
// on disk, and the next launch would silently lose them.
export function writeBoard(projectPath: string, board: Board): void {
  mkdirSync(join(projectPath, BOARD_DIRECTORY), { recursive: true });
  writeFileSync(boardPath(projectPath), `${JSON.stringify(board, null, 2)}\n`);
}

// Written once, when the folder first appears. Neither file is regenerated, so an edited CLAUDE.md
// stays edited.
export function seedBoardDirectory(projectPath: string): void {
  mkdirSync(join(projectPath, BOARD_DIRECTORY), { recursive: true });
  for (const [name, contents] of [
    ['CLAUDE.md', EXPLANATION_FOR_AGENTS],
    ['README.md', EXPLANATION_FOR_PEOPLE],
  ] as const) {
    const file = join(projectPath, BOARD_DIRECTORY, name);
    if (!existsSync(file)) writeFileSync(file, contents);
  }
}
