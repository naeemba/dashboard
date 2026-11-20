import { describe, expect, it } from 'vitest';
import { keyEventOf } from './page-keys';

describe('keyEventOf', () => {
  it('names a key in any case, and types the ones that type', () => {
    expect(keyEventOf('ENTER')).toEqual({ key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' });
    expect(keyEventOf('ArrowDown')).toEqual({ key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 });
    expect(keyEventOf('a')).toEqual({ key: 'a', code: 'KeyA', keyCode: 65, text: 'a' });
    expect(keyEventOf('7')).toEqual({ key: '7', code: 'Digit7', keyCode: 55, text: '7' });
    expect(keyEventOf('/')).toEqual({ key: '/', code: '', keyCode: 0, text: '/' });
  });

  it('is none for a word it does not know, or nothing', () => {
    expect(keyEventOf('Hyper')).toBeNull();
    expect(keyEventOf('')).toBeNull();
    expect(keyEventOf(' ')).toBeNull();
  });
});
