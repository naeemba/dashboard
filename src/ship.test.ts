import { describe, expect, it } from 'vitest';
import {
  blockingChanges,
  branchNameFor,
  busyPanes,
  freePane,
  oneAtATime,
  paneIsBusy,
  runsAnAgent,
  worktreePathFor,
  type PaneReading,
} from './ship';

const cardId = 'fc2bf7b0-1234-4321-8888-aaaaaaaaaaaa';

describe('branchNameFor', () => {
  it('makes a branch out of the title', () => {
    expect(branchNameFor('Panes name themselves', cardId, [])).toBe('panes-name-themselves');
  });

  it('collapses punctuation and trims the hyphens off both ends', () => {
    expect(branchNameFor('  Fix "Open a new project…" doing nothing!  ', cardId, []))
      .toBe('fix-open-a-new-project-doing-nothing');
  });

  // A title with no Latin letters in it slugifies to nothing. A branch has to be called something.
  it('falls back to the card id when the title leaves nothing behind', () => {
    expect(branchNameFor('کارت جدید', cardId, [])).toBe('card-fc2b');
    expect(branchNameFor('!!!', cardId, [])).toBe('card-fc2b');
    expect(branchNameFor('', cardId, [])).toBe('card-fc2b');
  });

  it('never ends on a hyphen, even when the cut lands on one', () => {
    const long = 'a'.repeat(46) + ' and then some more words after it';
    expect(branchNameFor(long, cardId, []).endsWith('-')).toBe(false);
    expect(branchNameFor(long, cardId, []).length).toBeLessThanOrEqual(48);
  });

  it('adds four characters of the card id when the name is taken', () => {
    expect(branchNameFor('Panes name themselves', cardId, ['panes-name-themselves']))
      .toBe('panes-name-themselves-fc2b');
  });

  it('counts up when even that is taken', () => {
    const taken = ['panes-name-themselves', 'panes-name-themselves-fc2b'];
    expect(branchNameFor('Panes name themselves', cardId, taken)).toBe('panes-name-themselves-fc2b-2');
  });

  it('reserves room for the id suffix, so a collision does not push the branch past the limit', () => {
    const long = 'a'.repeat(46) + ' and then some more words after it';
    const base = branchNameFor(long, cardId, []);
    const suffixed = branchNameFor(long, cardId, [base]);
    expect(suffixed.endsWith('-')).toBe(false);
    expect(suffixed.length).toBeLessThanOrEqual(48);
  });
});

describe('worktreePathFor', () => {
  // Beside the project, never inside it: nothing to gitignore, and a search in the real checkout
  // never walks into it.
  it('puts the worktree in a sibling folder named after the project', () => {
    expect(worktreePathFor('/Users/sharp/workspace/personal/dashboard', 'panes-name-themselves'))
      .toBe('/Users/sharp/workspace/personal/dashboard.worktrees/panes-name-themselves');
  });

  it('is not confused by a trailing slash on the project path', () => {
    expect(worktreePathFor('/Users/sharp/work/api/', 'bump-deps'))
      .toBe('/Users/sharp/work/api.worktrees/bump-deps');
  });
});

// What makes a pane the ship's to take. Two panes must never count as an agent's: an ordinary shell,
// and the editor — whose args are a note saying "work nvim out at spawn time", not a command.
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
    expect(freePane([idle, idle, idle])).toBe(0);
    expect(freePane([running('npm'), agent, idle])).toBe(2);
    expect(freePane([idle, running('npm'), idle])).toBe(0);
  });

  it('answers null when every pane is busy', () => {
    expect(freePane([running('npm'), agent, running('nvim')])).toBe(null);
  });

  // The agent has exited and handed the pane back, but its transcript is still on screen and the shell
  // is still standing in the checkout. An empty pane of the project goes first.
  it('takes a pane still standing in a worktree last', () => {
    const finished: PaneReading = { ...idle, command: { args: [], directory: '/work/api.worktrees/one' }, inWorktree: true };
    expect(freePane([finished, idle])).toBe(1);
    expect(freePane([finished, running('npm')])).toBe(0);
  });
});

