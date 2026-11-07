import { describe, expect, it } from 'vitest';
import { screenOwner } from './screen-owner';

describe('screenOwner', () => {
  it('reads a screen saved with no dispatcher as yours and one naming its main as main\'s', () => {
    expect(screenOwner(null)).toBe('you');
    expect(screenOwner('/work/desk')).toBe('main');
  });

  it('reads anything this app never wrote as nobody\'s', () => {
    expect(screenOwner(undefined)).toBeUndefined();
    expect(screenOwner(3)).toBeUndefined();
  });
});
