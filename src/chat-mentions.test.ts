import { describe, expect, it } from 'vitest';
import { fileRows, mentionAt, pickMention } from './chat-mentions';

describe('mentionAt', () => {
  it('finds the @ word the caret is in', () => {
    expect(mentionAt('@', 1)).toEqual({ start: 0, query: '' });
    expect(mentionAt('read @src/ch', 12)).toEqual({ start: 5, query: 'src/ch' });
    expect(mentionAt('read @src/ch and', 12)).toEqual({ start: 5, query: 'src/ch' });
  });
  it('leaves an email address, a finished mention and a quoted one alone', () => {
    expect(mentionAt('mail a@b.com', 12)).toBeNull();
    expect(mentionAt('@src/a.ts ', 10)).toBeNull();
    expect(mentionAt('@"my file.ts"', 13)).toBeNull();
    expect(mentionAt('no mention', 10)).toBeNull();
  });
});

describe('fileRows', () => {
  const files = ['src/chat-view.ts', 'src/deep/folder/chat/view.test.ts', 'README.md', 'src/chat.css'];
  it('puts the tightest match first, then the shorter path', () => {
    expect(fileRows(files, 'chatview')).toEqual(['src/chat-view.ts', 'src/deep/folder/chat/view.test.ts']);
    expect(fileRows(files, '')).toEqual(['README.md', 'src/chat.css', 'src/chat-view.ts', 'src/deep/folder/chat/view.test.ts']);
  });
  it('drops what does not match and shows at most 50', () => {
    expect(fileRows(files, 'zzz')).toEqual([]);
    expect(fileRows(Array.from({ length: 80 }, (_, at) => `file${at}`), '')).toHaveLength(50);
  });
});

describe('pickMention', () => {
  it('replaces the whole @ word with the mention and a space', () => {
    expect(pickMention('read @ch', 8, 'src/chat-view.ts')).toEqual({ text: 'read @src/chat-view.ts ', caret: 23 });
    expect(pickMention('read @ch-x now', 8, 'a.ts')).toEqual({ text: 'read @a.ts now', caret: 11 });
  });
  it('keeps the line break after the @ word', () => {
    expect(pickMention('read @ch\nmore', 8, 'a.ts')).toEqual({ text: 'read @a.ts \nmore', caret: 11 });
  });
  it('quotes a path with a space', () => {
    expect(pickMention('@my', 3, 'my file.ts')).toEqual({ text: '@"my file.ts" ', caret: 14 });
  });
  it('leaves the box alone when the caret has left the @ word', () => {
    expect(pickMention('@ch done', 8, 'a.ts')).toEqual({ text: '@ch done', caret: 8 });
  });
});
