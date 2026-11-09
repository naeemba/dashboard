import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { BOARD_FOLDER, BROKEN_SUFFIX, boardFolderSnapshot, readBoardFolder, writeBoardFolder, type StoredBoard } from './board-files';
import { byPlace, storedOrder } from './card-order';
import { dashboardFolder } from '../app/dashboard-folder';
import { readText } from '../app/missing-file';
import { TEMPORARY_SUFFIX } from '../app/replace-file';
import { isRecord } from '../../shared/app/is-record';
import {
  BACKLOG_COLUMN,
  DEFAULT_PRIORITY,
  emptyBoard,
  isCommentBody,
  isPriority,
  isPullRequestNumber,
  isTitle,
  withReviewColumn,
  withBacklogColumn,
  withCancelledColumn,
  withShipColumn,
  withoutEmptyShipColumn,
  type Board,
  type Card,
  type CardComment,
  type Column,
} from '../../shared/board/board';
import { isManagerPath } from '../../shared/manager/manager';
import type { BoardRead } from '../../shared/app/bridge';

// The project's own corner of its repository. Everything the dashboard keeps about a project lives
// here, so there is one thing to commit or to ignore.
export const BOARD_DIRECTORY = '.dashboard';
// The board as it was kept until each card got a file of its own: the whole board in one file. Still
// read, forever — every project the app has ever opened has one until its board is next written, and
// that write is what moves it into the folder below (writeBoard says how). Never written again.
export const BOARD_FILE = 'board.json';
// Both, relative to the project — the shape git reports and git compares, as opposed to the absolute
// paths boardPath and boardFolderPath join. One spelling, so a second copy in another module cannot
// drift from this one the day .dashboard is renamed.
export const BOARD_FILE_PATH = `${BOARD_DIRECTORY}/${BOARD_FILE}`;
export const BOARD_FOLDER_PATH = `${BOARD_DIRECTORY}/${BOARD_FOLDER}`;
// What `git add -A --`, `git diff --cached --` and `git commit --` are handed to take in a board change
// and nothing else: the old file (its removal, the first time a board is written) and every file in the
// folder, but not a `.broken` file set aside or a write's temporary file. Naming the two paths outright
// does not work — git refuses a path that matches nothing, and after the first write board.json is gone.
// A git pathspec's `*` crosses `/`, so the one pattern covers both.
export const BOARD_PATHSPECS = [
  `${BOARD_DIRECTORY}/board*`,
  `:(exclude)${BOARD_DIRECTORY}/board*${BROKEN_SUFFIX}`,
  `:(exclude)${BOARD_DIRECTORY}/board*${TEMPORARY_SUFFIX}`,
] as const;
// Where a board.json that could not be parsed is moved aside, so a crash mid-write or a bad hand-edit
// loses nothing: the next read starts fresh, and the damaged file sits right next to it under this name.
export const BROKEN_BOARD_FILE = `${BOARD_FILE}${BROKEN_SUFFIX}`;

// Exported so a test can pin this repo's own checked-in `.dashboard` copies against it: seeding only
// writes a file that is not there, so those copies would otherwise drift the moment this text changes.
export const EXPLANATION_FOR_AGENTS = `# .dashboard

This folder holds the project's kanban board, shown in the Dashboard app under Ctrl+B: \`board/\`, one
file per card, or \`board.json\` in a project the app has not written to since.

Change it with the board command, never by editing those files; an agent's edit of one is refused by
the \`board guard\` hook the app installs. Every pane the app opens carries \`DASHBOARD_BOARD\`, its path:

    node "$DASHBOARD_BOARD"          prints what it takes
    node "$DASHBOARD_BOARD" list     every card, with the id the other commands want
`;

export const EXPLANATION_FOR_PEOPLE = `# .dashboard

Project state for the Dashboard app. \`board/\` holds this project's kanban board, one file per card
(\`board.json\` in a project the app has not written to since), and
\`notes.md\` — if it is here — is the project's page of free text, for what is not a card.

Commit it if the board belongs to the team; add \`.dashboard/\` to \`.gitignore\` if it is yours alone.

\`CLAUDE.md\` beside this file tells an agent how to change the board.
`;

