import { readFileSync } from 'node:fs';
import { replaceFile } from './board-store';

// What is in flight right now: one entry per worktree the app has made. Kept beside session.json and
// recents.json in the app's own folder rather than in the project, because it describes checkouts on
// this machine. Nothing here is ever committed, so it can never take part in a merge.
//
// The board on main says what has been merged. This file is what stops that being the whole truth on
// screen: a card whose work is under way draws its badge from here.
export type WorktreeEntry = {
  cardId: string;
  title: string;
  projectPath: string;
  branch: string;
  worktreePath: string;
  // The pane running the agent, or null when the worktree was made and every pane was already in
  // use. Null is a real state, not a missing field.
  pane: number | null;
  startedAt: string;
  // Whether this is the review worktree rather than the one the card was worked in. The two look the
  // same on disk — same project, same card, same branch — and only this says which agent is in there,
  // so without it the sweep that starts a review would find the review it just started and start
  // another one, every five seconds, for as long as the app is open.
  reviewing: boolean;
};

const TEXT_FIELDS = ['cardId', 'title', 'projectPath', 'branch', 'worktreePath', 'startedAt'] as const;

function isPane(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

// Every field but the pane names something the entry cannot do without: which card, which folder,
// which branch. One of them missing leaves a row that cannot be drawn, jumped to or removed, so the
// entry goes rather than sitting there doing nothing.
function toEntry(stored: unknown): WorktreeEntry | null {
  const record = (stored ?? {}) as Record<string, unknown>;
  if (TEXT_FIELDS.some((field) => typeof record[field] !== 'string' || record[field] === '')) return null;
  return {
    cardId: record.cardId as string,
    title: record.title as string,
    projectPath: record.projectPath as string,
    branch: record.branch as string,
    worktreePath: record.worktreePath as string,
    pane: isPane(record.pane) ? record.pane : null,
    startedAt: record.startedAt as string,
    // Anything but true reads as false, so a file written before this field existed describes what it
    // actually holds: worktrees a card was worked in, none of them a review.
    reviewing: record.reviewing === true,
  };
}

export function parseWorktrees(stored: unknown): WorktreeEntry[] {
  const { entries } = (stored ?? {}) as { entries?: unknown };
  return (Array.isArray(entries) ? entries : []).flatMap((entry) => toEntry(entry) ?? []);
}

// No file at all is the ordinary "nothing shipped yet" case, and text that is not JSON is the same
// answer for a different reason: those bytes name no folder anyone can get back, and `git worktree
// list` is what rebuilds from there.
//
// Every other reason the read can fail is a failure and is thrown. Answer an EMFILE or an EIO with an
// empty list and launch writes that emptiness straight back over the file: three worktrees still
// sitting on disk drop off the worktree list, and shipping one of those cards again makes a second
// branch and a second folder beside the first — the orphan this file exists to prevent.
export function readWorktrees(file: string): WorktreeEntry[] {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return [];
  }
  try {
    return parseWorktrees(JSON.parse(text));
  } catch {
    return [];
  }
}

// Written the way every other file the dashboard keeps is: to a temporary file beside it, then renamed
// over it. Straight into place, the app is the one thing most likely to produce the unreadable file
// the read above has to answer for — a crash or a full disk halfway through leaves half a record.
//
// A write that fails is still swallowed, unlike a read: it happens at the end of a ship whose branch,
// folder and agent are all already there, and throwing would fail the ship over the one part of it
// that can be done again.
export function writeWorktrees(file: string, entries: WorktreeEntry[]): void {
  try {
    replaceFile(file, JSON.stringify({ entries }, null, 2));
  } catch {
    // Nothing recorded this time.
  }
}

export function entryForCard(
  entries: readonly WorktreeEntry[],
  cardId: string,
): WorktreeEntry | undefined {
  return entries.find((entry) => entry.cardId === cardId);
}

export function entryForPath(
  entries: readonly WorktreeEntry[],
  worktreePath: string,
): WorktreeEntry | undefined {
  return entries.find((entry) => entry.worktreePath === worktreePath);
}

// One entry per card. The ship writes twice — once when the worktree exists, again when a pane has
// taken it — and the second write must replace the first rather than making a second row.
export function withEntry(entries: readonly WorktreeEntry[], entry: WorktreeEntry): WorktreeEntry[] {
  const others = entries.filter((existing) => existing.cardId !== entry.cardId);
  return [...others, entry];
}

