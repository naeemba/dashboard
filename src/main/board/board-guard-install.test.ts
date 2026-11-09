import { lstatSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { installBoardGuard, withBoardGuard } from './board-guard-install';
import { GUARD_COMMAND } from './board-guard';
import { temporaryFolder } from '../testing/temporary-folder';

const user = {
  model: 'opus',
  hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node rtk.js' }] }], Stop: [] },
};

function guardEntries(text: string): unknown[] {
  const settings = JSON.parse(text) as { hooks: { PreToolUse: { hooks: { command: string }[] }[] } };
  return settings.hooks.PreToolUse.filter((entry) => entry.hooks.some((hook) => hook.command === GUARD_COMMAND));
}

describe('withBoardGuard', () => {
  it('adds the entry after the user\'s own, and keeps every other key', () => {
    const next = withBoardGuard(JSON.stringify(user));
    if (!('text' in next) || next.text === null) throw new Error('expected a write');
    const settings = JSON.parse(next.text) as typeof user;
    expect(settings.model).toBe('opus');
    expect(settings.hooks.Stop).toEqual([]);
    expect(settings.hooks.PreToolUse[0]).toEqual(user.hooks.PreToolUse[0]);
    expect(guardEntries(next.text)).toHaveLength(1);
  });

  it('writes nothing when the guard is already there, under any matcher', () => {
    const there = { hooks: { PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: GUARD_COMMAND }] }] } };
    expect(withBoardGuard(JSON.stringify(there))).toEqual({ text: null });
  });

  it('starts a file that is not there, or empty', () => {
    for (const current of [null, '']) {
      const next = withBoardGuard(current);
      expect('text' in next && next.text !== null && guardEntries(next.text)).toHaveLength(1);
    }
  });

  it.each([
    ['{ not json', 'it is not JSON'],
    ['[]', 'it is not a JSON object'],
    ['{"hooks": []}', 'its hooks are not an object'],
    ['{"hooks": {"PreToolUse": {}}}', 'its PreToolUse hooks are not a list'],
  ])('refuses rather than repairs %s', (current, refused) => {
    expect(withBoardGuard(current)).toEqual({ refused });
  });
});

describe('installBoardGuard', () => {
  function build(): string {
    const folder = temporaryFolder('board-guard-build-');
    writeFileSync(join(folder, 'board-cli-entry.js'), 'program');
    return join(folder, 'board-cli-entry.js');
  }

  it('copies the program and adds the entry once, through a linked settings file', () => {
    const home = temporaryFolder('board-guard-home-');
    const dotfiles = temporaryFolder('board-guard-dotfiles-');
    writeFileSync(join(dotfiles, 'settings.json'), JSON.stringify(user), { mode: 0o600 });
    mkdirSync(join(home, '.claude'));
    symlinkSync(join(dotfiles, 'settings.json'), join(home, '.claude', 'settings.json'));

    expect(installBoardGuard(home, build())).toBeNull();
    expect(installBoardGuard(home, build())).toBeNull();

    expect(readFileSync(join(home, '.claude', 'dashboard', 'board.js'), 'utf8')).toBe('program');
    expect(lstatSync(join(home, '.claude', 'settings.json')).isSymbolicLink()).toBe(true);
    expect(guardEntries(readFileSync(join(dotfiles, 'settings.json'), 'utf8'))).toHaveLength(1);
    expect(statSync(join(dotfiles, 'settings.json')).mode & 0o777).toBe(0o600);
  });

  it('leaves a link to a settings file that is not there a link, and writes nothing', () => {
    const home = temporaryFolder('board-guard-home-');
    const missing = join(temporaryFolder('board-guard-dotfiles-'), 'settings.json');
    mkdirSync(join(home, '.claude'));
    symlinkSync(missing, join(home, '.claude', 'settings.json'));
    expect(installBoardGuard(home, build())).toBe(`board guard not added to ${join(home, '.claude', 'settings.json')}: it links to ${missing}, which is not there`);
    expect(lstatSync(join(home, '.claude', 'settings.json')).isSymbolicLink()).toBe(true);
  });

  it('leaves a settings file it refuses exactly as it was', () => {
    const home = temporaryFolder('board-guard-home-');
    mkdirSync(join(home, '.claude'));
    writeFileSync(join(home, '.claude', 'settings.json'), '{ broken');
    expect(installBoardGuard(home, build())).toMatch(/not added to .*: it is not JSON$/);
    expect(readFileSync(join(home, '.claude', 'settings.json'), 'utf8')).toBe('{ broken');
  });
});
