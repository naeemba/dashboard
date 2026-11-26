import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The record of which holds in docs/app/README.md "Dependency holds" are exact: each is bumped by
// hand after reading its changelog, so a range that lets an install take a newer release fails
// here. A new exact hold in the README adds its name to this list.
const HELD = ['electron', '@anthropic-ai/claude-agent-sdk', 'marked', 'highlight.js', 'yaml', '@xterm/xterm'];

const manifest = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const versions = { ...manifest.dependencies, ...manifest.devDependencies };

describe('held dependencies', () => {
  it.each(HELD)('%s is pinned to an exact version', (name) => {
    expect(versions[name]).toMatch(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);
  });
});
