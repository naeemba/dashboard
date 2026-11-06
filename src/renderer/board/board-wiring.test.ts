import { describe, expect, it, vi } from 'vitest';
import type { Page } from '../app/page';
import { createBoardWiring } from './board-wiring';

function fire(mode: string): ReturnType<typeof vi.fn> {
  const reload = vi.fn();
  let listener: (projectPath: string) => void = () => {};
  const page = { mode, board: { reload } } as unknown as Page;
  createBoardWiring({ bridge: { onBoardChange: (given) => { listener = given; } }, activePage: () => page });
  listener('/project');
  return reload;
}

describe('createBoardWiring', () => {
  it('reloads the board when the page in front is in board mode', () => {
    expect(fire('board')).toHaveBeenCalledWith('/project');
  });

  it('leaves the board alone in any other mode', () => {
    expect(fire('notes')).not.toHaveBeenCalled();
    expect(fire('terminals')).not.toHaveBeenCalled();
  });
});
