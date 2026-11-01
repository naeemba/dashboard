import { describe, expect, it } from 'vitest';
import { closeRefusal, closingPanes, type ClosingPane } from './close-project';
import type { PaneUse } from '../../shared/panes/pane-reading';

// A shell sitting at its own prompt: nothing running in it, so it holds nothing open.
const pane = (name: string, use: Partial<ClosingPane> = {}): ClosingPane => ({
  name, index: 1, exited: false, foreground: 'zsh', shell: '/bin/zsh', command: undefined, inWorktree: false, ...use,
});

describe('closeRefusal', () => {
  it('says nothing when every pane is idle, which is what lets the close go ahead', () => {
    expect(closeRefusal('web', [pane('terminal 1'), pane('nvim')])).toBe('');
  });

  // What each pane is running, not just which pane it is, the same way a ship's refusal names it.
  it('names the project, every pane in the way and what is in it', () => {
    const panes = [pane('terminal 2', { foreground: 'npm' }), pane('nvim', { foreground: 'psql' })];
    expect(closeRefusal('web', panes))
      .toBe('web is still running in terminal 2 npm, nvim psql — stop it and close again');
  });

  it('calls an agent an agent rather than naming the binary it happens to be', () => {
    const working = pane('terminal 1', { command: { args: ['claude'], directory: '/work/api' } });
    expect(closeRefusal('web', [working])).toBe('web is still running in terminal 1 an agent — stop it and close again');
  });

  // Main runs for as long as the project is open; counting it, no project could ever close.
  it('lets main go, whatever it is running', () => {
    expect(closeRefusal('web', [pane('main', { index: 0, command: { args: ['claude'], directory: '/work/web' } })])).toBe('');
  });

  it('lets a dead pane go: its shell is gone, so it is holding nothing open', () => {
    expect(closeRefusal('web', [pane('terminal 1', { exited: true, foreground: 'npm' })])).toBe('');
  });

  it('says nothing about a project whose folder went away, which has no panes at all', () => {
    expect(closeRefusal('web', [])).toBe('');
  });
});

describe('closingPanes', () => {
  const use: PaneUse = { index: 0, exited: false, foreground: 'zsh', shell: '/bin/zsh', command: undefined, inWorktree: false };

  it('names each reading with the pane it belongs to', () => {
    const named = closingPanes([use, { ...use, index: 3, foreground: 'npm' }], [{ index: 0, name: 'main' }, { index: 3, name: 'terminal 4' }]);
    expect(named).toEqual([{ ...use, name: 'main' }, { ...use, index: 3, foreground: 'npm', name: 'terminal 4' }]);
  });

  // Workers come and go, so the two lists can line up by position and still be about different panes.
  it('pairs by pane number, not by place in the list', () => {
    const named = closingPanes([{ ...use, index: 2, foreground: 'npm' }], [{ index: 0, name: 'main' }, { index: 2, name: 'terminal 3' }]);
    expect(named.map((pane) => pane.name)).toEqual(['terminal 3']);
  });

  // main reads the terminals and the page names its editor as well.
  it('leaves out a name with no reading', () => {
    const named = closingPanes([use], [{ index: 0, name: 'main' }, { index: -1, name: 'nvim' }]);
    expect(named.map((pane) => pane.name)).toEqual(['main']);
  });

  // The one that used to throw, which stopped Ctrl+Q on a dead page before it could ask anything.
  it('gives back nothing for a page whose folder has gone, which names no panes at all', () => {
    expect(closingPanes([use, { ...use, index: 1 }], [])).toEqual([]);
  });
});
