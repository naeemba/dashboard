import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The holds in docs/app/README.md "Dependency holds": each is bumped by hand after reading its
// changelog, so a range that lets an install take a newer release fails here.
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
