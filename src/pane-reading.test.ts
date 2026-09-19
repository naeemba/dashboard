import { describe, expect, it } from 'vitest';
import {
  busyPanes, freePane, paneIsBusy, runsAnAgent, shipCanTake, type PaneReading,
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
  foreground: 'zsh',
  shell: '/bin/zsh',
  command: { args: [], directory: '/work/api' },
  inWorktree: false,
};
const running = (program: string): PaneReading => ({ ...idle, foreground: program });
const agent: PaneReading = {
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

describe('freePane', () => {
  it('takes the lowest pane nothing is running in', () => {
    expect(freePane([idle, idle, idle], shipCanTake)).toBe(0);
    expect(freePane([running('npm'), agent, idle], shipCanTake)).toBe(2);
    expect(freePane([idle, running('npm'), idle], shipCanTake)).toBe(0);
  });

  it('answers null when every pane is busy', () => {
    expect(freePane([running('npm'), agent, running('nvim')], shipCanTake)).toBe(null);
  });

  // The agent has exited and handed the pane back, but its transcript is still on screen and the shell
  // is still standing in the checkout. An empty pane of the project goes first.
  it('takes a pane still standing in a worktree last', () => {
    const finished: PaneReading = { ...idle, command: { args: [], directory: '/work/api.worktrees/one' }, inWorktree: true };
    expect(freePane([finished, idle], shipCanTake)).toBe(1);
    expect(freePane([finished, running('npm')], shipCanTake)).toBe(0);
  });

  // The order is the half the command screen shares, so it is pinned against a different idea of free
  // too: here a dead pane cannot take a line, and a worktree pane still goes last.
  it('keeps that order whatever the caller counts as free', () => {
    const dead = { ...idle, exited: true };
    const inWorktree = { ...idle, exited: false, inWorktree: true };
    const alive = { ...idle, exited: false };
    const canTakeALine = (pane: typeof dead): boolean => !pane.exited && !paneIsBusy(pane);
    expect(freePane([dead, inWorktree, alive], canTakeALine)).toBe(2);
    expect(freePane([dead, inWorktree], canTakeALine)).toBe(1);
    expect(freePane([dead], canTakeALine)).toBe(null);
  });
});

// Both branches of programIn, which close-project.ts prints too — so the ship's refusal and the
// close's describe the same pane the same way.
describe('busyPanes', () => {
  it('names each busy pane and what was seen running in it', () => {
    expect(busyPanes([running('npm'), idle, agent]))
      .toBe('terminal 1 npm, terminal 3 an agent');
  });
});
