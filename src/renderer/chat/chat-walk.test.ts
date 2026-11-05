import { describe, expect, it, vi } from 'vitest';
import { pressNext } from './chat-walk';

function target(): HTMLElement & { click: ReturnType<typeof vi.fn> } {
  return { click: vi.fn() } as unknown as HTMLElement & { click: ReturnType<typeof vi.fn> };
}

describe('pressNext', () => {
  it('presses the next target on the same entry and says where it landed', () => {
    const [first, second] = [target(), target()];
    expect(pressNext([first, second], 4, { entry: 4, place: 0 }, vi.fn())).toEqual({ entry: 4, place: 1 });
    expect(second.click).toHaveBeenCalledOnce();
    expect(first.click).not.toHaveBeenCalled();
  });

  it('says so and keeps the walk when the entry has nothing to press', () => {
    const none = vi.fn();
    const previous = { entry: 4, place: 1 };
    expect(pressNext([], 4, previous, none)).toBe(previous);
    expect(none).toHaveBeenCalledOnce();
  });
});
