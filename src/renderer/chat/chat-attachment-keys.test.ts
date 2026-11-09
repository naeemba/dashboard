import { describe, expect, it } from 'vitest';
import { attachmentKey } from './chat-attachment-keys';

describe('attachmentKey', () => {
  it('walks the thumbnails and stops at either end', () => {
    expect(attachmentKey('ArrowRight', 1, 3)).toEqual({ remove: null, select: 2 });
    expect(attachmentKey('ArrowRight', 2, 3)).toEqual({ remove: null, select: 2 });
    expect(attachmentKey('ArrowLeft', 0, 3)).toEqual({ remove: null, select: 0 });
  });

  it('removes the selected one, Delete keeping the place and Backspace stepping back', () => {
    expect(attachmentKey('Delete', 1, 3)).toEqual({ remove: 1, select: 1 });
    expect(attachmentKey('Backspace', 1, 3)).toEqual({ remove: 1, select: 0 });
    expect(attachmentKey('Delete', 2, 3)).toEqual({ remove: 2, select: 1 });
    expect(attachmentKey('Backspace', 0, 3)).toEqual({ remove: 0, select: 0 });
  });

  it('goes back to the prompt once the last one is gone', () => {
    expect(attachmentKey('Delete', 0, 1)).toEqual({ remove: 0, select: null });
  });

  it('leaves any other key alone', () => {
    expect(attachmentKey('a', 0, 2)).toBeNull();
  });
});
