import { describe, expect, it } from 'vitest';
import { tellWithRow, type RowNoticePorts } from './row-notice';
import type { OpenPullRequest } from '../board/merge-request';

const card = { id: '443e305a-652e', title: 'Status', column: 'Review', branch: 'status-branch' };
const open: OpenPullRequest = { branch: 'status-branch', pull: { number: 5, state: 'OPEN', title: 't', url: '', statusCheckRollup: [] } };

function fake(answer: () => Promise<readonly OpenPullRequest[]>) {
  const told: string[] = [];
  const withdrawn: string[] = [];
  let asked = 0;
  const ports: RowNoticePorts = {
    tell: (text) => { told.push(text); return `m${told.length}`; },
    withdraw: (messageId) => withdrawn.push(messageId),
    openPullRequests: () => { asked += 1; return answer(); },
  };
  return { ports, told, withdrawn, asked: () => asked };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('tellWithRow', () => {
  it('tells a pane with no card at once, without asking the forge', () => {
    const { ports, told, withdrawn, asked } = fake(() => Promise.resolve([]));
    const takeBack = tellWithRow(ports, { head: '1:2\tW2\tdone', directory: '/w' }, (row) => `stopped ${row}`);
    expect(told).toEqual(['stopped 1:2\tW2\tdone\t/w']);
    expect(asked()).toBe(0);
    takeBack();
    expect(withdrawn).toEqual(['m1']);
  });

  it('tells a card\'s pane once the forge answers, with its pull request\'s number and state', async () => {
    const { ports, told, withdrawn } = fake(() => Promise.resolve([open]));
    const takeBack = tellWithRow(ports, { head: '1:2\tW2\tdone', directory: '/w', card }, (row) => row);
    expect(told).toEqual([]);
    await flush();
    expect(told).toEqual(['1:2\tW2\tdone\t/w\t443e305a Review "Status"\tstatus-branch\t#5 open']);
    takeBack();
    expect(withdrawn).toEqual(['m1']);
  });

  it('says the pull request is unknown when the forge cannot answer', async () => {
    const { ports, told } = fake(() => Promise.reject(new Error('gh: 502')));
    tellWithRow(ports, { head: '1:2\tW2\tdone', directory: '/w', card }, (row) => row);
    await flush();
    expect(told[0]).toContain('\tpr unknown');
  });

  it('never tells a notice taken back before the forge answered', async () => {
    const { ports, told, withdrawn } = fake(() => Promise.resolve([open]));
    tellWithRow(ports, { head: '1:2\tW2\tdone', directory: '/w', card }, (row) => row)();
    await flush();
    expect(told).toEqual([]);
    expect(withdrawn).toEqual([]);
  });
});
