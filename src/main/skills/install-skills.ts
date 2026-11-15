import path from 'node:path';
import { replaceFileIfChanged } from '../app/replace-file';
import { installCreateTask } from '../board/create-task-install';
import { installBoardGuard } from '../board/board-guard-install';
import { failureLine } from '../command/failure-line';
import { ADOPT_DOCS_SKILL } from './adopt-docs-skill';
import { skillFolder } from './skill-folder';
import { WORK_CARD_SKILL } from './work-card-skill';

export function adoptDocsSkillFile(home: string): string {
  return path.join(skillFolder(home, 'adopt-docs'), 'SKILL.md');
}

export function workCardSkillFile(home: string): string {
  return path.join(skillFolder(home, 'work-card'), 'SKILL.md');
}

// Every skill the app puts under ~/.claude/skills, refreshed from this build at each launch. Answers
// a line to log for each one it could not write: a failure costs that skill, never the launch or
// the other skills. `buildFolder` holds create-task-cli-entry.js, the program /create-task runs.
export function installSkills(home: string, buildFolder: string): string[] {
  const lines: string[] = [];
  const createTask = installCreateTask(home, path.join(buildFolder, 'create-task-cli-entry.js'));
  if (createTask !== null) lines.push(createTask);
  const guard = installBoardGuard(home, path.join(buildFolder, 'board-cli-entry.js'));
  if (guard !== null) lines.push(guard);
  const skills: [name: string, file: string, text: string][] = [
    ['adopt-docs', adoptDocsSkillFile(home), ADOPT_DOCS_SKILL],
    ['work-card', workCardSkillFile(home), WORK_CARD_SKILL],
  ];
  for (const [name, file, text] of skills) {
    try {
      replaceFileIfChanged(file, text);
    } catch (error: unknown) {
      lines.push(`${name} not installed: ${failureLine(error)}`);
    }
  }
  return lines;
}
