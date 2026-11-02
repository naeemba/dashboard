import { describe, expect, it } from 'vitest';
import { boardAddArguments, lostRace, parseCreateTaskArguments } from './create-task';

function options(argv: string[]) {
  const parsed = parseCreateTaskArguments(argv);
  if ('message' in parsed) throw new Error(parsed.message);
  return parsed.options;
}

describe('parseCreateTaskArguments', () => {
  it('reads title, notes and priority, the interface claude-pr-loop calls', () => {
    expect(options(['--title', ' Fix the thing ', '--notes', 'why', '--priority', 'high'])).toMatchObject({
      title: 'Fix the thing', notes: 'why', priority: 'high', remote: 'origin', column: undefined,
    });
  });

  it('defaults to medium, no notes and origin', () => {
    expect(options(['--title', 'x'])).toMatchObject({ priority: 'medium', notes: '', remote: 'origin' });
  });

  it('takes --remote for a board on a second remote', () => {
    expect(options(['--title', 'x', '--remote', 'gitlab']).remote).toBe('gitlab');
  });

  it('refuses an empty --remote rather than filing on origin', () => {
    expect(parseCreateTaskArguments(['--title', 'x', '--remote', ''])).toEqual({ message: '--remote needs a remote name' });
  });

  it('refuses no title, a priority it does not know and a flag it does not know', () => {
    expect(parseCreateTaskArguments(['--notes', 'x'])).toEqual({ message: 'a --title is required' });
    expect(parseCreateTaskArguments(['--title', 'x', '--priority', 'later'])).toEqual({
      message: '--priority must be one of: urgent, high, medium, low',
    });
    expect(parseCreateTaskArguments(['--title', 'x', '--nope'])).toHaveProperty('message');
  });
});

describe('boardAddArguments', () => {
  it('hands the board command its own add, column only when named', () => {
    expect(boardAddArguments(options(['--title', 't', '--notes', '', '--priority', 'low']))).toEqual(
      ['add', 't', '--notes', '', '--priority', 'low'],
    );
    expect(boardAddArguments(options(['--title', 't', '--column', 'Todo']))).toEqual(
      ['add', 't', '--notes', '', '--priority', 'medium', '--column', 'Todo'],
    );
  });
});

describe('lostRace', () => {
  it('retries only the rejections a fresh fetch fixes', () => {
    expect(lostRace(' ! [rejected]        HEAD -> main (fetch first)')).toBe(true);
    expect(lostRace(' ! [rejected]        HEAD -> main (non-fast-forward)')).toBe(true);
    expect(lostRace(' ! [remote rejected] HEAD -> main (incorrect old value provided)')).toBe(true);
    expect(lostRace(' ! [remote rejected] HEAD -> main (pre-receive hook declined)')).toBe(false);
    expect(lostRace('remote: error: GH006: Protected branch update failed for refs/heads/main.')).toBe(false);
  });
});