// Which project a directory belongs to. The command line is pointed at a project by the directory you
// run it from, and an agent that has `cd src` first is still working the same project: without this,
// `board add` there seeds a second `.dashboard` under src/ and writes the card into it — a real id
// printed back, a card on no board anyone looks at, and an untracked folder in `git status`.
//
// The nearest board above you wins, and a project that has no board yet falls back to the repository,
// which is the same root the app itself opens a project at. Neither found, the answer is null and the
// command refuses: run from a plain terminal in ~/Downloads, a guessed board there would be a card on
// a board nobody looks at. Every project the app opens is seeded a board, so its panes always find one.
// The climb stops at the home directory and never looks inside it, so a `board` command run
// somewhere under $HOME that is neither a repository nor has a board of its own cannot climb past
// $HOME into the manager's own .dashboard (dashboard-folder.ts puts its notes and its board there) and
// write a stray card into it.
// Called directly on the home directory the loop body never runs and the answer is null;
// isManagerHomeDirectory below is still asked first, so that case is refused with its own line.
export function projectRoot(directory: string): string | null {
  const home = homedir();
  for (let at = resolve(directory); at !== dirname(at) && at !== home; at = dirname(at)) {
    if (existsSync(join(at, BOARD_DIRECTORY)) || existsSync(join(at, '.git'))) return at;
  }
  return null;
}

// Whether a directory is the home directory itself. projectRoot's climb never looks inside $HOME,
// but called directly on $HOME it still answers with it, so board-cli-entry checks this before
// opening a board at all — running the command from $HOME refuses instead of seeding the manager's
// .dashboard with a stray project.
export function isManagerHomeDirectory(directory: string): boolean {
  return resolve(directory) === homedir();
}

// Which folder is dashboard-folder.ts's to decide, the same as the notes: the manager's board has no
// project to sit in and goes in the home directory.
export function boardPath(projectPath: string): string {
  return join(dashboardFolder(projectPath), BOARD_DIRECTORY, BOARD_FILE);
}

export function boardFolderPath(projectPath: string): string {
  return join(dashboardFolder(projectPath), BOARD_DIRECTORY, BOARD_FOLDER);
}

// Whether a project has a board of either kind on disk, read or not.
export function hasBoard(projectPath: string): boolean {
  return existsSync(boardPath(projectPath)) || existsSync(boardFolderPath(projectPath));
}

function brokenBoardPath(projectPath: string): string {
  return join(dashboardFolder(projectPath), BOARD_DIRECTORY, BROKEN_BOARD_FILE);
}

// The columns a board is read with. A project's are whatever parseBoard left; the manager's lose the
// empty Ship column, since there is no repository behind that page to make a worktree in.
function withManagerColumns(projectPath: string, board: Board): Board {
  return isManagerPath(projectPath) ? withoutEmptyShipColumn(board) : board;
}

// undefined rather than a default, for the four fields that mean "nobody knows". A blank string is
// the same as absent: a hand-written `"branch": ""` should not draw an empty badge on the card.
function optionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

// A card with a blank title is dropped, not kept: it would draw as a 4px strip you cannot read but
// can still select and delete.
function parseCard(value: unknown, makeId: () => string): Card | null {
  if (!isRecord(value) || !isTitle(value.title)) return null;
  return {
    id: typeof value.id === 'string' ? value.id : makeId(),
    title: value.title,
    notes: typeof value.notes === 'string' ? value.notes : '',
    // A card written without one, or with a word that is not a priority, is medium. Only the title is
    // worth dropping a card over.
    priority: isPriority(value.priority) ? value.priority : DEFAULT_PRIORITY,
    // Repaired after the whole board is read, not here: whether an id names a real card cannot be
    // known while the cards are still being parsed one at a time.
    parent: typeof value.parent === 'string' ? value.parent : null,
    // Kept as written, not checked against a date format. relativeAge says nothing about text it
    // cannot parse, so `"createdAt": "last tuesday"` costs the line on the card and nothing else.
    createdAt: optionalText(value.createdAt),
    updatedAt: optionalText(value.updatedAt),
    branch: optionalText(value.branch),
    pullRequest: isPullRequestNumber(value.pullRequest) ? value.pullRequest : undefined,
    comments: parseComments(value.comments),
  };
}

