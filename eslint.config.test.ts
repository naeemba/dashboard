import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// Pins the process boundaries in eslint.config.mjs (app-rule-2). A rule that stops matching and a
// clean tree look the same to `npx eslint .`, so each case here is one crossing that must fail.
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
