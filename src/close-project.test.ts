import { describe, expect, it } from 'vitest';
import { closeRefusal, type ClosingPane } from './close-project';

// A shell sitting at its own prompt: nothing running in it, so it holds nothing open.
const pane = (name: string, use: Partial<ClosingPane> = {}): ClosingPane => ({
  name, exited: false, foreground: 'zsh', shell: '/bin/zsh', command: undefined, inWorktree: false, ...use,
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

  it('lets a dead pane go: its shell is gone, so it is holding nothing open', () => {
    expect(closeRefusal('web', [pane('terminal 1', { exited: true, foreground: 'npm' })])).toBe('');
  });

  it('says nothing about a project whose folder went away, which has no panes at all', () => {
    expect(closeRefusal('web', [])).toBe('');
  });
});
