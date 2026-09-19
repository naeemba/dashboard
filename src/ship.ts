import { basename, dirname, join } from 'node:path';
import { BOARD_DIRECTORY } from './board-store';

// Every decision the ship makes that is not git's or Electron's. The handlers in main.ts run the
// commands; what to call things and what counts as being in the way is here, where a test can pin it.
//
// Which pane to take is next door, in pane-reading.ts, with the rest of what a pane can be asked. The
// command screen and the close ask the same questions of a pane now, and they run in the renderer —
// which cannot import this file, because BOARD_DIRECTORY drags board-store.ts and node:fs in with it.

// How long a branch name may get. Past this the card id on the end pushes it out of what a shell
// prompt shows, and a branch you cannot read is a branch you check out by mistake.
const BRANCH_LIMIT = 48;
// How many characters of the card id disambiguate two cards with the same title.
const ID_LENGTH = 4;
// slug() cannot wait to find out whether a collision is coming before it cuts the title down — by
// then the id suffix is already decided. So it reserves the hyphen and the id up front and cuts to
// that shorter length always, not only on the collision path.
const BASE_LIMIT = BRANCH_LIMIT - (ID_LENGTH + 1);

function slug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, BASE_LIMIT)
    // Again after the cut: slicing mid-word can land the last character on a hyphen, and git accepts
    // a branch ending in one while nothing else about it reads as a name.
    .replace(/-+$/, '');
}

// The branch a card's work goes on. The title, or the card id when the title has no Latin letters in
// it — a card written in Persian slugifies to nothing, and a branch has to be called something.
//
// `taken` is every branch the repository already has. A second card with the same title gets four
// characters of its id; two cards whose titles slugify the same and whose ids also share those four
// characters get a number, which is as far as this bothers to go.
export function branchNameFor(title: string, cardId: string, taken: readonly string[]): string {
  const short = cardId.replace(/-/g, '').slice(0, ID_LENGTH);
  const base = slug(title) || `card-${short}`;
  if (!taken.includes(base)) return base;
  const withId = `${base}-${short}`;
  if (!taken.includes(withId)) return withId;
  // Getting here means the title's slug and that slug plus four id characters are both already
  // taken — two different cards colliding on both. Rare enough that the number on the end is let
  // run past BRANCH_LIMIT rather than reserving room a title will almost never need.
  for (let attempt = 2; attempt < 100; attempt += 1) {
    const candidate = `${withId}-${attempt}`;
    if (!taken.includes(candidate)) return candidate;
  }
  throw new Error(`a hundred branches are already called ${base}`);
}

// Beside the project, never inside it. Nothing to add to a .gitignore, nvim and ripgrep in the real
// checkout never walk into it, and a delete under dashboard.worktrees/ cannot reach dashboard/.
//
// Its own function because two questions need it and only one of them is making a worktree: the token
// figures have to count a session that ran in a worktree towards the project it came from, and a
// second spelling of where the folder goes is one that stops agreeing the day the layout changes.
export function worktreesRoot(projectPath: string): string {
  // Through basename and dirname rather than string work, so a trailing slash does not turn
  // /Users/sharp/work/api/ into a folder called ".worktrees".
  return join(dirname(projectPath), `${basename(projectPath)}.worktrees`);
}

export function worktreePathFor(projectPath: string, branch: string): string {
  return join(worktreesRoot(projectPath), branch);
}

// What the agent shipping a card is asked to do: the one command, and the card it is aimed at. A
// function rather than the string spelled out at each call site, because a ship writes it twice — once
// when it starts and once when it is finished after stopping part way — and two copies drift.
export function workPrompt(cardId: string): string {
  return `/work-card ${cardId}`;
}

// Every file `git status --porcelain` named, whatever it is. This is git's own answer, so it is the
// one to ask wherever git is the thing doing the refusing: `git worktree remove` counts the whole
// working tree and will not be talked out of it.
//
// What asking the narrower question there costs, and it is the bug this split was written for: a
// worktree whose only change is the board move the agent has just written passes the app's check,
// so nothing is refused and nothing is listed — and then git refuses anyway, and the only thing left
// to put on the card is a raw `fatal: ... contains modified or untracked files`.
export function changedFiles(porcelain: string): string[] {
  return porcelain
    .split('\n')
    // `XY path`, so the path starts at column 3. A rename is `XY old -> new`, but only a rename —
    // splitting on ' -> ' unconditionally would misread a plain add of a file literally named
    // "a -> b.ts" as one.
    .filter((line) => line.length > 3)
    .map((line) => (line.slice(0, 2).includes('R') ? line.slice(3).split(' -> ').pop() ?? '' : line.slice(3)))
    // git quotes a path with a space or a non-ASCII character in it.
    .map((path) => path.replace(/^"|"$/g, ''))
    .filter((path) => path !== '');
}

// The changed files that stop a ship. The refusal and the message that explains it both call this, so
// the count on screen is exactly the list that caused it.
//
// .dashboard/ is the one exemption, and the whole folder rather than board.json alone. A project
// that has never committed the folder is reported as the single line `?? .dashboard/` — git collapses
// an untracked directory to its name and never lists what is inside — and that line is not the board
// file's path, so exempting only the file refuses every ship on a new project, which is every project
// until someone commits the folder the app itself wrote.
//
// The app rewrites board.json on every keystroke — the Ship move that started this very ship is in it
// — so counting it would mean the ship always refuses itself. The rest of the folder is the app's own
// explanation files. Nothing in the flow touches the project's checkout: the worktree is cut from
// origin and the board it reads and commits is the worktree's own.
export function blockingChanges(porcelain: string): string[] {
  return changedFiles(porcelain).filter((path) => !path.startsWith(`${BOARD_DIRECTORY}/`));
}

// How many of them there are, for the ship's refusal — the one place a count is worth printing,
// because somebody pressed a key and is waiting on the answer in the status bar. The refusals nobody
// is watching say it without a number: the review's line lands on a card and is written again on
// every tick, so a count in it is a new sentence each time the agent saves another file.
export function uncommittedCount(files: readonly string[]): string {
  return `${files.length} uncommitted file${files.length === 1 ? '' : 's'}`;
}

// Runs what is handed to it one at a time per key, in the order the calls arrived.
//
// The key a ship uses is the project. git locks the repository's index for the whole of `worktree add`
// and again for the commit, so two ships of different cards in one project end with the second dying
// on .git/index.lock in git's own words — with its card already sitting in Ship on the board. Both are
// wanted, so the second waits instead of being refused: refusing it is the same lost ship with a retry
// bolted on. Two ships of the *same* card are a different thing and are still refused outright, by the
// caller, before they reach here.
//
// Waiting also settles the branch names. Both ships read the repository's branches to pick a name that
// is not taken, and run together they read the same list and can pick the same one.
export function oneAtATime(): <T>(key: string, run: () => Promise<T>) => Promise<T> {
  const tails = new Map<string, Promise<unknown>>();
  return <T>(key: string, run: () => Promise<T>): Promise<T> => {
    // Both arms are `run`: what the one before it answered is nothing to do with whether this one goes,
    // and a failed ship must not wedge the project's queue for the rest of the run.
    const next = (tails.get(key) ?? Promise.resolve()).then(run, run);
    // The stored copy has its rejection already claimed, or a ship that throws would be an unhandled
    // rejection the moment nobody is waiting behind it. The caller still gets `next` itself.
    tails.set(key, next.then(() => undefined, () => undefined));
    return next;
  };
}
