import { describe, expect, it } from 'vitest';
import { paneIsFree } from './free-pane';
import {
  freePane, paneIsBusy, programIn, runsAnAgent, shipCanTake, type PaneReading,
} from './pane-reading';

describe('runsAnAgent', () => {
  it('says yes only to a pane carrying a command of its own', () => {
    expect(runsAnAgent({ args: ['-lc', 'agent'], directory: '/work/api.worktrees/one' })).toBe(true);
    expect(runsAnAgent({ args: [], directory: '/work/api' })).toBe(false);
    expect(runsAnAgent({ args: 'editor', directory: '/work/api' })).toBe(false);
    expect(runsAnAgent(undefined)).toBe(false);
  });
});

// A pane sitting at a prompt: the pty answers with the shell itself, and nothing was asked of it.
const idle: PaneReading = {
  index: 1,
  foreground: 'zsh',
  shell: '/bin/zsh',
  command: { args: [], directory: '/work/api' },
  inWorktree: false,
};
const running = (program: string): PaneReading => ({ ...idle, foreground: program });
const agent: PaneReading = {
  index: 1,
  foreground: 'claude',
  shell: '/bin/zsh',
  command: { args: ['-lc', 'agent'], directory: '/work/api.worktrees/one' },
  inWorktree: true,
};

describe('paneIsBusy', () => {
  // A prompt is the whole of what the pty reports, so three panes are this one state: an empty pane,
  // a pane with a line typed and not submitted, and a pane with `npm run dev &` running behind the
  // prompt. All three are free and a ship takes all three, killing the job in the third. runsAProgram
  // says why telling them apart costs more than it buys — flip this to busy only alongside a reading
  // that can, or all five panes go permanently in use again.
  it('reads a pane at a prompt as free, whatever has been typed or backgrounded in it', () => {
    expect(paneIsBusy(idle)).toBe(false);
  });

  it('reads a pane running a program as busy', () => {
    expect(paneIsBusy(running('npm'))).toBe(true);
    expect(paneIsBusy(running('nvim'))).toBe(true);
  });

  // The shell is spawned by path and the pty answers with a name, so the two never match whole.
  it('compares the shell on its last segment', () => {
    expect(paneIsBusy({ ...idle, foreground: 'zsh', shell: '/opt/homebrew/bin/zsh' })).toBe(false);
    expect(paneIsBusy({ ...idle, foreground: 'bash', shell: '/bin/zsh' })).toBe(true);
  });

  it('reads an agent as busy by its record, not by what the pty says', () => {
    expect(paneIsBusy({ ...agent, foreground: 'zsh' })).toBe(true);
  });

  // A pane whose shell has died has nothing running in it and nothing to kill. Neither half is known
  // then — no pty to read a foreground off, and nothing spawned to compare it against.
  it('reads a pane with no shell as free', () => {
    expect(paneIsBusy({ ...idle, foreground: undefined })).toBe(false);
    expect(paneIsBusy({ ...idle, shell: undefined })).toBe(false);
  });
});

// Readings numbered in order from the first worker, the way paneReadingsIn lists an unbroken run.
function numbered<Pane>(panes: Pane[], from = 1): (Pane & { index: number })[] {
  return panes.map((pane, offset) => ({ ...pane, index: from + offset }));
}

describe('freePane', () => {
  it('takes the lowest worker nothing is running in', () => {
    expect(freePane(numbered([idle, idle, idle]), shipCanTake)).toBe(1);
    expect(freePane(numbered([running('npm'), agent, idle]), shipCanTake)).toBe(3);
    expect(freePane(numbered([idle, running('npm'), idle]), shipCanTake)).toBe(1);
  });

  it('answers null when every worker is busy', () => {
    expect(freePane(numbered([running('npm'), agent, running('nvim')]), shipCanTake)).toBe(null);
  });

  // Workers close and leave gaps, so the answer is the pane's own number, not where it sat in the list.
  it('answers with the pane number across a gap', () => {
    expect(freePane([{ ...running('npm'), index: 1 }, { ...idle, index: 4 }], shipCanTake)).toBe(4);
  });

  // Main is where you talk to the session. With its Claude exited it is a shell at a prompt, which is
  // exactly what every other test here calls free.
  it('never takes main', () => {
    expect(freePane(numbered([idle], 0), shipCanTake)).toBe(null);
    expect(freePane(numbered([idle, idle], 0), shipCanTake)).toBe(1);
  });

  // The agent has exited and handed the pane back, but its transcript is still on screen and the shell
  // is still standing in the checkout. An empty pane of the project goes first.
  it('takes a pane still standing in a worktree last', () => {
    const finished: PaneReading = { ...idle, command: { args: [], directory: '/work/api.worktrees/one' }, inWorktree: true };
    expect(freePane(numbered([finished, idle]), shipCanTake)).toBe(2);
    expect(freePane(numbered([finished, running('npm')]), shipCanTake)).toBe(1);
  });

  // The order is the half the command screen shares, so it is pinned against a different idea of free
  // too: here a dead pane cannot take a line, and a worktree pane still goes last.
  it('keeps that order whatever the caller counts as free', () => {
    const dead = { ...idle, exited: true };
    const inWorktree = { ...idle, exited: false, inWorktree: true };
    const alive = { ...idle, exited: false };
    expect(freePane(numbered([dead, inWorktree, alive]), paneIsFree)).toBe(3);
    expect(freePane(numbered([dead, inWorktree]), paneIsFree)).toBe(2);
    expect(freePane(numbered([dead]), paneIsFree)).toBe(null);
  });
});

// Both branches, which the close's refusal prints.
describe('programIn', () => {
  it('names an agent as one and anything else by what the pty has in front', () => {
    expect(programIn(agent)).toBe('an agent');
    expect(programIn(running('npm'))).toBe('npm');
  });
});
