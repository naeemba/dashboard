import { readdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
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
// was read, for the ids a card written without one is given — the same for the same files.
export type StoredBoard = {
  columns: unknown;
  cards: Record<string, unknown>[];
  text: string;
  brokenFile: string | null;
};

// The id goes through encodeURIComponent, so a hand-written id with a `/` in it names a file in this
// folder and never one somewhere else.
function cardFileName(id: string): string {
  return `${encodeURIComponent(id)}${CARD_SUFFIX}`;
}

// A missing file is null; every other failure is thrown, for the reason board-store.ts's readBoard gives.
export function readText(file: string): string | null {
  try {
    return readFileSync(file, 'utf8');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

// The card files, in name order so a snapshot of the same files is the same string. Only `.json`: the
// temporary file replaceFile writes beside each one, and a `.broken` one set aside, are not cards.
function cardFileNames(cardsFolder: string): string[] {
  try {
    return readdirSync(cardsFolder).filter((name) => name.endsWith(CARD_SUFFIX)).sort();
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

// A card file read back: the record, with the id the file name carries when the file has none of its own.
function storedCard(name: string, text: string): Record<string, unknown> | null {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value)) return null;
  return typeof value.id === 'string' ? value : { ...value, id: decodeURIComponent(name.slice(0, -CARD_SUFFIX.length)) };
}

// Null when the folder holds no board: a project still on board.json, or with no board at all.
//
// A file that will not parse is the same as a board.json that will not parse, one card's worth: with
// `salvage` it is moved aside under `.broken` so the next write cannot replace it, and brokenFile says
// where. Without, it is skipped and left where it is, for a look that must not change anything.
export function readBoardFolder(folder: string, salvage: boolean): StoredBoard | null {
  const cardsFolder = join(folder, CARDS_FOLDER);
  const names = cardFileNames(cardsFolder);
  const columnsText = readText(join(folder, COLUMNS_FILE));
  if (columnsText === null && names.length === 0) return null;
  let brokenFile: string | null = null;
  function setAside(file: string): void {
    if (!salvage) return;
    renameSync(file, `${file}${BROKEN_SUFFIX}`);
    brokenFile ??= `${file}${BROKEN_SUFFIX}`;
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
      const card = storedCard(name, cardText);
      if (card) cards.push(card);
    } catch {
      setAside(join(cardsFolder, name));
    }
  }
  return { columns, cards, text, brokenFile };
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
export function writeBoardFolder(folder: string, columns: readonly Column[]): string {
  const cardsFolder = join(folder, CARDS_FOLDER);
  const onDisk = new Map<string, string>();
  const previous = new Map<string, { column: unknown; order: unknown }>();
  for (const name of cardFileNames(cardsFolder)) {
    const text = readText(join(cardsFolder, name));
    if (text === null) continue;
    onDisk.set(name, text);
    try {
      const card = storedCard(name, text);
      if (card) previous.set(card.id as string, { column: card.column, order: card.order });
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
  for (const name of onDisk.keys()) {
    if (!wanted.has(name)) rmSync(join(cardsFolder, name), { force: true });
  }
  return snapshotOf(columnsText, [...wanted].sort(([first], [second]) => (first < second ? -1 : first > second ? 1 : 0))) ?? '';
}
