import { describe, expect, it } from 'vitest';
import { project } from './session-requests-fixture';

// `pane status` through the session command; status-lines.test.ts holds every case of the text itself.
describe('pane status', () => {
  it('prints each pane with its card and the open pull requests no pane holds', async () => {
    const { ask } = project({
      paneCard: (id) => (id === '2:1' ? { id: 'card-1234-5678', title: 'Fix it', column: 'Doing', branch: 'fix-it' } : undefined),
      openPullRequests: () => Promise.resolve([
        { branch: 'fix-it', pull: { number: 7, state: 'OPEN', title: 'Fix it', url: '' } },
        { branch: 'other', pull: { number: 8, state: 'OPEN', title: 'Other', url: '' } },
      ]),
    });
    await ask(['claim']);
    const { ok, output } = await ask(['status']);
    expect(ok).toBe(true);
    expect(output.split('\n')).toEqual([
      '2:0\tmain\tmain\t/work/api',
      '2:1\tterminal 2\tidle\tcard-123 Doing "Fix it"\tfix-it\t#7 open',
      '',
      'open pull requests no pane holds:',
      '#8 open\tother\tOther',
    ]);
  });

  it('still answers with the panes when the forge cannot', async () => {
    const { ask } = project({ openPullRequests: () => Promise.reject(new Error('gh: not logged in')) });
    expect((await ask(['status'])).output).toContain('open pull requests unknown: gh: not logged in');
    expect(await ask(['status', '--all'])).toMatchObject({ ok: false, output: 'pane status takes nothing' });
  });
});
