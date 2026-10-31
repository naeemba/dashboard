import { describe, expect, it } from 'vitest';
import { conversationAfterRewind, forkFrom, promptAfterRewind, restoredNotice, resumeFrom, rewindChoices, rewindPoints, rewindRows, rewoundTo } from './chat-rewind';

const said = (uuid: string, text: string) => ({ type: 'user', uuid, parent_tool_use_id: null, message: { content: [{ type: 'text', text }] } });
const answered = (uuid: string) => ({ type: 'assistant', uuid, parent_tool_use_id: null, message: { content: [{ type: 'text', text: 'ok' }] } });

describe('rewindPoints', () => {
  it('lists the prompts typed, each with the message before it', () => {
    const messages = [
      said('p1', 'first'), answered('a1'),
      { type: 'user', uuid: 'r1', parent_tool_use_id: null, message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'x' }] } },
      said('s1', '<bash-input>ls</bash-input>'),
      { type: 'user', uuid: 'm1', isMeta: true, parent_tool_use_id: null, message: { content: [{ type: 'text', text: 'injected' }] } },
      said('p2', 'second'),
    ];
    expect(rewindPoints(messages)).toEqual([
      { id: 'p1', before: null, text: 'first' },
      { id: 'p2', before: 'm1', text: 'second' },
    ]);
  });
});

describe('rewoundTo', () => {
  const messages = [{ uuid: 'a' }, { uuid: 'b' }, { uuid: 'c' }];

  it('keeps the conversation up to and including the message the resume stops at', () => {
    expect(rewoundTo(messages, 'b')).toEqual([{ uuid: 'a' }, { uuid: 'b' }]);
  });

  it('keeps all of it with no rewind pending, or one this conversation does not hold', () => {
    expect(rewoundTo(messages, undefined)).toBe(messages);
    expect(rewoundTo(messages, 'z')).toBe(messages);
  });
});

describe('rewindRows', () => {
  const points = [{ id: 'p1', before: null, text: 'fix the build' }, { id: 'p2', before: 'a1', text: 'add a test\nwith detail' }];

  it('lists the newest first by its first line', () => {
    expect(rewindRows(points, '').map((row) => row.name)).toEqual(['add a test', 'fix the build']);
  });

  it('keeps only what matches the search', () => {
    expect(rewindRows(points, 'build').map((row) => row.choice.id)).toEqual(['p1']);
  });
});

describe('rewindChoices', () => {
  it('offers both, the conversation and the code, filtered by what is typed', () => {
    expect(rewindChoices('').map((row) => row.choice)).toEqual([
      { code: true, conversation: true }, { code: false, conversation: true }, { code: true, conversation: false },
    ]);
    expect(rewindChoices('code').map((row) => row.name)).toEqual(['Restore code and conversation', 'Restore code']);
  });
});

describe('restoredNotice', () => {
  it('counts the files the dry run named', () => {
    expect(restoredNotice({ canRewind: true, filesChanged: ['a', 'b'], skippedLinks: 0 })).toEqual({ error: false, text: 'Code restored: 2 files put back.' });
  });

  it('says why nothing went back', () => {
    expect(restoredNotice({ canRewind: false, error: 'No checkpoint' })).toEqual({ error: true, text: 'Code not restored: No checkpoint.' });
  });
});

describe('promptAfterRewind', () => {
  const point = { id: 'p2', before: 'a1', text: 'add a test' };

  it('hands the prompt back when the conversation went back', () => {
    expect(promptAfterRewind(point, { code: false, conversation: true }, null)).toBe('add a test');
    expect(promptAfterRewind(point, { code: true, conversation: true }, { error: false })).toBe('add a test');
  });

  it('hands nothing back for code alone, or when the code could not go back', () => {
    expect(promptAfterRewind(point, { code: true, conversation: false }, { error: false })).toBeUndefined();
    expect(promptAfterRewind(point, { code: true, conversation: true }, { error: true })).toBeUndefined();
  });
});

describe('conversationAfterRewind', () => {
  const first = { id: 'p1', before: null, text: 'first' };
  const later = { id: 'p2', before: 'a1', text: 'second' };
  const both = { code: true, conversation: true };

  it('leaves the conversation alone when the code could not go back, or only the code was picked', () => {
    expect(conversationAfterRewind(later, both, { canRewind: false, error: 'No checkpoint' })).toBe('keep');
    expect(conversationAfterRewind(later, { code: true, conversation: false }, { canRewind: true })).toBe('keep');
  });

  it('starts a new conversation before the first prompt, and cuts before any later one', () => {
    expect(conversationAfterRewind(first, { code: false, conversation: true }, null)).toBe('forget');
    expect(conversationAfterRewind(later, both, { canRewind: true })).toEqual({ cutAt: 'a1' });
  });
});

describe('resumeFrom', () => {
  it('forks at the cut when one is pending, and resumes the whole conversation otherwise', () => {
    expect(resumeFrom('s1', 'a1')).toEqual({ resume: 's1', resumeSessionAt: 'a1', forkSession: true });
    expect(resumeFrom('s1', undefined)).toEqual({ resume: 's1', resumeSessionAt: undefined, forkSession: false });
  });
});

describe('forkFrom', () => {
  it('copies up to the cut when one is pending, the whole conversation otherwise, and names it only when a name was typed', () => {
    expect(forkFrom('/p', 'a1', 'other fix')).toEqual({ dir: '/p', upToMessageId: 'a1', title: 'other fix' });
    expect(forkFrom('/p', undefined, '')).toEqual({ dir: '/p', upToMessageId: undefined, title: undefined });
  });
});
