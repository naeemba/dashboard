import { describe, expect, it } from 'vitest';
import type { Settings } from '../../../shared/settings/settings';
import { bind, isRefused } from '../action';
import { settingsCap, settingsPace } from './budget';

function written(): { fields: Partial<Settings['budget']>[]; writeFile: (fields: Partial<Settings['budget']>) => void } {
  const fields: Partial<Settings['budget']>[] = [];
  return { fields, writeFile: (next) => { fields.push(next); } };
}

describe('settings.cap', () => {
  it('writes a cap in range, turns the limit off on none, and refuses anything else writing nothing', async () => {
    const file = written();
    const cap = bind(settingsCap, file);
    expect(await cap.call({ cap: 60 })).toEqual({ output: 'weekly cap set to 60%' });
    expect(await cap.call({ cap: '62.5' })).toEqual({ output: 'weekly cap set to 62.5%' });
    expect(await cap.call({ cap: 'none' })).toEqual({ output: 'no limit: budget answers under' });
    for (const bad of [0, '101', 'lots', '', true]) expect(isRefused(await cap.call({ cap: bad })), String(bad)).toBe(true);
    expect(await cap.call({ cap: 'lots' })).toEqual({ refused: '"lots" is not a cap: a percentage above 0 and at most 100, or none' });
    expect(file.fields).toEqual([{ limit: 'cap', weeklyCap: 60 }, { limit: 'cap', weeklyCap: 62.5 }, { limit: 'none' }]);
  });
});

describe('settings.pace', () => {
  it('writes a daily share, or a seventh of the week on even, and refuses anything else', async () => {
    const file = written();
    const pace = bind(settingsPace, file);
    expect(await pace.call({ share: 'even' })).toEqual({ output: 'pace set to a seventh of the week a day since the weekly reset' });
    expect(await pace.call({ share: '15' })).toEqual({ output: 'pace set to 15% a day since the weekly reset' });
    for (const bad of [0, '101', 'daily', '']) expect(isRefused(await pace.call({ share: bad })), String(bad)).toBe(true);
    expect(file.fields).toEqual([{ limit: 'pace', dailyShare: null }, { limit: 'pace', dailyShare: 15 }]);
  });
});
