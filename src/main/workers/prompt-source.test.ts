import { describe, expect, it } from 'vitest';
import { isTyped, promptSources } from './prompt-source';

describe('promptSources', () => {
  it('counts the first typed prompt as main\'s, whoever started the worker', () => {
    const prompts = promptSources();
    expect(prompts.fromUser('2:1')).toBe(false);
    prompts.prompted('2:1', 'sdk');
    expect(prompts.fromUser('2:1')).toBe(false);
  });

  it('counts a typed prompt with nothing handed since the last as yours, and one after a handoff as main\'s', () => {
    const prompts = promptSources();
    prompts.prompted('2:1', 'user');
    prompts.prompted('2:1', 'user');
    expect(prompts.fromUser('2:1')).toBe(true);
    prompts.handed('2:1');
    expect(prompts.fromUser('2:1')).toBe(true);
    prompts.prompted('2:1', 'user');
    expect(prompts.fromUser('2:1')).toBe(false);
  });

  it('leaves the turn as it was for a session waking itself, or a hook that names no source', () => {
    const prompts = promptSources();
    prompts.prompted('2:1', 'user');
    prompts.prompted('2:1', 'user');
    prompts.prompted('2:1', 'system');
    prompts.prompted('2:1', undefined);
    expect(prompts.fromUser('2:1')).toBe(true);
    prompts.forget('2:1');
    expect(prompts.fromUser('2:1')).toBe(false);
  });

  it('reads only the composer and the Agent SDK as typed', () => {
    expect(['user', 'sdk', 'system', 'loop_wakeup', 'schedule_wakeup', undefined].map(isTyped))
      .toEqual([true, true, false, false, false, false]);
  });
});
