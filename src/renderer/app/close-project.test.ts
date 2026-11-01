import { describe, expect, it, vi } from 'vitest';
import { closeRefusal, closingPanes, createProjectCloser, type ClosingPane, type ProjectCloserPorts } from './close-project';
import type { Page } from './page';
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

describe('createProjectCloser', () => {
  const idle: PaneUse = { index: 1, exited: false, foreground: 'zsh', shell: '/bin/zsh', command: undefined, inWorktree: false };
  const busy: PaneUse = { ...idle, foreground: 'npm' };
  const page = (slot: number, name: string): Page => ({ slot, project: { name, path: `/work/${name}` } }) as Page;

  // The manager at 0, then web and api; you stand on web unless a case says otherwise.
  function setUp(options: { readings?: PaneUse[][]; answer?: boolean; activeIndex?: number } = {}) {
    const pages = [page(-1, 'manager'), page(4, 'web'), page(7, 'api')];
    const readings = [...(options.readings ?? [[idle], [idle]])];
    const ports: ProjectCloserPorts = {
      readPanes: vi.fn(async () => readings.shift() ?? []),
      closeProject: vi.fn(),
      pages,
      positionOfSlot: (slot) => pages.findIndex((each) => each.slot === slot),
      activeIndex: () => options.activeIndex ?? 1,
      namedPanes: () => [{ index: 1, name: 'terminal 2' }],
      showNotice: vi.fn(),
      confirm: vi.fn(async () => options.answer ?? true),
      showPage: vi.fn(),
      removePage: vi.fn((slot: number) => void pages.splice(pages.findIndex((each) => each.slot === slot), 1)),
      landOn: vi.fn(),
      renderStatus: vi.fn(),
    };
    return { ports, close: createProjectCloser(ports) };
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('refuses over a busy pane, names it, and never asks', async () => {
    const { ports, close } = setUp({ readings: [[busy]] });
    await close(4);
    expect(ports.showNotice).toHaveBeenCalledWith('close', 'web is still running in terminal 2 npm — stop it and close again');
    expect(ports.confirm).not.toHaveBeenCalled();
  });

  it('closes a quiet project once asked, and lands on the tab that took its place', async () => {
    const { ports, close } = setUp();
    await close(4);
    await settle();
    expect(ports.showNotice).toHaveBeenCalledWith('close', '');
    expect(ports.closeProject).toHaveBeenCalledWith(4);
    expect(ports.landOn).toHaveBeenCalledWith(1);
    expect(ports.renderStatus).toHaveBeenCalled();
  });

  it('does not move you when the project closed is not the one you are on', async () => {
    const { ports, close } = setUp({ activeIndex: 0 });
    await close(7);
    await settle();
    expect(ports.closeProject).toHaveBeenCalledWith(7);
    expect(ports.landOn).not.toHaveBeenCalled();
  });

  it('keeps the project when the question is answered no', async () => {
    const { ports, close } = setUp({ answer: false });
    await close(4);
    await settle();
    expect(ports.showPage).toHaveBeenCalledWith(1);
    expect(ports.closeProject).not.toHaveBeenCalled();
  });

  it('refuses late when a pane got busy while the question was up', async () => {
    const { ports, close } = setUp({ readings: [[idle], [busy]] });
    await close(4);
    await settle();
    expect(ports.showNotice).toHaveBeenLastCalledWith('close', 'web is still running in terminal 2 npm — stop it and close again');
    expect(ports.closeProject).not.toHaveBeenCalled();
  });

  it('leaves the manager and a slot with no page alone', async () => {
    const { ports, close } = setUp();
    await close(-1);
    await close(99);
    expect(ports.readPanes).not.toHaveBeenCalled();
  });

  it('takes one close at a time while main is still answering', async () => {
    const { ports, close } = setUp();
    const first = close(4);
    await close(4);
    await first;
    expect(ports.confirm).toHaveBeenCalledTimes(1);
  });

  it('lets a close through again after a reading fails', async () => {
    const { ports, close } = setUp();
    vi.mocked(ports.readPanes).mockRejectedValueOnce(new Error('gone'));
    await expect(close(4)).rejects.toThrow('gone');
    await close(4);
    expect(ports.confirm).toHaveBeenCalledTimes(1);
  });
});
