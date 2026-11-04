import { existsSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { orMissing, readText } from '../app/missing-file';
import { replaceFile } from '../app/replace-file';
import { isRecord } from '../../shared/app/is-record';
import type { Column } from '../../shared/board/board';
import { cardOrders, storedOrder } from './card-order';

// The board as files on disk: `.dashboard/board/columns.json` for the columns and their order, and one
// `.dashboard/board/cards/<id>.json` per card, holding the card, its column and its place in it. What a
// card means is board-store.ts's; this file only knows where the bytes go.
//
// One file per card because one file for the whole board was in 82 of 115 conflicted merges: every
// card branch rewrote it. Now a branch that adds a card adds a file, and one that moves a card rewrites
// that card's file and nothing else (card-order.ts is how), so two branches touching different cards
// merge with no conflict. columns.json changes only when a column is added, renamed or moved.

export const BOARD_FOLDER = 'board';
const CARDS_FOLDER = 'cards';
const COLUMNS_FILE = 'columns.json';
const CARD_SUFFIX = '.json';
// What a file that will not parse is renamed to, beside where it was.
export const BROKEN_SUFFIX = '.broken';

// What the folder holds, before board-store.ts decides what any of it means. `text` is every byte that
// was read, for the ids a card written without one is given — the same for the same files. brokenFiles
// is every file that did not parse: where this read set it aside, or, without salvage, where it still is.
export type StoredBoard = {
  columns: unknown;
  cards: Record<string, unknown>[];
  text: string;
  brokenFiles: string[];
};

// The id goes through encodeURIComponent, so a hand-written id with a `/` in it names a file in this
// folder and never one somewhere else.
function cardFileName(id: string): string {
  return `${encodeURIComponent(id)}${CARD_SUFFIX}`;
}

// The card files, in name order so a snapshot of the same files is the same string. Only `.json`: the
// temporary file replaceFile writes beside each one, and a `.broken` one set aside, are not cards.
function cardFileNames(cardsFolder: string): string[] {
  return (orMissing(() => readdirSync(cardsFolder)) ?? []).filter((name) => name.endsWith(CARD_SUFFIX)).sort();
}

// A card file read back: the record, with the id the file name carries when the file has none of its own.
// Throws for a file that is not one — not JSON, or JSON that is not an object — so a reader sets it aside
// and a writer leaves it where it is, both for the same files.
function storedCard(name: string, text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value)) throw new Error(`${name} is not a card`);
  return typeof value.id === 'string' ? value : { ...value, id: decodeURIComponent(name.slice(0, -CARD_SUFFIX.length)) };
}

// Where a file is set aside: `<file>.broken`, or `<file>.2.broken` and on when that is taken, so a card
// that breaks twice keeps both damaged copies. The first copy always has the plain name, which is what
// isCardSetAside looks for.
function setAsidePath(file: string): string {
  let candidate = `${file}${BROKEN_SUFFIX}`;
  for (let count = 2; existsSync(candidate); count += 1) candidate = `${file}.${count}${BROKEN_SUFFIX}`;
  return candidate;
}

// Whether this card's file has been set aside: the card is off the board because its file broke, not
// because anybody deleted it, and putting the file back brings it back.
export function isCardSetAside(folder: string, id: string): boolean {
  return existsSync(join(folder, CARDS_FOLDER, `${cardFileName(id)}${BROKEN_SUFFIX}`));
}

