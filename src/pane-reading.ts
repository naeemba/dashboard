import { baseName } from './base-name';
import { paneLabel } from './terminals';

// What can be read off one of a project's panes, and what three screens make of it. Nothing here
// touches a file or a git command, which is the point: main takes the reading off the pty, and the
// command screen and the close ask for it over `panes:read` and decide with these same functions. Kept
// out of ship.ts for that reason — ship.ts reaches for node:path and board-store.ts, and a renderer
// that imports it drags the main process's board writer into its own bundle.

// What a pane was asked to run and where. main holds one of these per pane; this is the shape of a row
// in that map, here because what the shape means to every reader of it is decided here.
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
export type PaneReading = {
  foreground: string | undefined;
  shell: string | undefined;
  command: PaneCommand | undefined;
  inWorktree: boolean;
};

// One pane as `panes:read` answers with it: the reading above with one field added, and both fields
// are main's — what the pty has in the foreground, and whether there is still a pty at all. Here
// rather than in free-pane.ts because it is the shape on the wire, which main and bridge.ts have to
// name as well as the two screens that decide from it, and this is the module both processes import.
export type PaneUse = PaneReading & { exited: boolean };

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
export function paneIsBusy(pane: PaneReading): boolean {
  return runsAnAgent(pane.command) || runsAProgram(pane.foreground, pane.shell);
}

// What a ship counts as free, which is the whole of its pick apart from the order. Spelled here
// because three places ask it — the ship's own pane, the pane the review is handed, and the test that
// pins the order — and they have to stay one answer. Give one of them its own copy, then change what a
// ship will take, and the two halves of one keystroke disagree: the review is handed a pane the ship
// then refuses with `every pane in api is in use`.
//
// A dead pane counts. A ship spawns a shell in whatever pane it takes, so a pane whose shell has gone
// is the best one it could have — which is the one thing this and the command screen's paneIsFree
// differ on.
export function shipCanTake(pane: PaneReading): boolean {
  return !paneIsBusy(pane);
}

// Which of a project's panes to take, or null when there is none. The order is the whole of it, and it
// is the half two pickers have to agree on: a ship takes a pane here, and the command screen types a
// line into one, and a user who watched a ship step around terminal 1 expects the line to step around
// it too.
//
// The lowest-numbered free pane, except that a pane still standing in a worktree goes last. Its agent
// has exited and handed the pane back, so it is free — but the shell in it is sitting in that checkout
// under the agent's transcript. A ship kills the shell in the pane it takes, so lowest-first on its own
// takes terminal 1 back from the card you are reading while terminals 2 to 5 sit at empty prompts; the
// command screen would run your `npm test` in that card's checkout rather than the project's.
//
// What counts as free is the caller's, because the two do not agree on a dead pane and should not: a
// ship spawns a shell in the pane it takes, so a pane whose shell has gone is the best one it could
// have, while a line typed at a pane with no shell behind it goes nowhere at all. shipCanTake above is
// the ship's answer and free-pane.ts holds the command screen's; both are built on paneIsBusy.
export function freePane<Pane extends { inWorktree: boolean }>(
  panes: readonly Pane[],
  isFree: (pane: Pane) => boolean,
): number | null {
  const free = panes.map((pane, index) => ({ pane, index })).filter(({ pane }) => isFree(pane));
  return (free.find(({ pane }) => !pane.inWorktree) ?? free[0])?.index ?? null;
}

// What was seen running in a pane, for a refusal that names it rather than leaving you to go and look.
// Two refusals print it — the ship's, below, and the close's in close-project.ts — so it is said once:
// give the close its own copy and the two describe the same pane differently, `terminal 3 npm` against
// `terminal 3 an agent`, with nothing failing. The empty string is unreachable for a pane paneIsBusy
// called busy, which is the only pane either refusal asks about.
export function programIn(pane: PaneReading): string {
  return runsAnAgent(pane.command) ? 'an agent' : pane.foreground ?? '';
}

// Why the ship could not have one, named rather than counted — the same states the refusal was decided
// on, so what this lists is exactly what stopped it. Each pane says what was seen running in it, because
// the answer is a reading taken the moment you pressed the key: a ship refused by a prompt hook that was
// still going says `terminal 3 git` rather than leaving you to wonder which pane it meant.
export function busyPanes(panes: readonly PaneReading[]): string {
  return panes
    .flatMap((pane, index) => (paneIsBusy(pane) ? [`${paneLabel(index)} ${programIn(pane)}`] : []))
    .join(', ');
}

