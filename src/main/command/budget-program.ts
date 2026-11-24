import { homedir } from 'node:os';
import { bind, isRefused } from '../actions/action';
import { settingsCap, settingsPace, type SettingsBudgetPorts } from '../actions/settings/budget';
import { readText } from '../app/missing-file';
import { readSettings, settingsFilePath, writeBudget } from '../settings/settings-store';
import { budgetVerdict, parseBudgetCommand } from './budget-cli';
import { failureLine } from './failure-line';
import { WEEKLY_USAGE_FILE } from '../usage/weekly-usage-file';

// The whole of `dashboard budget` outside budget-cli.ts: the two files and the answer printed. 2 for a
// refusal as well as an unknown reading, since 1 means over the limit.
export async function runBudgetProgram(commandArguments: readonly string[]): Promise<number> {
  const settingsFile = settingsFilePath(homedir(), process.env.XDG_CONFIG_HOME);
  const command = parseBudgetCommand(commandArguments);
  if (command.kind === 'refused') {
    process.stderr.write(`${command.message}\n`);
    return 2;
  }
  if (command.kind === 'cap' || command.kind === 'pace') {
    const ports: SettingsBudgetPorts = { writeFile: (fields) => writeBudget(settingsFile, fields) };
    let written;
    try {
      written = command.kind === 'cap'
        ? await bind(settingsCap, ports).call({ cap: command.cap })
        : await bind(settingsPace, ports).call({ share: command.share });
    } catch (error: unknown) {
      process.stderr.write(`${failureLine(error)}\n`);
      return 2;
    }
    if (isRefused(written)) {
      process.stderr.write(`${written.refused}\n`);
      return 2;
    }
    process.stdout.write(`${written.output} in ${settingsFile}\n`);
    return 0;
  }
  const { budget } = readSettings(settingsFile, process.platform === 'darwin');
  // A reading that is there but cannot be read (a folder by that name, no permission) throws, and says so.
  let verdict;
  try {
    verdict = budgetVerdict(readText(WEEKLY_USAGE_FILE), budget, Date.now());
  } catch (error: unknown) {
    process.stderr.write(`${failureLine(error)}\n`);
    return 2;
  }
  (verdict.exitCode === 2 ? process.stderr : process.stdout).write(`${verdict.line}\n`);
  return verdict.exitCode;
}