// undefined rather than an empty list, so a card that has never been commented on is written back
// without the field — a board from before comments existed round-trips as the file it was.
//
// A comment with no body is dropped rather than kept: it would draw as a blank line in the trail with
// a date beside it.
function parseComments(value: unknown): CardComment[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const comments = value.flatMap((entry): CardComment[] => (isRecord(entry) && isCommentBody(entry.body)
    ? [{ at: optionalText(entry.at), body: entry.body.trim() }]
    : []));
  return comments.length === 0 ? undefined : comments;
}

function parseColumn(value: unknown, makeId: () => string): Column | null {
  if (!isRecord(value) || typeof value.name !== 'string') return null;
  const cards = Array.isArray(value.cards) ? value.cards : [];
  return {
    name: value.name,
    cards: cards.map((card) => parseCard(card, makeId)).filter((card): card is Card => card !== null),
  };
}

// A hand-edited file can say three things the rest of the code cannot survive: two cards sharing an
// id, a parent naming a card that is not there, and a ring where a card is its own ancestor. All are
// repaired rather than rejected — throwing would send readBoard down the salvage path and cost
// someone every card over one bad id.
//
// The duplicate goes first, because everything after it looks a card up by id. Copying the block
// above is how a similar card gets hand-written, and that copies the id with it: without this, `d` on
// either copy deletes both, and the confirmation names only one. The second copy is the one given a
// fresh id, so a `parent` naming the first keeps working.
//
// ponytail: walks up from each card, O(cards × depth). A board deep enough for that to show is a
// board nobody can read anyway.
function repairCards(columns: Column[], makeId: () => string): Column[] {
  const taken = new Set<string>();
  const unique = columns.map((column) => ({
    ...column,
    cards: column.cards.map((card) => {
      if (!taken.has(card.id)) {
        taken.add(card.id);
        return card;
      }
      // Into `taken` as well: a generated id can land on one a later card already carries, and
      // without this that later card keeps it and the pair this function exists to split is back.
      const fresh = makeId();
      taken.add(fresh);
      return { ...card, id: fresh };
    }),
  }));

  const cards = unique.flatMap((column) => column.cards);
  const byId = new Map(cards.map((card) => [card.id, card]));

  function isSafe(card: Card): boolean {
    const seen = new Set<string>([card.id]);
    let parentId = card.parent;
    while (parentId !== null) {
      if (seen.has(parentId)) return false;
      const parent = byId.get(parentId);
      if (parent === undefined) return false;
      seen.add(parentId);
      parentId = parent.parent;
    }
    return true;
  }

  const broken = new Set(cards.filter((card) => !isSafe(card)).map((card) => card.id));
  if (broken.size === 0) return unique;
  return unique.map((column) => ({
    ...column,
    cards: column.cards.map((card) => (broken.has(card.id) ? { ...card, parent: null } : card)),
  }));
}

// The ids a parse gives cards the file holds without one, or with one another card already has: the
// same for the same bytes. The screen's board and the read a save replays onto are two parses of one
// file, and with a random id each they would name the hand-written card differently, so a rename of
// it on the board is dropped as an edit to a card that is not there. The counter keeps two such cards
// apart, and repairCards splits a generated id that lands on one the file already uses.
function idsFor(text: string): () => string {
  const digest = createHash('sha256').update(text).digest('hex').slice(0, 16);
  let count = 0;
  return () => `${digest}-${++count}`;
}

// Throws rather than falling back, so readBoard can tell "nothing here made sense" apart from "no
// file at all" and only salvage the former.
export function parseBoard(text: string, makeId: () => string = idsFor(text)): Board {
  const stored: unknown = JSON.parse(text);
  if (!isRecord(stored) || !Array.isArray(stored.columns)) throw new Error('Not a board');
  const columns = stored.columns
    .map((column) => parseColumn(column, makeId))
    .filter((column): column is Column => column !== null);
  if (columns.length === 0) throw new Error('No columns');
  return repairedBoard(columns, makeId);
}

function repairedBoard(columns: Column[], makeId: () => string): Board {
  return withCancelledColumn(withBacklogColumn(withReviewColumn(withShipColumn({ columns: repairCards(columns, makeId) }))));
}

