import { homedir } from 'node:os';
import path from 'node:path';
import { readText } from '../app/missing-file';
import { readSettings, settingsFilePath, writeWeeklyCap } from '../settings/settings-store';
import { budgetVerdict, parseBudgetCommand } from './budget-cli';
import { failureLine } from './failure-line';

// Where the user's statusline writes the last 7-day usage it was shown (command-decision-6).
const USAGE_FILE = path.join(homedir(), '.claude', 'usage-7d.json');

// The whole of `dashboard budget` outside budget-cli.ts: the two files and the answer printed. 2 for a
// refusal as well as an unknown reading, since 1 means over the cap.
export function runBudgetProgram(commandArguments: readonly string[]): number {
  const settingsFile = settingsFilePath(homedir(), process.env.XDG_CONFIG_HOME);
  const command = parseBudgetCommand(commandArguments);
  if (command.kind === 'refused') {
    process.stderr.write(`${command.message}\n`);
    return 2;
  }
  if (command.kind === 'cap') {
    try {
      writeWeeklyCap(settingsFile, command.cap);
    } catch (error: unknown) {
      process.stderr.write(`${failureLine(error)}\n`);
      return 2;
    }
    process.stdout.write(`weekly cap set to ${command.cap}% in ${settingsFile}\n`);
    return 0;
  }
  const { weeklyCap } = readSettings(settingsFile, process.platform === 'darwin').budget;
  // A reading that is there but cannot be read (a folder by that name, no permission) throws, and says so.
  let verdict;
  try {
    verdict = budgetVerdict(readText(USAGE_FILE), weeklyCap, Date.now());
  } catch (error: unknown) {
    process.stderr.write(`${failureLine(error)}\n`);
    return 2;
  }
  (verdict.exitCode === 2 ? process.stderr : process.stdout).write(`${verdict.line}\n`);
  return verdict.exitCode;
}