// Null when the folder holds no board: a project still on board.json, or with no board at all.
//
// A file that will not parse is the same as a board.json that will not parse, one card's worth: with
// `salvage` it is moved aside under `.broken` so the next write cannot replace it, and brokenFiles says
// where. Without, it is skipped and left where it is, for a look that must not change anything and for
// a write that gets committed, and brokenFiles names it there. Every read without salvage names it
// again, which is what a writer refusing on it needs: a rename would leave the next read clean and the
// tracked file gone, and `git add -A` would commit the card as deleted.
export function readBoardFolder(folder: string, salvage: boolean): StoredBoard | null {
  const cardsFolder = join(folder, CARDS_FOLDER);
  const names = cardFileNames(cardsFolder);
  const columnsText = readText(join(folder, COLUMNS_FILE));
  if (columnsText === null && names.length === 0) return null;
  const brokenFiles: string[] = [];
  function setAside(file: string): void {
    if (!salvage) {
      brokenFiles.push(file);
      return;
    }
    const target = setAsidePath(file);
    renameSync(file, target);
    brokenFiles.push(target);
  }

  let columns: unknown = null;
  if (columnsText !== null) {
    try {
      columns = JSON.parse(columnsText);
    } catch {
      setAside(join(folder, COLUMNS_FILE));
    }
  }
  const cards: Record<string, unknown>[] = [];
  let text = columnsText ?? '';
  for (const name of names) {
    const cardText = readText(join(cardsFolder, name));
    if (cardText === null) continue;
    text += `\0${name}\0${cardText}`;
    try {
      cards.push(storedCard(name, cardText));
    } catch {
      setAside(join(cardsFolder, name));
    }
  }
  return { columns, cards, text, brokenFiles };
}

// What the folder holds, as one string, for the watcher to compare against what the app last wrote.
// Not a format anybody parses: only ever compared with another snapshot, which is why writeBoardFolder
// builds its own from the bytes it wrote with this same function rather than reading them back.
function snapshotOf(columnsText: string | null, cards: readonly (readonly [string, string])[]): string | null {
  if (columnsText === null && cards.length === 0) return null;
  return [columnsText ?? '', ...cards.map(([name, text]) => `${name}\0${text}`)].join('\0');
}

export function boardFolderSnapshot(folder: string): string | null {
  const cardsFolder = join(folder, CARDS_FOLDER);
  const cards = cardFileNames(cardsFolder).map((name) => [name, readText(join(cardsFolder, name)) ?? ''] as const);
  return snapshotOf(readText(join(folder, COLUMNS_FILE)), cards);
}

// Writes only the files whose bytes change, then removes the cards that are gone. In that order, so a
// write that stops part way leaves every card on disk at least once — twice at worst, never not at all.
// Answers with the snapshot of what the folder now holds.
//
// Only a file that read back as a card is removed. One that does not parse is not on the board this
// write was handed, because peekBoard skipped it, and that absence is not a deletion: removing it would
// take the card and its bytes both, with nothing set aside and nothing said.
export function writeBoardFolder(folder: string, columns: readonly Column[]): string {
  const cardsFolder = join(folder, CARDS_FOLDER);
  const onDisk = new Map<string, string>();
  const previous = new Map<string, { column: unknown; order: unknown }>();
  const removable = new Set<string>();
  for (const name of cardFileNames(cardsFolder)) {
    const text = readText(join(cardsFolder, name));
    if (text === null) continue;
    onDisk.set(name, text);
    try {
      const card = storedCard(name, text);
      previous.set(card.id as string, { column: card.column, order: card.order });
      removable.add(name);
    } catch {
      // A file that does not parse has no place to keep; the card it was is rewritten below if it is on the board.
    }
  }

  const wanted = new Map<string, string>();
  for (const column of columns) {
    const orders = cardOrders(column.cards.map((card) => {
      const was = previous.get(card.id);
      return { id: card.id, previous: was?.column === column.name ? storedOrder(was.order) : undefined };
    }));
    column.cards.forEach((card, index) => {
      wanted.set(cardFileName(card.id), `${JSON.stringify({ ...card, column: column.name, order: orders[index] }, null, 2)}\n`);
    });
  }

  for (const [name, text] of wanted) {
    if (onDisk.get(name) !== text) replaceFile(join(cardsFolder, name), text);
  }
  const columnsText = `${JSON.stringify({ columns: columns.map((column) => column.name) }, null, 2)}\n`;
  const columnsFile = join(folder, COLUMNS_FILE);
  if (readText(columnsFile) !== columnsText) replaceFile(columnsFile, columnsText);
  for (const name of removable) {
    if (!wanted.has(name)) rmSync(join(cardsFolder, name), { force: true });
  }
  return snapshotOf(columnsText, [...wanted].sort(([first], [second]) => (first < second ? -1 : first > second ? 1 : 0))) ?? '';
}