export function withoutWorktree(
  entries: readonly WorktreeEntry[],
  worktreePath: string,
): WorktreeEntry[] {
  return entries.filter((entry) => entry.worktreePath !== worktreePath);
}

// A worktree removed by hand — `git worktree remove`, or an `rm -rf` — must not leave its card marked
// as in flight forever, refusing every later ship of it with nothing on screen able to clear it.
export function livingEntries(
  entries: readonly WorktreeEntry[],
  exists: (path: string) => boolean,
): WorktreeEntry[] {
  return entries.filter((entry) => exists(entry.worktreePath));
}

// Whether a worktree is still the app's to keep, which is not the same question as whether its folder
// is there. `git worktree remove` unlinks the folder before it answers, so a sweep landing in that gap
// reads a living record as dead, hands its pane back to the project, and the kill that follows the
// removal then finds no pane in the worktree — leaving the agent running in a folder git has just
// deleted, writing errors into a pane the app counts as free. A path a removal is part way through is
// that handler's to drop, not the sweep's.
export function stillLiving(
  removing: ReadonlySet<string>,
  exists: (path: string) => boolean,
): (path: string) => boolean {
  return (path) => removing.has(path) || exists(path);
}

// One record giving its pane up. `reviewing` goes with the pane, because it is a sentence about the
// shell that has just died: it says the agent in this pane is reviewing rather than working. Left set
// on a record with no pane, it is a review nothing is running — the badge reads reviewing forever, the
// sweep skips the card, and shipping it again starts a work agent where a review belonged. Cleared,
// the sweep finds the card on its next tick and reviews it again, which is what a review whose shell
// died means.
//
// Its own function because three places hand a pane back — launch, a project closing, and a ship
// taking the pane off another card's record — and a copy of this that forgot the flag would be that
// bug again in the one place nobody looked.
export function withoutPane(entry: WorktreeEntry): WorktreeEntry {
  return { ...entry, pane: null, reviewing: false };
}

// Records giving their pane up, because the shell it named is not there any more: every record at
// launch, since no shell outlives the app, and one project's records when that project is closed. Both
// are the same sentence about the same fact, so both ask this rather than each rewriting it.
// A record with no pane is also the one ship that is allowed to run again, which is what hands the
// worktree back: shipping the card once more gives the folder that is already there a fresh pane.
export function withoutPanes(
  entries: readonly WorktreeEntry[],
  projectPath?: string,
): WorktreeEntry[] {
  return entries.map((entry) => (
    projectPath === undefined || entry.projectPath === projectPath ? withoutPane(entry) : entry
  ));
}

// The record giving a pane up, when a ship comes to take it. The project is half the address: pane
// numbers are per project — terminalId scopes them and freePane counts within one slot — so a match
// on the number alone hands one project's ship the record of a card working in another.
//
// What that costs, with `api` at slot 0 and `web` at slot 1: you ship in `web`, it takes pane 0, and
// the card running in `api`'s pane 0 loses its record. Its agent is still going, but Enter on the
// card's row in the worktree list says nothing of it is running, and the already-shipped refusal
// stops refusing — so moving the card back into Ship starts a second agent beside the first.
export function claimsPane(
  entries: readonly WorktreeEntry[],
  projectPath: string,
  pane: number,
  cardId: string,
): WorktreeEntry | undefined {
  return entries.find((entry) => entry.projectPath === projectPath
    && entry.pane === pane && entry.cardId !== cardId);
}

// Whether a rewrite of the record is worth writing down and telling the screen about. Not every writer
// knows: closing a project asks every record of that project to give its pane up, and a project that
// never shipped a card hands back exactly what it was given.
//
// Order counts, and that is the cheap side of the trade: withEntry moves the card it rewrites to the
// end, so re-recording a card with nothing changed about it can still say yes. One redraw too many
// costs a frame; one too few leaves a card naming a worktree that is gone.
export function worktreesDiffer(
  before: readonly WorktreeEntry[],
  after: readonly WorktreeEntry[],
): boolean {
  return JSON.stringify(before) !== JSON.stringify(after);
}
