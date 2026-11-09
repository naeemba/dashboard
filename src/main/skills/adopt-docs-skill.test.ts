import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADOPT_DOCS_SKILL } from './adopt-docs-skill';

// skills-decision-2: the skill copies this repository's docs pattern word for word. Line breaks and
// the skill's four-space indent differ, so the texts are compared word by word.
const root = process.cwd();

function words(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function expectSkillToCarry(text: string, source: string): void {
  const carried = words(ADOPT_DOCS_SKILL).includes(words(text));
  expect(carried, `${source} changed: copy it into ADOPT_DOCS_SKILL in adopt-docs-skill.ts`).toBe(true);
}

function between(text: string, start: string, end: string, source: string): string {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from);
  if (from < 0 || to < 0) {
    throw new Error(`${source}: no text from "${start}" to "${end}"; copy the new text into ADOPT_DOCS_SKILL in adopt-docs-skill.ts`);
  }
  return text.slice(from, to);
}

describe('ADOPT_DOCS_SKILL', () => {
  it('carries the docs rule from CLAUDE.md', () => {
    const claude = readFileSync(join(root, 'CLAUDE.md'), 'utf8');
    const source = 'The docs rule in CLAUDE.md';
    expectSkillToCarry(between(claude, 'Feature docs live in', '\n\n', source), source);
  });

  it('carries the preamble of docs/README.md', () => {
    const index = readFileSync(join(root, 'docs', 'README.md'), 'utf8');
    const source = 'The preamble of docs/README.md';
    expectSkillToCarry(between(index, '# Docs', '## Features', source), source);
  });
});
