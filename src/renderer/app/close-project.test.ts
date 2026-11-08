import { describe, expect, it, vi } from 'vitest';
import { createProjectCloser, type ProjectCloserPorts } from './close-project';
import type { Page } from './page';
import { MANAGER_SLOT } from '../../shared/manager/manager';

describe('createProjectCloser', () => {
  // What project.close answers: the refusal, or that it may close (or did).
  const quiet = { output: '' };
  const busy = { refused: 'web is still running in terminal 2 npm — stop it and close again' };
  const page = (slot: number, name: string): Page => ({ slot, project: { name, path: `/work/${name}` } }) as Page;

  // The manager at 0, then web and api; you stand on web unless a case says otherwise.
  function setUp(options: { readings?: ({ output: string } | { refused: string })[]; answer?: boolean; activeIndex?: number } = {}) {
    const pages = [page(MANAGER_SLOT, 'manager'), page(4, 'web'), page(7, 'api')];
    const readings = [...(options.readings ?? [quiet, quiet])];
    const ports: ProjectCloserPorts = {
      closeProject: vi.fn(async () => readings.shift() ?? quiet),
      pages: () => pages,
      positionOfSlot: (slot) => pages.findIndex((each) => each.slot === slot),
      activeIndex: () => options.activeIndex ?? 1,
      namedPanes: () => [{ index: 1, name: 'terminal 2' }],
      showNotice: vi.fn(),
      confirm: vi.fn(async () => options.answer ?? true),
      showPage: vi.fn(),
    };
    return { ports, close: createProjectCloser(ports) };
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('refuses over a busy pane, names it, and never asks', async () => {
    const { ports, close } = setUp({ readings: [busy] });
    await close(4);
    expect(ports.showNotice).toHaveBeenCalledWith('close', 'web is still running in terminal 2 npm — stop it and close again');
    expect(ports.confirm).not.toHaveBeenCalled();
  });

  it('closes a quiet project once asked', async () => {
    const { ports, close } = setUp();
    await close(4);
    await settle();
    expect(ports.showNotice).toHaveBeenCalledWith('close', '');
    expect(ports.closeProject).toHaveBeenNthCalledWith(1, { slot: 4, name: 'web', names: [{ index: 1, name: 'terminal 2' }], onlyCheck: true });
    expect(ports.closeProject).toHaveBeenLastCalledWith({ slot: 4, name: 'web', names: [{ index: 1, name: 'terminal 2' }], onlyCheck: false });
  });

  it('sends only what the structured clone under IPC can carry', async () => {
    const { ports } = setUp();
    // A pane as renderer.ts hands it over: a terminal object and functions beside the name.
    const pane = { index: 1, name: 'terminal 2', terminal: new (class Terminal {})(), tail: () => [] };
    ports.namedPanes = () => [pane];
    await createProjectCloser(ports)(4);
    const request = vi.mocked(ports.closeProject).mock.calls[0][0];
    expect(() => structuredClone(request)).not.toThrow();
    expect(request.names).toEqual([{ index: 1, name: 'terminal 2' }]);
  });

  it('keeps the project when the question is answered no', async () => {
    const { ports, close } = setUp({ answer: false });
    await close(4);
    await settle();
    expect(ports.showPage).toHaveBeenCalledWith(1);
    expect(ports.closeProject).toHaveBeenCalledOnce();
  });

  it('refuses late when a pane got busy while the question was up', async () => {
    const { ports, close } = setUp({ readings: [quiet, busy] });
    await close(4);
    await settle();
    expect(ports.showNotice).toHaveBeenLastCalledWith('close', 'web is still running in terminal 2 npm — stop it and close again');
  });

  it('leaves the manager and a slot with no page alone', async () => {
    const { ports, close } = setUp();
    await close(MANAGER_SLOT);
    await close(99);
    expect(ports.closeProject).not.toHaveBeenCalled();
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
    vi.mocked(ports.closeProject).mockRejectedValueOnce(new Error('gone'));
    await expect(close(4)).rejects.toThrow('gone');
    await close(4);
    expect(ports.confirm).toHaveBeenCalledTimes(1);
  });
});
