import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clone, remote, useGitTestEnvironment } from './create-task-git-fixture';
import { createTaskScript, installCreateTask } from './create-task-install';

useGitTestEnvironment();

// The mode is a POSIX promise; Windows reports its own bits whatever is set.
const posix = process.platform !== 'win32';

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
    expect(readFileSync(script, 'utf8')).toBe('#!/usr/bin/env node\nprogram');
    if (posix) expect(statSync(script).mode & 0o777).toBe(0o755);
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

  it.skipIf(!posix)('makes an installed program executable without rewriting it when only its mode is wrong', () => {
    const home = folder();
    const built = join(folder(), 'create-task-cli-entry.js');
    writeFileSync(built, 'program');
    installCreateTask(home, built);
    const script = createTaskScript(home);
    chmodSync(script, 0o644);
    const before = statSync(script).mtimeMs;
    installCreateTask(home, built);
    expect(statSync(script).mode & 0o777).toBe(0o755);
    expect(statSync(script).mtimeMs).toBe(before);
  });

  // The real program, built the way the app builds it, run the way claude-pr-loop runs it: as the
  // command itself, through its `#!` line. Windows has no `#!`, so there it runs under node.
  it('installs a program that runs as a command and answers a branch with no board', { timeout: 60_000 }, async () => {
    // Imported here, not at the top, so the other tests in this file do not load vite.
    const { build } = await import('vite');
    const out = folder();
    await build({ configFile: 'vite.create-task-cli.config.ts', logLevel: 'silent', build: { ssr: true, outDir: out, emptyOutDir: true } });
    const home = folder();
    expect(installCreateTask(home, join(out, 'create-task-cli-entry.js'))).toBeNull();

    const script = createTaskScript(home);
    const [command, ...prefix] = posix ? [script] : [process.execPath, script];
    const result = spawnSync(command, [...prefix, '--title', 't', '--notes', '', '--priority', 'low'], { cwd: clone(remote(), false), encoding: 'utf8' });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('origin/main has no .dashboard/board.json');
  });

  it('answers a line to log, never a throw, when the build has no program', () => {
    const home = folder();
    expect(installCreateTask(home, join(home, 'missing.js'))).toMatch(/^create-task not installed: ENOENT/);
    expect(existsSync(createTaskScript(home))).toBe(false);
  });
});
