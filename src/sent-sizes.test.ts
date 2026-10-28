import { describe, expect, it } from 'vitest';
import { sentSizes } from './sent-sizes';

describe('sentSizes', () => {
  it('keeps the last resize of each pane and nothing else', () => {
    const sizes = sentSizes();
    sizes.remember('pty:resize', ['0:1', 80, 24]);
    sizes.remember('pty:resize', ['0:2', 100, 30]);
    sizes.remember('pty:resize', ['0:1', 120, 40]);
    sizes.remember('pty:input', ['0:1', 'ls']);
    expect(sizes.all()).toEqual([['0:1', 120, 40], ['0:2', 100, 30]]);
  });
});