// The board from its folder, and from board.json too when both are there. That happens when a write
// stopped between the cards and the old file's removal, and when a branch that still edits board.json
// merges into one that has moved on: either way the folder is the newer copy, and a card only the old
// file has is kept, at the bottom of its column, so no card is lost to the move.
//
// columns.json names the columns in order. A card naming a column it does not list gets that column,
// after the listed ones — two branches each adding one, or a hand-written card — and a card naming no
// column waits in Backlog. Inside a column the cards go by their `order`, then by id, so two cards two
// branches both put on top come out the same way on every machine.
function folderBoard(stored: StoredBoard, legacy: Board | null): Board {
  const makeId = idsFor(stored.text);
  const listed = isRecord(stored.columns) && Array.isArray(stored.columns.columns)
    ? stored.columns.columns.filter((name): name is string => typeof name === 'string')
    : legacy?.columns.map((column) => column.name) ?? [];
  const names = [...new Set(listed)];
  const placed = stored.cards.flatMap((record) => {
    const card = parseCard(record, makeId);
    if (card === null) return [];
    const column = typeof record.column === 'string' ? record.column : BACKLOG_COLUMN;
    if (!names.includes(column)) names.push(column);
    return [{ card, id: card.id, column, order: storedOrder(record.order) ?? Number.POSITIVE_INFINITY }];
  });
  placed.sort(byPlace);
  const columns: Column[] = names.map((name) => ({
    name,
    cards: placed.filter((entry) => entry.column === name).map((entry) => entry.card),
  }));
  const present = new Set(placed.map((entry) => entry.card.id));
  for (const column of legacy?.columns ?? []) {
    const missing = column.cards.filter((card) => !present.has(card.id));
    if (missing.length === 0) continue;
    const target = columns.find((candidate) => candidate.name === column.name);
    if (target) target.cards.push(...missing);
    else columns.push({ name: column.name, cards: missing });
  }
  return columns.length === 0 ? emptyBoard() : repairedBoard(columns, makeId);
}

// A missing file is the ordinary "no board yet" case: nothing is salvaged. A file that exists but
// cannot be parsed is different — those bytes are the only copy of someone's cards, so they are moved
// aside rather than overwritten by the next save. Once moved, the next read takes the ordinary
// no-file path, so this only ever fires once per damaged file.
//
// Every other reason the read can fail is a failure and is thrown. Answer an EMFILE or an EIO with an
// empty board and the board draws with no cards and nothing in the status bar; the next card you add
// is saved over the forty that are still sitting on disk.
//
// Without `salvage`, nothing is moved: a damaged file is skipped, left under its own name, and named in
// brokenFiles on every read until it is fixed. That is the read for a write that gets committed — the
// `board` command and the ship move — which refuses whenever brokenFiles is not empty. A rename there
// would take the tracked file away, so the second read would come back clean and the next `git add -A`
// would commit that card as deleted.
export function readBoard(projectPath: string, salvage = true): BoardRead {
  const read = readStoredBoard(projectPath, salvage);
  return { ...read, board: withManagerColumns(projectPath, read.board ?? emptyBoard()) };
}

// A look at a board without taking charge of it, for the manager's counts and activity. Nothing is
// written: no folder is made, no explanation files are seeded, and a damaged file stays exactly where
// it is. readBoard moves a damaged file aside and the board screen says so — let a background look do
// it first and nobody is told, and the board screen then opens empty with no message.
// Null when there is nothing to count: no file, a file that will not parse, or one that cannot be read.
//
// A card file that will not parse is skipped by a look, not counted, and left where it is. A board.json
// that will not parse is null even beside a folder: a save from the screen is based on this look, and
// one based on the folder alone would remove that file, the only copy of the cards it holds.
export function peekBoard(projectPath: string): Board | null {
  try {
    const { board, brokenFiles } = readStoredBoard(projectPath, false);
    if (board === null || brokenFiles.includes(boardPath(projectPath))) return null;
    return withManagerColumns(projectPath, board);
  } catch {
    return null;
  }
}

// Null for the board when there is none at all. Without `salvage`, a board.json that will not parse
// is left where it is and named in brokenFiles instead of being moved aside.
function readStoredBoard(projectPath: string, salvage: boolean): { board: Board | null; brokenFiles: string[] } {
  const legacy = readBoardFile(projectPath, salvage);
  const stored = readBoardFolder(boardFolderPath(projectPath), salvage);
  if (stored === null) return legacy;
  return { board: folderBoard(stored, legacy.board), brokenFiles: [...legacy.brokenFiles, ...stored.brokenFiles] };
}

