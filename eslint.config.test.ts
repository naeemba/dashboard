import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// Pins the process boundaries in eslint.config.mjs (app-rule-2). A rule that stops matching and a
// clean tree look the same to `pnpm exec eslint .`, so each case here is one crossing that must fail.
const eslint = new ESLint();

const boundaryErrors = async (filePath: string, source: string): Promise<string[]> => {
  const [result] = await eslint.lintText(source, { filePath });
  return result.messages
    .filter((message) => message.ruleId === '@typescript-eslint/no-restricted-imports' || message.ruleId === 'no-restricted-syntax')
    .map((message) => message.ruleId ?? '');
};

describe('process boundaries', () => {
  it.each([
    ['src/renderer/probe.ts', "import { x } from '../main/app/projects';"],
    ['src/renderer/probe.ts', "import type { Project } from '../../main/app/projects';"],
    ['src/renderer/probe.ts', "import '../../preload/preload';"],
    ['src/renderer/probe.ts', "import { query } from '@anthropic-ai/claude-agent-sdk';"],
    ['src/renderer/probe.ts', "import fs from 'fs';"],
    ['src/renderer/probe.ts', "import { readFile } from 'fs/promises';"],
    ['src/renderer/probe.ts', "import started from 'electron-squirrel-startup';"],
    ['src/renderer/probe.ts', "export const os = await import('node:os');"],
    ['src/renderer/probe.ts', "export type Copy = import('../../main/app/projects').Project;"],
    ['src/main/probe.ts', "import { x } from '../renderer/page';"],
    ['src/main/probe.ts', "import '../../preload/preload';"],
    ['src/main/probe.ts', "import { marked } from 'marked';"],
    ['src/main/probe.ts', "export const page = await import('../renderer/page');"],
    ['src/shared/probe.ts', "import { x } from '../../main/app/projects';"],
    ['src/shared/probe.ts', "import '../../preload/preload';"],
    ['src/shared/probe.ts', "import { ipcRenderer } from 'electron';"],
    ['src/preload/probe.ts', "import '../renderer/renderer';"],
    ['src/preload/probe.ts', "import '../main/main';"],
    ['src/preload/probe.ts', "import { marked } from 'marked';"],
    ['src/preload/probe.ts', "import fs from 'node:fs';"],
    ['src/preload/probe.ts', "import path from 'path';"],
  ])('%s fails on %s', async (filePath, source) => {
    expect(await boundaryErrors(filePath, source)).toHaveLength(1);
  });

  it.each([
    ['src/renderer/probe.ts', "import type { Query } from '@anthropic-ai/claude-agent-sdk';"],
    ['src/renderer/probe.ts', "export type Stats = import('node:fs').Stats;"],
    ['src/renderer/probe.ts', "import { x } from '../shared/util/x';"],
    ['src/main/probe.ts', "import fs from 'node:fs';"],
    ['src/preload/probe.ts', "import { ipcRenderer } from 'electron';"],
    ['src/preload/probe.ts', "import type { DashboardBridge } from '../shared/app/bridge';"],
  ])('%s allows %s', async (filePath, source) => {
    expect(await boundaryErrors(filePath, source)).toEqual([]);
  });
});

// Pins workflow-rule-4: a test makes its folder through temporaryFolder(), never mkdtemp itself.
describe('test folders', () => {
  const folderErrors = async (filePath: string, source: string): Promise<string[]> => {
    const [result] = await eslint.lintText(source, { filePath });
    return result.messages.map((message) => message.ruleId ?? '').filter((ruleId) => ruleId !== '@typescript-eslint/no-unused-vars');
  };

  it.each([
    ['src/main/probe.test.ts', "import { mkdtempSync } from 'node:fs';"],
    ['src/main/probe.test.ts', "import { mkdtemp } from 'node:fs/promises';"],
    ['src/main/board/probe-fixture.ts', "import { mkdtempSync } from 'fs';"],
  ])('%s fails on %s', async (filePath, source) => {
    expect(await folderErrors(filePath, source)).toEqual(['no-restricted-imports']);
  });

  it('keeps the process boundaries in a test file', async () => {
    expect(await folderErrors('src/main/probe.test.ts', "import { x } from '../renderer/page';")).toEqual(['@typescript-eslint/no-restricted-imports']);
  });

  it('leaves the helper itself alone', async () => {
    expect(await folderErrors('src/main/testing/temporary-folder.ts', "import { mkdtempSync } from 'node:fs';")).toEqual([]);
  });
});

// Pins errors-rule-1: an error shown to a person goes through failureText, never String(error).
// The probes import nothing, so the one `no-restricted-syntax` they can raise is this one.
describe('String(error)', () => {
  const source = 'export const say = (error: unknown): string => `failed: ${String(error)}`;';

  it.each(['src/renderer/probe.ts', 'src/main/probe.ts', 'src/shared/probe.ts', 'src/preload/probe.ts'])('fails in %s', async (filePath) => {
    expect(await boundaryErrors(filePath, source)).toHaveLength(1);
  });

  it.each([
    'export const say = (thrown: unknown): string => String(thrown);',
    'export const say = (error: unknown): string => `failed: ${error}`;',
  ])('fails on %s', async (other) => {
    expect(await boundaryErrors('src/renderer/probe.ts', other)).toHaveLength(1);
  });

  it.each(['src/shared/errors/failure.ts', 'src/main/command/failure-line.ts'])('allows it in %s', async (filePath) => {
    expect(await boundaryErrors(filePath, source)).toEqual([]);
  });

  it.each([
    ['src/shared/errors/failure.ts', "import { x } from '../../main/app/projects';"],
    ['src/main/command/failure-line.ts', "import { x } from '../../renderer/page';"],
    ['src/shared/errors/failure.ts', "export const projects = await import('../../main/app/projects');"],
    ['src/main/command/failure-line.ts', "export const page = await import('../../renderer/page');"],
  ])('keeps the process boundaries in %s', async (filePath, imports) => {
    expect(await boundaryErrors(filePath, imports)).toHaveLength(1);
  });

  it('leaves String on anything else alone', async () => {
    expect(await boundaryErrors('src/renderer/probe.ts', 'export const text = (count: number): string => String(count);')).toEqual([]);
  });
});
