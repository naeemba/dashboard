import { describe, expect, it } from 'vitest';
import { isTyped, promptSources } from './prompt-source';
import { workerPrompt } from './dispatch';
import { asksForReport } from '../../shared/workers/done-report';

describe('promptSources', () => {
  it('counts the first typed prompt as main\'s, whoever started the worker', () => {
    const prompts = promptSources();
    expect(prompts.fromUser('2:1')).toBe(false);
    prompts.prompted('2:1', 'sdk', false);
    expect(prompts.fromUser('2:1')).toBe(false);
  });

  it('counts a typed prompt asking for a report as main\'s and any other as yours, in any order', () => {
    const prompts = promptSources();
    prompts.prompted('2:1', 'user', true);
    prompts.prompted('2:1', 'user', false);
    expect(prompts.fromUser('2:1')).toBe(true);
    // Two sends queued behind your prompt are both main's.
    prompts.prompted('2:1', 'user', true);
    expect(prompts.fromUser('2:1')).toBe(false);
    prompts.prompted('2:1', 'user', true);
    expect(prompts.fromUser('2:1')).toBe(false);
  });

  it('leaves the turn as it was for a session waking itself, or a hook that names no source', () => {
    const prompts = promptSources();
    prompts.prompted('2:1', 'user', false);
    prompts.prompted('2:1', 'user', false);
    prompts.prompted('2:1', 'system', false);
    prompts.prompted('2:1', undefined, true);
    expect(prompts.fromUser('2:1')).toBe(true);
    prompts.forget('2:1');
    expect(prompts.fromUser('2:1')).toBe(false);
  });

  it('reads only the composer and the Agent SDK as typed', () => {
    expect(['user', 'sdk', 'system', 'loop_wakeup', 'schedule_wakeup', undefined].map(isTyped))
      .toEqual([true, true, false, false, false, false]);
  });
});

describe('asksForReport', () => {
  it('reads the line every prompt main hands a worker ends with, and nothing you would type', () => {
    expect(asksForReport(workerPrompt('rebase on main', '/work/api'))).toBe(true);
    expect(asksForReport(`${workerPrompt('rebase on main', '/work/api')}\n`)).toBe(true);
    expect(asksForReport('rebase on main')).toBe(false);
    expect(asksForReport('what does "SendMessage to main-api when done, saying what you did." mean?')).toBe(false);
  });
});
