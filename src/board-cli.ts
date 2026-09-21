import {
  PRIORITIES,
  addCard,
  addComment,
  branchFrom,
  columnNamed,
  flightParts,
  isCommentBody,
  isPriority,
  isTitle,
  moveCardToColumn,
  pullRequestFrom,
  selectionOf,
  setBranch,
  setNotes,
  setPriority,
  setPullRequest,
  type Board,
  type Card,
  type Selection,
} from './board';
import { USAGE } from './board-usage';

// Every decision the command line makes. The board it is handed and the board it answers with are
// the app's own, through the app's own operations in board.ts — a card added here carries the same
// fields, ages the same way and lands in the same place as one added with `n` on the board.
//
// Nothing here reads a file or prints. That is board-cli-entry.ts, which is the whole of the
// program outside this file and has no decision in it.

// null rather than the board when nothing changed: the entry writes only when there is something to
// write, so `move` to the column a card is already in leaves the file's bytes and its mtime alone —
// and the watcher in main stays quiet instead of redrawing every board for a command that did nothing.
export type CommandResult =
  | { ok: true; output: string; board: Board | null }
  | { ok: false; message: string };

// `--name value` and `--name=value` both, because an agent writing the command will use either and
// refusing one of them is a refusal nobody can see coming. A flag repeated takes its last value.
function readFlags(args: readonly string[], allowed: readonly string[]): { flags: Map<string, string> } | { message: string } {
  const flags = new Map<string, string>();
  for (let at = 0; at < args.length; at += 1) {
    const argument = args[at];
    if (!argument.startsWith('--')) return { message: `not a flag: ${argument}` };
    const equals = argument.indexOf('=');
    const name = equals === -1 ? argument.slice(2) : argument.slice(2, equals);
    if (!allowed.includes(name)) return { message: `no --${name} here; this command takes ${allowed.map((flag) => `--${flag}`).join(', ')}` };
    if (equals !== -1) {
      flags.set(name, argument.slice(equals + 1));
      continue;
    }
    // A missing value is refused rather than read as an empty string: `--branch --notes x` would
    // otherwise clear the branch and say nothing, and the notes would go missing with it.
    at += 1;
    if (at >= args.length) return { message: `--${name} needs a value` };
    flags.set(name, args[at]);
  }
  return { flags };
}

function noSuchColumn(board: Board, name: string): string {
  return `no column called ${name}; this board has ${board.columns.map((column) => column.name).join(', ')}`;
}

function noSuchPriority(level: string): string {
  return `not a priority: ${level}; one of ${PRIORITIES.join(', ')}`;
}

// The fields `add` and `set` share. Each is applied through the same function the board's own keys
// call, so `updatedAt` moves here exactly as it moves there.
function withFields(board: Board, selection: Selection, flags: Map<string, string>): { board: Board } | { message: string } {
  let next = board;
  const priority = flags.get('priority');
  if (priority !== undefined) {
    if (!isPriority(priority)) return { message: noSuchPriority(priority) };
    next = setPriority(next, selection, priority).board;
  }
  const branch = flags.get('branch');
  if (branch !== undefined) next = setBranch(next, selection, branchFrom(branch)).board;
  const pullRequest = flags.get('pull-request');
  if (pullRequest !== undefined) {
    const number = pullRequest.trim() === '' ? undefined : pullRequestFrom(pullRequest);
    // null is what pullRequestFrom says about text that is not a number; undefined is the empty
    // string, which means the card has none. They are not the same answer and must not share a branch.
    if (number === null) return { message: `not a pull request number: ${pullRequest}` };
    next = setPullRequest(next, selection, number).board;
  }
  const notes = flags.get('notes');
  if (notes !== undefined) next = setNotes(next, selection, notes).board;
  return { board: next };
}

// How much a card has to read, or nothing when it has no trail. `list` carries it beside the branch
// and the pull request for the same reason the card front in the app does: without it, finding which
// cards have anything to read means running `show` on every one of them.
function commentCount(card: Card): string {
  const trail = card.comments?.length ?? 0;
  return trail === 0 ? '' : `${trail} ${trail === 1 ? 'comment' : 'comments'}`;
}

