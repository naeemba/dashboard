import { afterEach, describe, expect, it, vi } from 'vitest';
import { version } from './package.json';

async function stampWith(execFileSync: (...args: unknown[]) => string): Promise<string> {
  vi.resetModules();
  vi.doMock('node:child_process', () => ({ execFileSync }));
  const { buildVersionDefine } = await import('./vite.build-version');
  return JSON.parse(buildVersionDefine.__BUILD_VERSION__) as string;
}

afterEach(() => {
  vi.doUnmock('node:child_process');
});

describe('buildVersionDefine', () => {
  it('asks git for a fixed-length commit, so every clone stamps the same string', async () => {
    const execFileSync = vi.fn<(...args: unknown[]) => string>(() => '372685450abc\n');
    expect(await stampWith(execFileSync)).toBe(`${version}+372685450abc`);
    expect(execFileSync.mock.calls[0][1]).toEqual(['rev-parse', '--short=12', 'HEAD']);
  });

  it('stamps unknown instead of failing outside a git checkout', async () => {
    const execFileSync = vi.fn(() => {
      throw new Error('not a git repository');
    });
    expect(await stampWith(execFileSync)).toBe(`${version}+unknown`);
  });
});
