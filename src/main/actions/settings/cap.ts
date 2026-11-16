import { isWeeklyCap } from '../../../shared/settings/settings';
import { action } from '../action';

// `dashboard budget --cap`: the weekly cap set in settings.json, with no app needed. A running app takes
// the change when the file does (settings.adopt). Only budget.weeklyCap changes; the port
// (writeWeeklyCap, settings-store.ts) writes every other line back as it was and throws for a file
// that does not read as an object.

export type SettingsCapPorts = {
  writeFile(cap: number): void;
};

export const settingsCap = action<SettingsCapPorts, { cap: number }, { output: string }>('settings.cap', {
  words: [],
  input: ({ cap }) => (typeof cap === 'number' && isWeeklyCap(cap)
    ? { cap }
    : { refused: 'a cap is a percentage above 0 and at most 100' }),
  async run(ports, { cap }) {
    ports.writeFile(cap);
    return { output: `weekly cap set to ${cap}%` };
  },
});
