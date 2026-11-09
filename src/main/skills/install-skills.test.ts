import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createTaskScript } from '../board/create-task-install';
import { adoptDocsSkillFile, installSkills } from './install-skills';
import { temporaryFolder } from '../testing/temporary-folder';

function folder(): string {
  return temporaryFolder('install-skills-');
}

function build(): string {
  const out = folder();
  writeFileSync(join(out, 'create-task-cli-entry.js'), 'program');
  writeFileSync(join(out, 'board-cli-entry.js'), 'program');
  return out;
}

describe('installSkills', () => {
  it('writes /adopt-docs beside /create-task', () => {
    const home = folder();
    expect(installSkills(home, build())).toEqual([]);
    expect(readFileSync(adoptDocsSkillFile(home), 'utf8')).toMatch(/^---\nname: adopt-docs\n/);
    expect(existsSync(createTaskScript(home))).toBe(true);
  });

  it('installs /adopt-docs when /create-task and the board guard fail, and answers one line for each', () => {
    const home = folder();
    const lines = installSkills(home, join(home, 'no-build'));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^create-task not installed: ENOENT/);
    expect(lines[1]).toMatch(/^board guard not installed: ENOENT/);
    expect(readFileSync(adoptDocsSkillFile(home), 'utf8')).toContain('name: adopt-docs');
  });

  it('answers a line, never a throw, when /adopt-docs cannot be written', () => {
    const home = folder();
    // A file where the skill's folder would go.
    mkdirSync(join(home, '.claude', 'skills'), { recursive: true });
    writeFileSync(join(home, '.claude', 'skills', 'adopt-docs'), '');
    expect(installSkills(home, build())).toEqual([expect.stringMatching(/^adopt-docs not installed: /)]);
  });
});
