import { describe, expect, it, vi } from 'vitest';
import type { Page } from '../app/page';
import { createNotesWiring } from './notes-wiring';

type Listener = (projectPath: string) => void;

function wire(mode: string, inkShowing: boolean) {
  const notes = vi.fn();
  const ink = vi.fn();
  let notesListener: Listener = () => {};
  let inkListener: Listener = () => {};
  const page = { mode, inkShowing, notes: { reload: notes }, ink: { reload: ink } } as unknown as Page;
  createNotesWiring({
    bridge: { onNotesChange: (given) => { notesListener = given; }, onInkChange: (given) => { inkListener = given; } },
    activePage: () => page,
  });
  notesListener('/project');
  inkListener('/project');
  return { notes, ink };
}

describe('createNotesWiring', () => {
  it('reloads the notes in notes mode', () => {
    expect(wire('notes', false).notes).toHaveBeenCalledWith('/project');
  });

  it('reloads the handwriting page only while it is the one showing', () => {
    expect(wire('notes', true).ink).toHaveBeenCalledWith('/project');
    expect(wire('notes', false).ink).not.toHaveBeenCalled();
  });

  it('reloads neither outside notes mode', () => {
    const { notes, ink } = wire('board', true);
    expect(notes).not.toHaveBeenCalled();
    expect(ink).not.toHaveBeenCalled();
  });
});