// One line per card, every column, left to right and top to bottom — the order the board draws them
// in, so reading this and reading the screen give the same answer about what is where.
export function formatList(board: Board): string {
  const cards = board.columns.flatMap((column) => column.cards.map((card) => ({ column: column.name, card })));
  if (cards.length === 0) return 'No cards.';
  const columnWidth = Math.max(...cards.map((row) => row.column.length));
  const priorityWidth = Math.max(...PRIORITIES.map((priority) => priority.length));
  return cards
    .map(({ column, card }) => {
      const count = commentCount(card);
      const parts = [...flightParts(card), ...(count === '' ? [] : [count])];
      return [
        column.padEnd(columnWidth),
        card.priority.padEnd(priorityWidth),
        card.id,
        card.title + (parts.length === 0 ? '' : `  (${parts.join(' · ')})`),
      ].join('  ');
    })
    .join('\n');
}

// One card in full: the line `list` prints for it, then its description, then its trail oldest
// first. The trail is the half you cannot get from `list` — a line per card has nowhere to put it —
// and reading it back is what stops the same finding being written twice.
//
// The body is indented two spaces so that only a separator ever sits hard against the left margin: a
// comment recording a diff hunk starts its line `--- a/src/board.ts`, and unindented it would read
// back as another entry, dated `a/src/board.ts`.
function formatCard(column: string, card: Card): string {
  const flight = flightParts(card);
  return [
    [column, card.priority, card.id, card.title].join('  '),
    ...(flight.length === 0 ? [] : [flight.join(' · ')]),
    ...(card.notes === '' ? [] : ['', card.notes]),
    ...(card.comments ?? []).flatMap((comment, at) => [
      '',
      `--- #${at + 1} · ${comment.at ?? 'no date'}`,
      comment.body.split('\n').map((line) => (line === '' ? '' : `  ${line}`)).join('\n'),
    ]),
  ].join('\n');
}

export function runBoardCommand(
  board: Board,
  args: readonly string[],
  makeId: () => string = () => crypto.randomUUID(),
): CommandResult {
  const [command, ...rest] = args;
  if (command === undefined || command === '--help' || command === '-h') {
    return { ok: true, output: USAGE, board: null };
  }

  if (command === 'list') {
    if (rest.length > 0) return { ok: false, message: 'list takes nothing after it' };
    return { ok: true, output: formatList(board), board: null };
  }

  if (command === 'add') {
    const [title, ...flagArgs] = rest;
    // A flag where the title should be is a typo, not a title. Without this `board add --help` writes a
    // card called `--help` into a file the team commits, and answers as if you had meant it. One dash
    // counts: `-h` is the other spelling this program takes for help, and the only title this refuses
    // that `--` would not is one starting with a dash, which nobody writes.
    if (title !== undefined && title.startsWith('-')) return { ok: false, message: 'add needs a title before its flags' };
    // The same rule parseCard holds a hand-written card to: a card with no title is not a card, and
    // one written here would be dropped the next time the app read the file.
    if (!isTitle(title)) return { ok: false, message: 'add needs a title' };
    const read = readFlags(flagArgs, ['column', 'priority', 'notes']);
    if ('message' in read) return { ok: false, message: read.message };
    const columnName = read.flags.get('column');
    // The leftmost column, which is where a card nobody has placed belongs — Todo on every board the
    // app writes.
    const column = columnName === undefined ? 0 : columnNamed(board, columnName);
    if (columnName !== undefined && column === -1) return { ok: false, message: noSuchColumn(board, columnName) };
    const id = makeId();
    const added = addCard(board, { column, card: 0 }, id, title);
    const fields = withFields(added.board, added.selection, read.flags);
    if ('message' in fields) return { ok: false, message: fields.message };
    // Read back rather than echoed: addCard decides what title the card ends up with, so the line
    // printed here cannot say one thing while the file holds another.
    const card = fields.board.columns[added.selection.column].cards[added.selection.card];
    return { ok: true, output: `${id}  ${board.columns[column].name}  ${card.title}`, board: fields.board };
  }

  if (command === 'move') {
    const [id, columnName, ...extra] = rest;
    if (id === undefined || columnName === undefined) return { ok: false, message: 'move needs a card id and a column' };
    if (extra.length > 0) return { ok: false, message: 'move takes nothing after the column' };
    const selection = selectionOf(board, id);
    if (selection === null) return { ok: false, message: `no card with id ${id}` };
    const column = columnNamed(board, columnName);
    if (column === -1) return { ok: false, message: noSuchColumn(board, columnName) };
    // selectionOf just found it, so it is there.
    const title = board.columns[selection.column].cards[selection.card].title;
    const moved = moveCardToColumn(board, selection, column);
    // moveCardToColumn hands back the board it was given when the card is already there. Saying so
    // and writing nothing beats a silent success that touches the file.
    if (moved.board === board) return { ok: true, output: `${title} is already in ${board.columns[column].name}`, board: null };
    return { ok: true, output: `${title}  →  ${board.columns[column].name}`, board: moved.board };
  }

  if (command === 'set') {
    const [id, ...flagArgs] = rest;
    if (id === undefined) return { ok: false, message: 'set needs a card id' };
    const selection = selectionOf(board, id);
    if (selection === null) return { ok: false, message: `no card with id ${id}` };
    const read = readFlags(flagArgs, ['branch', 'pull-request', 'priority', 'notes']);
    if ('message' in read) return { ok: false, message: read.message };
    if (read.flags.size === 0) return { ok: false, message: 'set needs something to set' };
    const fields = withFields(board, selection, read.flags);
    if ('message' in fields) return { ok: false, message: fields.message };
    // Still where selectionOf found it: every field change edits the card in place.
    const card = fields.board.columns[selection.column].cards[selection.card];
    return {
      ok: true,
      output: [card.title, card.priority, ...flightParts(card)].join('  ·  '),
      board: fields.board,
    };
  }

  if (command === 'show') {
    const [id, ...extra] = rest;
    if (id === undefined) return { ok: false, message: 'show needs a card id' };
    if (extra.length > 0) return { ok: false, message: 'show takes nothing after the id' };
    const selection = selectionOf(board, id);
    if (selection === null) return { ok: false, message: `no card with id ${id}` };
    const column = board.columns[selection.column];
    return { ok: true, output: formatCard(column.name, column.cards[selection.card]), board: null };
  }

  if (command === 'comment') {
    const [id, body, ...extra] = rest;
    if (id === undefined || body === undefined) return { ok: false, message: 'comment needs a card id and something to say' };
    if (extra.length > 0) return { ok: false, message: 'comment takes one piece of text; quote it' };
    const selection = selectionOf(board, id);
    if (selection === null) return { ok: false, message: `no card with id ${id}` };
    // The same rule the board's own box and parseCard hold a comment to. Without a word here `board
    // comment <id> ""` would answer as a success and append nothing.
    if (!isCommentBody(body)) return { ok: false, message: 'comment needs something to say' };
    const commented = addComment(board, selection, body);
    const card = commented.board.columns[selection.column].cards[selection.card];
    return { ok: true, output: `${card.title}  ·  ${commentCount(card)}`, board: commented.board };
  }

  return { ok: false, message: `no such command: ${command}\n\n${USAGE}` };
}

