import { EDITOR_INDEX, branchOfPane, paneLabel } from './terminals';
import { paneTokens } from './usage';
import type { Mode } from './modes';

// What the right-hand end of the status bar says: which view you are on, and for terminals which pane
// has the keyboard and which checkout that pane is looking at.
//
// Out of renderer.ts because it is a decision with branches in it rather than wiring, and because a
// pane on a worktree is exactly the case where the wrong answer costs something: five panes all
// reading "terminal 3" with two of them in worktrees is how a command lands in the wrong checkout.
//
// Every field is a value already resolved by the caller — module state such as settings and the
// current board never comes in as itself, so every branch below is reachable from plain values in a
// test.
export type StatusPage = {
  mode: Mode;
  focused: number;
  paneCount: number;
  boardLabel: string;
  hasProjects: boolean;
  managerStatusLabel: string;
  commandStatusLabel: string;
  pickerBinding: string;
  pickerDescription: string;
  worktrees: readonly { worktreePath: string; branch: string }[];
  // Where the focused pane's shell is, which is what says whether it is in a worktree. The pane
  // number is not enough: two panes can be in one checkout and a record names only one of them.
  focusedDirectory: string;
  // What the focused pane calls itself, worked out by paneName, or undefined for a pane nobody and
  // nothing has named. Resolved by the caller like everything else here, because it comes off a live
  // pane and this file never touches one.
  focusedName?: string;
  // The same for the editor, which is the focused pane on the nvim screen and is not in `panes`. Its
  // own field rather than folded into the one above, because the two screens read different panes and
  // the caller knows which is which without being told the mode twice.
  editorName?: string;
  // What the agent in the focused pane has cost so far, or nought for a pane running no agent. The
  // right-hand end of the bar is the only thing on a project's screen that names one pane, so it is
  // where the one pane's figure belongs.
  focusedTokens: number;
};

// The manager is where a launch with nothing saved lands, and with no project open there is nothing on
// screen saying how to open one. Both halves are read fresh on every redraw, so rebinding the key or
// rewording the action rewrites the sentence rather than leaving it naming a key that now does
// something else.
export function managerLabel(
  hasProjects: boolean,
  managerStatusLabel: string,
  pickerBinding: string,
  pickerDescription: string,
): string {
  if (hasProjects) return managerStatusLabel;
  return `${pickerBinding} · ${pickerDescription}`;
}

export function modeLabel(page: StatusPage): string {
  if (page.mode === 'manager') {
    return managerLabel(page.hasProjects, page.managerStatusLabel, page.pickerBinding, page.pickerDescription);
  }
  // nvim names the pane after whatever file it has open, through the same title escape sequence a
  // shell uses, so this goes through paneLabel like every other pane rather than answering a bare
  // 'nvim'. Say it here and not there, and the manager's row reads `nvim · board.json` while the
  // status bar on that very screen says `nvim` — one pane with two answers.
  if (page.mode === 'nvim') return paneLabel(EDITOR_INDEX, undefined, page.editorName);
  if (page.mode === 'board') return `board · ${page.boardLabel}`;
  if (page.mode === 'command') return page.commandStatusLabel;
  if (page.paneCount === 0) return '';
  const label = paneLabel(page.focused, branchOfPane(page.worktrees, page.focusedDirectory), page.focusedName);
  // Added rather than folded into paneLabel: that is the one spelling of what a pane is called, and a
  // running total is not part of a name. The manager's rows and the bell's notification both print
  // the label, and neither wants a number that moves every half minute in the middle of it.
  const tokens = paneTokens(page.focusedTokens);
  return tokens === '' ? label : `${label} · ${tokens}`;
}

// The mode, then the panes that rang while you were elsewhere. The tab strip only has room for the
// project name, so without the names here you would arrive at a yellow project and have to walk all
// six panes watching for the yellow to go out.
export function terminalStatus(page: StatusPage, waitingPaneNames: readonly string[]): string {
  if (waitingPaneNames.length === 0) return modeLabel(page);
  return `${modeLabel(page)} · ${waitingPaneNames.join(', ')} waiting`;
}
