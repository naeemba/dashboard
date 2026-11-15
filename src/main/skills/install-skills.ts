import path from 'node:path';
import { replaceFileIfChanged } from '../app/replace-file';
import { installCreateTask } from '../board/create-task-install';
import { installBoardGuard } from '../board/board-guard-install';
import { failureLine } from '../command/failure-line';
import { ADOPT_DOCS_SKILL } from './adopt-docs-skill';
import { skillFile } from './skill-folder';
import { WORK_CARD_SKILL } from './work-card-skill';

// The skills that are one SKILL.md and nothing else, by the name of their slash command.
const TEXT_SKILLS: Record<string, string> = { 'adopt-docs': ADOPT_DOCS_SKILL, 'work-card': WORK_CARD_SKILL };

// Every skill the app puts under ~/.claude/skills, refreshed from this build at each launch. Answers
// a line to log for each one it could not write: a failure costs that skill, never the launch or
// the other skills. `buildFolder` holds create-task-cli-entry.js, the program /create-task runs.
export function installSkills(home: string, buildFolder: string): string[] {
  const lines: string[] = [];
  const createTask = installCreateTask(home, path.join(buildFolder, 'create-task-cli-entry.js'));
  if (createTask !== null) lines.push(createTask);
  const guard = installBoardGuard(home, path.join(buildFolder, 'board-cli-entry.js'));
  if (guard !== null) lines.push(guard);
  for (const [name, text] of Object.entries(TEXT_SKILLS)) {
    try {
      replaceFileIfChanged(skillFile(home, name), text);
    } catch (error: unknown) {
      lines.push(`${name} not installed: ${failureLine(error)}`);
    }
  }
  return lines;
}
