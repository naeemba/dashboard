import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { inputQueue, mainSessionStart, pathFromShell, relayed, rememberedSessions } from './chat-sessions';

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

describe('pathFromShell', () => {
  it('takes the last line, past whatever the shell printed on start', () => {
    expect(pathFromShell('Welcome back\n/home/me/.nvm/bin:/usr/bin', '/usr/bin')).toBe('/home/me/.nvm/bin:/usr/bin');
  });
  it('keeps the app\'s own when the shell said nothing', () => expect(pathFromShell('', '/usr/bin')).toBe('/usr/bin'));
});

describe('relayed', () => {
  const streamed = (event: unknown) => ({ type: 'stream_event', event });
  it('relays streamed text', () => {
    expect(relayed(streamed({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'a' } }))).toBe(true);
  });
  it('relays streamed thinking, which the working line counts', () => {
    expect(relayed(streamed({ type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'a' } }))).toBe(true);
  });
  it('keeps a tool input streaming in, which for a Write is the whole file', () => {
    expect(relayed(streamed({ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{' } }))).toBe(false);
  });
  it('keeps a subagent\'s stream, and relays its finished messages', () => {
    expect(relayed({ ...streamed({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'a' } }), parent_tool_use_id: 't1' })).toBe(false);
    expect(relayed({ type: 'assistant', parent_tool_use_id: 't1' })).toBe(true);
  });
  it('keeps a rate limit event that says the plan is fine', () => expect(relayed({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed' } })).toBe(false));
  it('relays a rate limit warning', () => expect(relayed({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed_warning' } })).toBe(true));
  it('relays a finished message', () => expect(relayed({ type: 'assistant' })).toBe(true));
  it('relays the suggested next prompt', () => expect(relayed({ type: 'prompt_suggestion' })).toBe(true));
});

describe('mainSessionStart', () => {
  it('carries on the conversation the terminal main left over one the Claude view remembered', () => {
    expect(mainSessionStart('view', 'terminal', undefined).resume).toBe('terminal');
  });

  it('resumes what is remembered when the terminal main left nothing', () => {
    expect(mainSessionStart('view', undefined, undefined).resume).toBe('view');
    expect(mainSessionStart(undefined, undefined, undefined).resume).toBeUndefined();
  });

  it('starts in auto mode unless the screen chose another, and keeps the model chosen', () => {
    expect(mainSessionStart(undefined, undefined, undefined).preferences).toEqual({ permissionMode: 'auto' });
    expect(mainSessionStart(undefined, undefined, { model: 'opus', permissionMode: 'plan' }).preferences)
      .toEqual({ model: 'opus', permissionMode: 'plan' });
  });
});
