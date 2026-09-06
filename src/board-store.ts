import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_PRIORITY, PRIORITIES, emptyBoard, type Board, type Card, type Column, type Priority } from './board';

// The project's own corner of its repository. Everything the dashboard keeps about a project lives
// here, so there is one thing to commit or to ignore.
export const BOARD_DIRECTORY = '.dashboard';
const BOARD_FILE = 'board.json';
// Where a board.json that could not be parsed is moved aside, so a crash mid-write or a bad hand-edit
// loses nothing: the next read starts fresh, and the damaged file sits right next to it under this name.
export const BROKEN_BOARD_FILE = 'board.json.broken';

// What readBoard hands back. brokenFile is the path a damaged board.json was moved to, or null when
// nothing needed salvaging — including the ordinary case of no board.json existing yet.
export type BoardRead = { board: Board; brokenFile: string | null };

// Exported so a test can pin this repo's own checked-in `.dashboard` copies against it: seeding only
// writes a file that is not there, so those copies would otherwise drift the moment this text changes.
export const EXPLANATION_FOR_AGENTS = `# .dashboard

This folder holds the project's kanban board, shown in the Dashboard app under Ctrl+B.

## board.json

    {
      "columns": [
        {
          "name": "Todo",
          "cards": [
            {
              "id": "0f6a2c5e-...",
              "title": "Fix the resize race",
              "notes": "",
              "priority": "high"
            }
          ]
        }
      ]
    }

- \`columns\` is ordered. The first column is the leftmost on screen.
- \`cards\` is ordered. The first card is at the top of its column.
- \`id\` is a UUID. Keep it stable when you edit a card. A card written without one is given an id
  the next time the app reads the file.
- \`title\` is one line. A card with no \`title\`, or a blank one, is dropped when the app reads
  the file.
- \`notes\` is the card's description, free text over as many lines as you like. \`e\` opens it.
- \`priority\` is one of \`urgent\`, \`high\`, \`medium\`, \`low\`. Anything else, or nothing, reads as
  \`medium\`. It colours the card's left edge, and \`s\` sorts a column by it, urgent first.

Edit this file directly if you like. The app re-reads it whenever the board is opened, so switch
away from the board and back to see your changes. The app rewrites the whole file on every edit and
drops any field not listed above.
`;

export const EXPLANATION_FOR_PEOPLE = `# .dashboard

Project state for the Dashboard app. \`board.json\` holds this project's kanban board.

Commit it if the board belongs to the team; add \`.dashboard/\` to \`.gitignore\` if it is yours alone.

\`CLAUDE.md\` beside this file describes the format.
`;

function boardPath(projectPath: string): string {
  return join(projectPath, BOARD_DIRECTORY, BOARD_FILE);
}

function brokenBoardPath(projectPath: string): string {
  return join(projectPath, BOARD_DIRECTORY, BROKEN_BOARD_FILE);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// A card with a blank title is dropped, not kept: it would draw as a 4px strip you cannot read but
// can still select and delete, and .dashboard/CLAUDE.md promises agents it is dropped.
function isPriority(value: unknown): value is Priority {
  return PRIORITIES.some((priority) => priority === value);
}

function parseCard(value: unknown, makeId: () => string): Card | null {
  if (!isRecord(value) || typeof value.title !== 'string' || value.title.trim() === '') return null;
  return {
    id: typeof value.id === 'string' ? value.id : makeId(),
    title: value.title,
    notes: typeof value.notes === 'string' ? value.notes : '',
    // A card written without one, or with a word that is not a priority, is medium. Only the title is
    // worth dropping a card over.
    priority: isPriority(value.priority) ? value.priority : DEFAULT_PRIORITY,
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

// Throws rather than falling back, so readBoard can tell "nothing here made sense" apart from "no
// file at all" and only salvage the former.
export function parseBoard(text: string, makeId: () => string = () => crypto.randomUUID()): Board {
  const stored: unknown = JSON.parse(text);
  if (!isRecord(stored) || !Array.isArray(stored.columns)) throw new Error('Not a board');
  const columns = stored.columns
    .map((column) => parseColumn(column, makeId))
    .filter((column): column is Column => column !== null);
  if (columns.length === 0) throw new Error('No columns');
  return { columns };
}

// A missing file is the ordinary "no board yet" case: nothing is salvaged. A file that exists but
// cannot be parsed is different — those bytes are the only copy of someone's cards, so they are moved
// aside rather than overwritten by the next save. Once moved, the next read takes the ordinary
// no-file path, so this only ever fires once per damaged file.
export function readBoard(projectPath: string): BoardRead {
  const filePath = boardPath(projectPath);
  let text: string;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch {
    return { board: emptyBoard(), brokenFile: null };
  }
  try {
    return { board: parseBoard(text), brokenFile: null };
  } catch {
    const brokenFile = brokenBoardPath(projectPath);
    try {
      renameSync(filePath, brokenFile);
    } catch {
      // Salvage is a courtesy, not a requirement: the board must still open even if the rename fails.
      return { board: emptyBoard(), brokenFile: null };
    }
    return { board: emptyBoard(), brokenFile };
  }
}

// Unlike reading, a failed write is reported. Swallowing it would show cards on screen that are not
// on disk, and the next launch would silently lose them.
//
// Written to a temporary file first, then renamed over board.json: a rename within a directory is
// atomic on every platform this app runs on, so a crash or a full disk mid-write leaves either the
// old file or the new one, never a truncated one. Without this, the app itself would be the main
// producer of the corruption the salvage path in readBoard exists to clean up after.
export function writeBoard(projectPath: string, board: Board): void {
  const directory = join(projectPath, BOARD_DIRECTORY);
  mkdirSync(directory, { recursive: true });
  const temporaryPath = join(directory, `${BOARD_FILE}.tmp`);
  writeFileSync(temporaryPath, `${JSON.stringify(board, null, 2)}\n`);
  try {
    renameSync(temporaryPath, boardPath(projectPath));
  } catch (error: unknown) {
    try {
      unlinkSync(temporaryPath);
    } catch {
      // Best effort: the rename error below is the one that matters.
    }
    throw error;
  }
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
