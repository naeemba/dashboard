import { describe, expect, it } from 'vitest';
import { bind, isRefused } from '../action';
import { settingsCap } from './cap';

describe('settings.cap', () => {
  it('writes a cap in range, and refuses one out of it writing nothing', async () => {
    const written: number[] = [];
    const cap = bind(settingsCap, { writeFile: (value) => { written.push(value); } });
    expect(await cap.call({ cap: 60 })).toEqual({ output: 'weekly cap set to 60%' });
    expect(await cap.call({ cap: '62.5' })).toEqual({ output: 'weekly cap set to 62.5%' });
    for (const bad of [0, '101', 'lots', '', true]) expect(isRefused(await cap.call({ cap: bad })), String(bad)).toBe(true);
    expect(await cap.call({ cap: 'lots' })).toEqual({ refused: '"lots" is not a cap: a percentage above 0 and at most 100' });
    expect(written).toEqual([60, 62.5]);
  });
});