describe('busyPanes', () => {
  it('names each busy pane and what was seen running in it', () => {
    expect(busyPanes([running('npm'), idle, agent]))
      .toBe('terminal 1 npm, terminal 3 an agent');
  });
});

describe('blockingChanges', () => {
  // board.json is the app's own file: it is rewritten on every keystroke and put back to HEAD as the
  // ship's first step, so counting it would mean the ship refuses itself.
  it('ignores the board file on its own', () => {
    expect(blockingChanges(' M .dashboard/board.json\n')).toEqual([]);
    expect(blockingChanges('')).toEqual([]);
  });

  // git never lists the contents of an untracked directory, only the directory. A project that has
  // not committed the folder the app wrote for it reports exactly this one line, and reading it as a
  // blocker refuses every ship that project will ever make.
  it('ignores the whole folder when it is untracked and reported as one line', () => {
    expect(blockingChanges('?? .dashboard/\n')).toEqual([]);
  });

  it('ignores anything else the app keeps in that folder', () => {
    expect(blockingChanges('?? .dashboard/CLAUDE.md\n M .dashboard/notes/plan.md\n')).toEqual([]);
  });

  // The exemption is that folder, not every path that starts with those characters.
  it('still blocks a folder whose name only begins the same way', () => {
    expect(blockingChanges('?? .dashboard-old/board.json\n')).toEqual(['.dashboard-old/board.json']);
  });

  it('names every other changed file', () => {
    const porcelain = ' M src/board.ts\n M .dashboard/board.json\n?? docs/notes.md\n';
    expect(blockingChanges(porcelain)).toEqual(['src/board.ts', 'docs/notes.md']);
  });

  it('reads a rename as its new name', () => {
    expect(blockingChanges('R  src/old.ts -> src/new.ts\n')).toEqual(['src/new.ts']);
  });

  it('strips the quotes git puts round a path with a space in it', () => {
    expect(blockingChanges(' M "src/two words.ts"\n')).toEqual(['src/two words.ts']);
  });

  it('does not mistake " -> " in a plain file name for a rename', () => {
    expect(blockingChanges('A  "a -> b.ts"\n')).toEqual(['a -> b.ts']);
  });
});

describe('oneAtATime', () => {
  function deferred(): { promise: Promise<string>; settle: (value: string) => void } {
    let settle: (value: string) => void = () => undefined;
    const promise = new Promise<string>((resolve) => { settle = resolve; });
    return { promise, settle };
  }

  it('holds a second run on the same key until the first has finished', async () => {
    const queue = oneAtATime();
    const first = deferred();
    const order: string[] = [];
    const one = queue('api', async () => { order.push('one started'); return first.promise; });
    const two = queue('api', async () => { order.push('two started'); return 'two'; });
    await Promise.resolve();
    expect(order).toEqual(['one started']);
    first.settle('one');
    await Promise.all([one, two]);
    expect(order).toEqual(['one started', 'two started']);
  });

  it('lets two projects ship at once', async () => {
    const queue = oneAtATime();
    const held = deferred();
    const order: string[] = [];
    const one = queue('api', async () => { order.push('api'); return held.promise; });
    const two = queue('web', async () => { order.push('web'); return 'web'; });
    await two;
    expect(order).toEqual(['api', 'web']);
    held.settle('api');
    await one;
  });

  // A ship that throws must not leave the project unable to ship for the rest of the run.
  it('carries the failure to its own caller and runs the next one anyway', async () => {
    const queue = oneAtATime();
    const failed = queue('api', async () => { throw new Error('index.lock'); });
    await expect(failed).rejects.toThrow('index.lock');
    await expect(queue('api', async () => 'next')).resolves.toBe('next');
  });
});
