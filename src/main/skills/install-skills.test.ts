import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createTaskScript } from '../board/create-task-install';
import { adoptDocsSkillFile, installSkills } from './install-skills';

function folder(): string {
  return mkdtempSync(join(tmpdir(), 'install-skills-'));
}

function build(): string {
  const out = folder();
  writeFileSync(join(out, 'create-task-cli-entry.js'), 'program');
  return out;
}

describe('installSkills', () => {
  it('writes /adopt-docs beside /create-task', () => {
    const home = folder();
    expect(installSkills(home, build())).toEqual([]);
    expect(readFileSync(adoptDocsSkillFile(home), 'utf8')).toMatch(/^---\nname: adopt-docs\n/);
    expect(readFileSync(createTaskScript(home), 'utf8')).toContain('program');
  });

  it('leaves an /adopt-docs whose bytes already match untouched', () => {
    const home = folder();
    const out = build();
    installSkills(home, out);
    const before = statSync(adoptDocsSkillFile(home)).mtimeMs;
    installSkills(home, out);
    expect(statSync(adoptDocsSkillFile(home)).mtimeMs).toBe(before);
  });

  it('installs /adopt-docs when /create-task fails, and answers one line for the failure', () => {
    const home = folder();
    const lines = installSkills(home, join(home, 'no-build'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^create-task not installed: ENOENT/);
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
