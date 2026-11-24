import { BUDGET_PERCENTAGE_RANGE, budgetPercentage, type Settings } from '../../../shared/settings/settings';
import { action } from '../action';

// `dashboard budget --cap` and `--pace`: the budget limit set in settings.json, with no app needed. A
// running app takes the change when the file does (settings.adopt). Only the budget fields named
// change; the port (writeBudget, settings-store.ts) writes every other line back as it was and throws
// for a file that does not read as an object.

export type SettingsBudgetPorts = {
  writeFile(fields: Partial<Settings['budget']>): void;
};

// The one check of the cap: `budget --cap` passes the word as typed. "none" turns the limit off.
export const settingsCap = action<SettingsBudgetPorts, { cap: number | 'none' }, { output: string }>('settings.cap', {
  words: [],
  input: ({ cap }) => {
    if (cap === 'none') return { cap };
    const percentage = budgetPercentage(cap);
    return percentage === null ? { refused: `"${String(cap)}" is not a cap: ${BUDGET_PERCENTAGE_RANGE}, or none` } : { cap: percentage };
  },
  async run(ports, { cap }) {
    if (cap === 'none') {
      ports.writeFile({ limit: 'none' });
      return { output: 'no limit: budget answers under' };
    }
    ports.writeFile({ limit: 'cap', weeklyCap: cap });
    return { output: `weekly cap set to ${cap}%` };
  },
});

// `budget --pace`: a share for each day begun since the weekly reset. "even" is a seventh of the week.
export const settingsPace = action<SettingsBudgetPorts, { share: number | null }, { output: string }>('settings.pace', {
  words: [],
  input: ({ share }) => {
    if (share === 'even') return { share: null };
    const percentage = budgetPercentage(share);
    return percentage === null ? { refused: `"${String(share)}" is not a daily share: ${BUDGET_PERCENTAGE_RANGE}, or even` } : { share: percentage };
  },
  async run(ports, { share }) {
    ports.writeFile({ limit: 'pace', dailyShare: share });
    return { output: `pace set to ${share === null ? 'a seventh of the week' : `${share}%`} a day since the weekly reset` };
  },
});
