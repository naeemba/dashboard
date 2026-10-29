import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { inputQueue, rememberedSessions } from './chat-sessions';

describe('inputQueue', () => {
  it('hands over what was pushed before and after the reader started, in order, until closed', async () => {
    const queue = inputQueue<string>();
    queue.push('first');
    const read: string[] = [];
    const reading = (async () => { for await (const each of queue) read.push(each); })();
    await Promise.resolve();
    queue.push('second');
    queue.push('third');
    queue.close();
    await reading;
    expect(read).toEqual(['first', 'second', 'third']);
  });

  it('still hands over what was pushed just before the close', async () => {
    const queue = inputQueue<string>();
    queue.push('last');
    queue.close();
    const read: string[] = [];
    for await (const each of queue) read.push(each);
    expect(read).toEqual(['last']);
  });
});

describe('rememberedSessions', () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'chat-sessions-'));
  const file = (name: string, text: string): string => {
    const at = path.join(folder, name);
    writeFileSync(at, text);
    return at;
  };

  it('reads the id remembered for each project', () => {
    expect(rememberedSessions(file('good.json', '{"/a": "id-1"}'))).toEqual({ '/a': 'id-1' });
  });

  it('leaves out anything that is not an id', () => {
    expect(rememberedSessions(file('mixed.json', '{"/a": "id-1", "/b": 3}'))).toEqual({ '/a': 'id-1' });
  });

  it('reads a missing or broken file as nothing remembered', () => {
    expect(rememberedSessions(path.join(folder, 'missing.json'))).toEqual({});
    expect(rememberedSessions(file('broken.json', '{'))).toEqual({});
    expect(rememberedSessions(file('list.json', '["id"]'))).toEqual({});
  });
});
