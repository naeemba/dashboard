import { basename, dirname, join } from 'node:path';
import { baseName } from './base-name';
import { BOARD_DIRECTORY } from './board-store';
import { paneLabel } from './terminals';

// Every decision the ship makes that is not git's or Electron's. The handlers in main.ts run the
// commands; what to call things, which pane to take and what counts as being in the way is here,
// where a test can pin it.

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

// What a pane was asked to run and where. main holds one of these per pane; this is the shape of a row
// in that map, here because what the shape means to a ship is decided here.
export type PaneCommand = { args: string[] | 'editor'; directory: string };

// An agent's pane, which is the only one carrying a command of its own. The five terminals run nothing
// — an empty array — and the editor's args are the string 'editor', which is not a command but a note
// saying to work nvim's out at spawn time, so that quitting nvim leaves a pane Enter starts it in
// again. Counting either as an agent's would take a pane out of the ship's reach for good.
export function runsAnAgent(command: PaneCommand | undefined): command is PaneCommand {
  return command !== undefined && command.args !== 'editor' && command.args.length > 0;
}

// One pane of a project as a ship sees it. `foreground` is what the pty says is running in the pane at
// the moment it is asked — the shell itself when the pane is sitting at a prompt, and undefined when the
// shell has gone. `shell` is the shell this pane was spawned with. `command` is what the pane was asked
// to run. `inWorktree` is the pane still standing in a card's checkout rather than the project.
//
// The shell is the pane's own, not the setting. The setting changes under panes that are already
// running, and its own screen says so: a pane started as zsh is still zsh after you switch the setting
// to bash. Comparing the pty's answer against the setting would read all five panes of every open
// project as running a program the moment you changed it, and refuse every ship until each project was
// closed and reopened. A pane respawned after the change really is on the new shell, and the pane's own
// record gets that right too.
export type PaneState = {
  foreground: string | undefined;
  shell: string | undefined;
  command: PaneCommand | undefined;
  inWorktree: boolean;
};

// What the pty reports against the shell the pane was started as, compared on the last segment because
// the two are spelled differently at each end: the pane is spawned with `/bin/zsh` and the pty answers
// `zsh`. A pane waiting at a prompt reports the shell itself; anything else is a program you started.
//
// A reading, not a record, so it is exactly as true as the pane is — and that is the point. The pane's
// use was tracked before, and what was tracked was whether you had ever pressed a key in it, which
// nothing ever took back: pressing Ctrl+L in the five terminals to tidy them marked all five as in use
// for the rest of the run, and every ship after that was refused with five empty prompts on screen.
//
// The reading is unix-only. main's foregroundOf answers nothing on Windows, where the pty reports its
// terminal type rather than a foreground process, so every pane there is free and only the agent record
// keeps one.
//
// Two things read as a prompt without being one, and a ship takes the pane and kills the shell in it.
//
// A line you have typed and not submitted: what is lost is a command you had not run yet.
//
// A job you put in the background — `npm run dev &` — is the expensive one. The shell is back at its
// prompt, so the foreground is the shell and this answers false; ship a card, the pane is taken, and
// the dev server goes down with the shell, with nothing on screen having said that pane was doing
// anything. What would catch it is reading the shell's children rather than its foreground, and that
// is not done here because a shell at an empty prompt has children on a real machine: powerlevel10k
// leaves a gitstatusd running under every zsh for the life of the shell. Counting any child would put
// all five panes permanently in use from launch — the same dead end the typed-pane mark produced,
// which is what this change exists to remove. Telling a prompt's daemon from a job you started means
// reading the process group rather than the parent, and that is its own piece of work.
//
// help.ts says both out loud, because the ship's blurb is where someone learns what a ship can take.
function runsAProgram(foreground: string | undefined, shell: string | undefined): boolean {
  // No shell recorded means no pty was ever spawned, which is the same nothing-is-running answer an
  // undefined foreground gives.
  return foreground !== undefined && shell !== undefined && baseName(foreground) !== baseName(shell);
}

// Whether a pane is somebody's, which is what a ship asks before it takes one. Two ways to be: an agent
// is recorded in it, or its shell is running something right now.
export function paneIsBusy(pane: PaneState): boolean {
  return runsAnAgent(pane.command) || runsAProgram(pane.foreground, pane.shell);
}

// The pane a ship takes: the lowest-numbered one nobody is using, or null when every one is taken.
//
// A pane still standing in a worktree goes last. Its agent has exited and handed the pane back, so it is
// free — but the shell in it is sitting in that checkout under the agent's transcript, and a ship kills
// the shell in the pane it takes. Lowest-first on its own takes terminal 1 back from the card you are
// reading while terminals 2 to 5 sit at empty prompts.
export function freePane(panes: readonly PaneState[]): number | null {
  const free = panes
    .map((pane, index) => ({ pane, index }))
    .filter(({ pane }) => !paneIsBusy(pane));
  return (free.find(({ pane }) => !pane.inWorktree) ?? free[0])?.index ?? null;
}

// Why the ship could not have one, named rather than counted — the same states the refusal was decided
// on, so what this lists is exactly what stopped it. Each pane says what was seen running in it, because
// the answer is a reading taken the moment you pressed the key: a ship refused by a prompt hook that was
// still going says `terminal 3 git` rather than leaving you to wonder which pane it meant.
export function busyPanes(panes: readonly PaneState[]): string {
  return panes
    .flatMap((pane, index) => (paneIsBusy(pane)
      ? [`${paneLabel(index)} ${runsAnAgent(pane.command) ? 'an agent' : pane.foreground}`]
      : []))
    .join(', ');
}

// The changed files that stop a ship, read from `git status --porcelain`. The refusal and the message
// that explains it both call this, so the count on screen is exactly the list that caused it.
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
  return porcelain
    .split('\n')
    // `XY path`, so the path starts at column 3. A rename is `XY old -> new`, but only a rename —
    // splitting on ' -> ' unconditionally would misread a plain add of a file literally named
    // "a -> b.ts" as one.
    .filter((line) => line.length > 3)
    .map((line) => (line.slice(0, 2).includes('R') ? line.slice(3).split(' -> ').pop() ?? '' : line.slice(3)))
    // git quotes a path with a space or a non-ASCII character in it.
    .map((path) => path.replace(/^"|"$/g, ''))
    .filter((path) => path !== '' && !path.startsWith(`${BOARD_DIRECTORY}/`));
}

// How many of them there are, said the same way wherever it is said. Two refusals read this list —
// the ship's, and the review's when it will not throw a worktree away — and the app saying "2 files
// uncommitted" in one place and "2 uncommitted files" in the other is one condition wearing two faces.
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
