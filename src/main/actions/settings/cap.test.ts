import { describe, expect, it } from 'vitest';
import { bind, isRefused } from '../action';
import { settingsCap } from './cap';

describe('settings.cap', () => {
  it('writes a cap in range, and refuses one out of it writing nothing', async () => {
    const written: number[] = [];
    const cap = bind(settingsCap, { writeFile: (value) => { written.push(value); } });
    expect(await cap.call({ cap: 60 })).toEqual({ output: 'weekly cap set to 60%' });
    expect(isRefused(await cap.call({ cap: 0 }))).toBe(true);
    expect(isRefused(await cap.call({ cap: '60' }))).toBe(true);
    expect(written).toEqual([60]);
  });
});
