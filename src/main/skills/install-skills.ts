import path from 'node:path';
import { replaceFileIfChanged } from '../app/replace-file';
import { installCreateTask } from '../board/create-task-install';
import { failureLine } from '../command/failure-line';
import { ADOPT_DOCS_SKILL } from './adopt-docs-skill';
import { skillFolder } from './skill-folder';

export function adoptDocsSkillFile(home: string): string {
  return path.join(skillFolder(home, 'adopt-docs'), 'SKILL.md');
}

// Every skill the app puts under ~/.claude/skills, refreshed from this build at each launch. Answers
// a line to log for each one it could not write: a failure costs that skill, never the launch or
// the other skills. `buildFolder` holds create-task-cli-entry.js, the program /create-task runs.
export function installSkills(home: string, buildFolder: string): string[] {
  const lines: string[] = [];
  const createTask = installCreateTask(home, path.join(buildFolder, 'create-task-cli-entry.js'));
  if (createTask !== null) lines.push(createTask);
  try {
    replaceFileIfChanged(adoptDocsSkillFile(home), ADOPT_DOCS_SKILL);
  } catch (error: unknown) {
    lines.push(`adopt-docs not installed: ${failureLine(error)}`);
  }
  return lines;
}