function readBoardFile(projectPath: string, salvage: boolean): { board: Board | null; brokenFiles: string[] } {
  const filePath = boardPath(projectPath);
  const text = readText(filePath);
  if (text === null) return { board: null, brokenFiles: [] };
  try {
    return { board: parseBoard(text), brokenFiles: [] };
  } catch {
    if (!salvage) return { board: null, brokenFiles: [filePath] };
    const brokenFile = brokenBoardPath(projectPath);
    // A rename that fails leaves the damaged bytes where they are, so it is one of the read failures
    // the header is about and goes out the same door.
    renameSync(filePath, brokenFile);
    return { board: emptyBoard(), brokenFiles: [brokenFile] };
  }
}

// Every byte of the board as it is on disk, old file and folder both, as one string; null when there
// is no board at all. Only ever compared with another snapshot — it is how the watcher tells the app's
// own write from somebody else's.
export function boardSnapshot(projectPath: string): string | null {
  const legacy = readText(boardPath(projectPath));
  const folder = boardFolderSnapshot(boardFolderPath(projectPath));
  return legacy === null && folder === null ? null : `${legacy ?? ''}\0\0${folder ?? ''}`;
}

// Answers with the snapshot of what it wrote. Main keeps the last of them per project and compares them against
// what the folder watcher finds, which is how the app's own saves are told apart from the command
// line's — without it every keystroke on the board would come back as somebody else's change and
// redraw the board out from under the selection.
//
// Unlike reading, a failed write is reported. Swallowing it would show cards on screen that are not
// on disk, and the next launch would silently lose them.
//
// Every file goes through replaceFile, so each is replaced whole or not at all, and only the files whose
// bytes change are written — a move rewrites the card that moved. A project still on board.json moves
// to the folder here, in one step: every card is written to its own file first and only then is the
// old file removed, so a write that stops part way leaves both, which readStoredBoard reads as one.
//
// The snapshot comes from the bytes written, not a read back: the same string boardSnapshot reads,
// with board.json gone.
export function writeBoard(projectPath: string, board: Board): string {
  const folder = writeBoardFolder(boardFolderPath(projectPath), board.columns);
  rmSync(boardPath(projectPath), { force: true });
  return `\0\0${folder}`;
}

// Seed, then read. Both callers that open a board — the app's board:read and the command line — want
// exactly this, and seeding is a convenience: writing the two explanation files must never cost
// someone a board.json that is sitting right there and perfectly readable, so a read-only folder
// loses the docs and keeps the cards.
//
// The manager's board gets the folder and not the files. Both files describe a project's board and the
// `board` command that moves its cards, and that command refuses to run in the home directory — an
// agent reading them there would be told how to do something it cannot. The folder is still made, so
// the watch main starts after this read has something to watch.
export function openBoard(projectPath: string, salvage = true): BoardRead {
  try {
    if (isManagerPath(projectPath)) mkdirSync(dirname(boardPath(projectPath)), { recursive: true });
    else seedBoardDirectory(projectPath);
  } catch {
    // No explanation files this time.
  }
  return readBoard(projectPath, salvage);
}

// Each file is written once, when it is not there. Neither is regenerated, so an edited CLAUDE.md
// stays edited, and so does one seeded with the older text that spelled out the card format: it still
// names the board command, and the hand edit it describes is refused by the guard, which names the
// command too. The folder existing is not enough to skip the walk: writeBoard makes it too, and a
// repo that keeps board.json in git often does not keep the docs beside it — clone one of those and
// the folder arrives with no CLAUDE.md in it, leaving an agent working in there nothing that names
// the command.
export function seedBoardDirectory(projectPath: string): void {
  const directory = join(projectPath, BOARD_DIRECTORY);
  mkdirSync(directory, { recursive: true });
  for (const [name, contents] of [
    ['CLAUDE.md', EXPLANATION_FOR_AGENTS],
    ['README.md', EXPLANATION_FOR_PEOPLE],
  ] as const) {
    const file = join(directory, name);
    if (!existsSync(file)) writeFileSync(file, contents);
  }
}
