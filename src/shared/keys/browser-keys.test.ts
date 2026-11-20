import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../settings/settings';
import { leavingKey, type PageKey } from './browser-keys';

const keys = defaultSettings(false).keys;
const press = (code: string, key: string, held: Partial<PageKey> = {}): PageKey => ({
  type: 'keyDown', key, code, shift: false, control: false, alt: false, meta: false, ...held,
});

describe('leavingKey', () => {
  it('hands the window a global key and a browser key', () => {
    expect(leavingKey(press('KeyB', 'b', { control: true }), keys)).toMatchObject({ code: 'KeyB', ctrlKey: true });
    expect(leavingKey(press('KeyL', 'l', { control: true }), keys)).toMatchObject({ code: 'KeyL', ctrlKey: true });
  });

  it('leaves typing and the browser mode key to the page', () => {
    expect(leavingKey(press('KeyA', 'a'), keys)).toBeNull();
    expect(leavingKey(press('KeyB', 'B', { control: true, shift: true }), keys)).toBeNull();
  });

  it("leaves another screen's key to the page", () => {
    // The board's bare D, heard only on the board.
    expect(leavingKey(press('KeyD', 'd'), keys)).toBeNull();
  });

  it('hands over the key going down only', () => {
    expect(leavingKey(press('KeyB', 'b', { control: true, type: 'keyUp' }), keys)).toBeNull();
  });
});
