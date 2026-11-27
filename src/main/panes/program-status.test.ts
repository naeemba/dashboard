import { describe, expect, it } from 'vitest';
import { PROBE_ANSWER, programStatusReader } from './program-status';

// The bytes Claude Code 2.1.332 wrote into a pty, the probe and its first status (trust this folder).
const PROBE = '\x1b]7501;?\x07';
const TRUST = '\x1b]7501;state=blocked:app=claude-code:kind=permission:msg=dHJ1c3QgdGhpcyBmb2xkZXI=\x07';
const status = (fields: string, end = '\x07') => `\x1b]7501;${fields}:app=claude-code${end}`;

function reading(...chunks: string[]) {
  const answers: string[] = [];
  const told: string[] = [];
  const reader = programStatusReader((text) => answers.push(text), (state) => told.push(state));
  for (const chunk of chunks) reader.read(chunk);
  return { answers, told };
}

describe('programStatusReader', () => {
  it('answers the probe with the probe, which is what turns statuses on', () => {
    expect(reading(`\x1b[?25l${PROBE}\x1b[c`).answers).toEqual([PROBE_ANSWER]);
    expect(PROBE_ANSWER).toBe(PROBE);
  });

  it('tells blocked once, and running when it is working again', () => {
    const { told } = reading(TRUST, status('state=blocked:kind=question'), status('state=working:progress=10'), status('state=working'));
    expect(told).toEqual(['blocked', 'running']);
  });

  it('tells a failed turn as blocked', () => {
    expect(reading(status('state=working'), status('state=error:msg=eA==')).told).toEqual(['blocked']);
  });

  it('leaves running and done to the hooks', () => {
    expect(reading(status('state=working'), status('state=done'), status('state=idle'), status('state=working')).told).toEqual([]);
  });

  it('blocks again after a done', () => {
    expect(reading(TRUST, status('state=done'), TRUST).told).toEqual(['blocked', 'blocked']);
  });

  it('reads a sequence cut across chunks, and one ended by ST', () => {
    expect(reading(TRUST.slice(0, 3), TRUST.slice(3, 30), TRUST.slice(30)).told).toEqual(['blocked']);
    expect(reading('x\x1b]75', '01;?\x07').answers).toEqual([PROBE_ANSWER]);
    expect(reading(status('state=blocked', '\x1b\\')).told).toEqual(['blocked']);
  });

  it('ignores what it does not read, without losing whether it was blocked', () => {
    const { told } = reading(
      TRUST,
      '\x1b]7501;state=clear\x07',
      '\x1b]7501;state=working:app=other\x07',
      status('state=thinking'),
      '\x1b]7501;garbage\x07',
      status('state=working'),
    );
    expect(told).toEqual(['blocked', 'running']);
  });

  it('lets go of a start that never ends', () => {
    expect(reading(`\x1b]7501;state=blocked:${'x'.repeat(5000)}`, TRUST).told).toEqual(['blocked']);
    expect(reading('\x1b]7501;state=blocked:app=claude-code', TRUST).told).toEqual(['blocked']);
  });
});
