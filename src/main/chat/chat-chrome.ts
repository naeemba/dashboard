import { readFile } from 'node:fs/promises';
import path from 'node:path';

// The CLI flag that gives a Claude screen session Claude in Chrome. The interactive CLI turns it on
// from `claudeInChromeDefaultEnabled` in the user's Claude Code config; one the SDK starts reads the
// flag only, so without this a screen has no browser tools where the terminal has them. Anything but
// `true`, or a config that is missing or unreadable, leaves it off, as the CLI does.
export function chromeArguments(configuration: string | undefined): { chrome?: null } {
  try {
    return (JSON.parse(configuration ?? '{}') as { claudeInChromeDefaultEnabled?: unknown }).claudeInChromeDefaultEnabled === true ? { chrome: null } : {};
  } catch {
    return {};
  }
}

// Where the CLI keeps that config: `.claude.json` in CLAUDE_CONFIG_DIR, or in the home folder.
export function configurationFile(environment: NodeJS.ProcessEnv, home: string): string {
  return path.join(environment.CLAUDE_CONFIG_DIR || home, '.claude.json');
}

export async function chromeArgumentsFor(environment: NodeJS.ProcessEnv, home: string): Promise<{ chrome?: null }> {
  return chromeArguments(await readFile(configurationFile(environment, home), 'utf8').catch(() => undefined));
}
