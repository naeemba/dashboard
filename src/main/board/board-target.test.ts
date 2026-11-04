import { describe, expect, it } from 'vitest';
import { homeDirectoryRefusal } from './board-cli';
import { boardTarget, type BoardTargetPorts } from './board-target';

const ports: BoardTargetPorts = {
  isHome: (directory) => directory === '/home/ann',
  projectRoot: (directory) => (directory.startsWith('/work/api') ? '/work/api' : null),
  named: (word) => (word === 'crm' ? { ok: true, name: 'new-crm', path: '/work/crm' } : { ok: false, message: `no project is called ${word}` }),
};

describe('boardTarget', () => {
  it('is the project the folder is in, words untouched', () => {
    expect(boardTarget(['move', 'abc', 'Done'], '/work/api/src', ports)).toEqual({ ok: true, project: '/work/api', commandArguments: ['move', 'abc', 'Done'] });
  });

  // Run from a plain terminal in ~/Downloads, a board seeded there is a card nobody sees.
  it('refuses a folder in no project, and the home directory with its own line', () => {
    expect(boardTarget(['list'], '/tmp/x', ports)).toMatchObject({ ok: false, message: expect.stringContaining('--project') });
    expect(boardTarget(['list'], '/home/ann', ports)).toEqual({ ok: false, message: homeDirectoryRefusal() });
  });

  it('takes --project anywhere in the words, from any folder, and hands the rest on', () => {
    expect(boardTarget(['list', '--project', 'crm'], '/home/ann', ports)).toEqual({ ok: true, project: '/work/crm', commandArguments: ['list'] });
    expect(boardTarget(['--project', 'crm', 'set', 'abc', '--priority', 'high'], '/tmp', ports))
      .toEqual({ ok: true, project: '/work/crm', commandArguments: ['set', 'abc', '--priority', 'high'] });
  });

  it('refuses --project with no word, or a word that is not a project', () => {
    expect(boardTarget(['list', '--project'], '/work/api', ports)).toMatchObject({ ok: false });
    expect(boardTarget(['--project', '--notes', 'x'], '/work/api', ports)).toMatchObject({ ok: false });
    expect(boardTarget(['list', '--project', 'cr'], '/work/api', ports)).toEqual({ ok: false, message: 'no project is called cr' });
  });
});
