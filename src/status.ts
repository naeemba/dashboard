import { branchOfPane, paneLabel } from './terminals';
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
  pickerBinding: string;
  pickerDescription: string;
  worktrees: readonly { pane: number | null; branch: string }[];
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
  if (page.mode === 'nvim') return 'nvim';
  if (page.mode === 'board') return `board · ${page.boardLabel}`;
  if (page.paneCount === 0) return '';
  return paneLabel(page.focused, branchOfPane(page.worktrees, page.focused));
}

// The mode, then the panes that rang while you were elsewhere. The tab strip only has room for the
// project name, so without the names here you would arrive at a yellow project and have to walk all
// six panes watching for the yellow to go out.
export function terminalStatus(page: StatusPage, waitingPaneNames: readonly string[]): string {
  if (waitingPaneNames.length === 0) return modeLabel(page);
  return `${modeLabel(page)} · ${waitingPaneNames.join(', ')} waiting`;
}
