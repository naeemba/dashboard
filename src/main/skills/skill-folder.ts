import path from 'node:path';

// Where Claude Code looks for a user's skills: one folder per skill, named for its slash command.
export function skillFolder(home: string, name: string): string {
  return path.join(home, '.claude', 'skills', name);
}

// The text Claude Code reads for that skill.
export function skillFile(home: string, name: string): string {
  return path.join(skillFolder(home, name), 'SKILL.md');
}