// Run twice when there is something to write: once on the board the caller opened, and again on the
// board as it stands a moment before the write. The app saves the whole file on every keystroke, so
// the board read at startup can be tens of milliseconds stale by the time the write goes out — and
// writing the whole file back from it puts the board from before that keystroke over the top of it.
// What that costs: somebody types a comment on a card and presses Escape while this is running, the
// write lands after them, and their line is gone off the screen they just typed it on.
//
// ponytail: read-then-write, so a save landing inside the last microseconds still wins. A lock is the
// next rung, when two writers are common enough to hit that window.
export function runBoardCommandOnLatest(
  board: Board,
  args: readonly string[],
  readAgain: () => Board,
): CommandResult {
  const opened = runBoardCommand(board, args);
  if (!opened.ok || opened.board === null) return opened;
  return runBoardCommand(readAgain(), args);
}

// Which of a thrown error's two faces the terminal gets. Every fs failure carries an errno `code`, and
// those are the ones a sentence answers: nothing about `EACCES: permission denied, open
// '.dashboard/board.json'` gets clearer with a stack. Anything without a code is a bug in here, and a
// bug printed as one sentence leaves an agent `Cannot read properties of undefined (reading 'title')`
// and no file to open, so those keep their stack. A throw that is not an Error at all has neither, and
// falls back to whatever it prints as.
// What board-cli-entry prints when isManagerHomeDirectory says the command was run from $HOME
// itself. Home is the manager's own folder, not a project — see projectRoot's comment in
// board-store.ts — so the message says why the command wrote nothing instead of seeding a board
// there.
export function homeDirectoryRefusal(): string {
  return 'the home directory is the manager\'s own folder — cd into a project first';
}

export function failureLine(error: unknown): string {
  const failure = error as NodeJS.ErrnoException | null;
  return (failure?.code ? failure.message : failure?.stack) ?? String(error);
}
