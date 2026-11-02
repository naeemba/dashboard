import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createTaskScript, installCreateTask } from './create-task-install';

function folder(): string {
  return mkdtempSync(join(tmpdir(), 'create-task-install-'));
}

describe('installCreateTask', () => {
  it('copies the program and writes the skill naming its absolute path', () => {
    const home = folder();
    const built = join(folder(), 'create-task-cli-entry.js');
    writeFileSync(built, 'program');

    expect(installCreateTask(home, built)).toBeNull();

    const script = join(home, '.claude', 'skills', 'create-task', 'create-task.js');
    expect(createTaskScript(home)).toBe(script);
    expect(readFileSync(script, 'utf8')).toBe('program');
    const skill = readFileSync(join(home, '.claude', 'skills', 'create-task', 'SKILL.md'), 'utf8');
    expect(skill).toMatch(/^---\nname: create-task\n/);
    expect(skill).toContain(`node '${script}' --title '<title>'`);
    expect(readFileSync(join(home, '.claude', 'skills', 'create-task', 'package.json'), 'utf8')).toBe('{"type":"commonjs"}\n');
  });

  it('leaves a file whose bytes already match untouched', () => {
    const home = folder();
    const built = join(folder(), 'create-task-cli-entry.js');
    writeFileSync(built, 'program');
    installCreateTask(home, built);
    const before = statSync(createTaskScript(home)).mtimeMs;
    installCreateTask(home, built);
    expect(statSync(createTaskScript(home)).mtimeMs).toBe(before);
  });

  it('answers a line to log, never a throw, when the build has no program', () => {
    const home = folder();
    expect(installCreateTask(home, join(home, 'missing.js'))).toMatch(/^create-task not installed: ENOENT/);
    expect(existsSync(createTaskScript(home))).toBe(false);
  });
});
