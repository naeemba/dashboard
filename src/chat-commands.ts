// Slash commands on the Claude screen. The session runs every command Claude Code has when it is sent
// as a prompt, skills and the project's own commands included; what the screen adds is the menu that
// lists them as you type, and the few commands that are a terminal dialog in Claude Code and that the
// session answers with "isn't available in this environment". Those are the screen's own and never
// reach the session.

export type CommandRow = { name: string; description: string; argumentHint: string; aliases?: string[]; builtin?: boolean };

export type ScreenCommand = { kind: 'resume' } | { kind: 'plan'; rest: string };

export const SCREEN_COMMANDS: CommandRow[] = [
  { name: 'resume', description: 'Pick an earlier conversation of this project and carry on from it', argumentHint: '' },
  { name: 'plan', description: 'Switch to plan mode; anything after it is sent as the prompt', argumentHint: '[what to plan]' },
];

// The command typed into the box when it is one of the screen's own, else null and the text goes to
// the session as it is.
export function screenCommand(text: string): ScreenCommand | null {
  const match = /^\/(\S+)(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (match?.[1] === 'resume') return { kind: 'resume' };
  if (match?.[1] === 'plan') return { kind: 'plan', rest: (match[2] ?? '').trim() };
  return null;
}

// The rows the menu offers for what is in the box: only while it is a slash and a name with nothing
// after it, names starting with what was typed first, then aliases, then names that hold it anywhere.
// A name the session lists twice — its own and a user's — is shown once, its own; a name the screen
// answers itself is the screen's.
export function commandMenu(text: string, sessionCommands: CommandRow[]): CommandRow[] {
  if (!/^\/\S*$/.test(text)) return [];
  const typed = text.slice(1).toLowerCase();
  const byName = new Map<string, CommandRow>();
  for (const row of [...SCREEN_COMMANDS, ...sessionCommands.filter((row) => row.builtin), ...sessionCommands]) {
    if (!byName.has(row.name)) byName.set(row.name, row);
  }
  const rows = [...byName.values()].sort((one, other) => one.name.localeCompare(other.name));
  const starts = rows.filter((row) => row.name.toLowerCase().startsWith(typed));
  const aliased = rows.filter((row) => !starts.includes(row) && row.aliases?.some((alias) => alias.toLowerCase().startsWith(typed)));
  const holds = rows.filter((row) => !starts.includes(row) && !aliased.includes(row) && row.name.toLowerCase().includes(typed));
  return [...starts, ...aliased, ...holds];
}

// A command as a saved session writes it, `<command-name>/x</command-name>` and its arguments in tags
// of their own, read back as what was typed. Null for a message that is not one.
export function typedCommand(text: string): string | null {
  const name = /<command-name>([^<]*)<\/command-name>/.exec(text)?.[1]?.trim();
  if (!name) return null;
  const args = /<command-args>([^<]*)<\/command-args>/.exec(text)?.[1]?.trim();
  const command = name.startsWith('/') ? name : `/${name}`;
  return args ? `${command} ${args}` : command;
}
