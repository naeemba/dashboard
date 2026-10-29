import { describe, expect, it } from 'vitest';
import { addPrompt, applyEvent, applyMessage, EMPTY_TRANSCRIPT, type Transcript } from './chat-transcript';

const fold = (messages: Record<string, unknown>[], start: Transcript = EMPTY_TRANSCRIPT): Transcript =>
  messages.reduce(applyMessage, start);

const assistant = (content: unknown[]) => ({ type: 'assistant', parent_tool_use_id: null, message: { content } });
const delta = (text: string) => ({
  type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', delta: { type: 'text_delta', text } },
});

describe('applyMessage', () => {
  it('streams text into the live line, then swaps it for the finished block', () => {
    const streaming = fold([delta('Hel'), delta('lo')]);
    expect(streaming.live).toBe('Hello');
    const done = applyMessage(streaming, assistant([{ type: 'text', text: 'Hello' }]));
    expect(done.live).toBe('');
    expect(done.entries).toEqual([{ kind: 'text', text: 'Hello' }]);
  });

  it('pairs a tool result with its call', () => {
    const transcript = fold([
      assistant([{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }]),
      { type: 'user', parent_tool_use_id: null, message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'a\nb' }] } },
    ]);
    expect(transcript.entries).toEqual([{
      kind: 'tool', id: 't1', name: 'Bash', input: { command: 'ls' }, result: { text: 'a\nb', images: [], isError: false },
    }]);
  });

  it('keeps the image a tool returned', () => {
    const transcript = fold([
      assistant([{ type: 'tool_use', id: 't1', name: 'Read', input: {} }]),
      {
        type: 'user', parent_tool_use_id: null, message: {
          content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } }] }],
        },
      },
    ]);
    const entry = transcript.entries[0];
    expect(entry.kind === 'tool' && entry.result?.images).toEqual([{ mediaType: 'image/png', data: 'AAA' }]);
  });

  it('leaves a subagent\'s own messages out', () => {
    const transcript = applyMessage(EMPTY_TRANSCRIPT, { ...assistant([{ type: 'text', text: 'inner' }]), parent_tool_use_id: 't1' });
    expect(transcript.entries).toEqual([]);
  });

  it('reads a prompt from a saved session as what you said', () => {
    const transcript = applyMessage(EMPTY_TRANSCRIPT, { type: 'user', parent_tool_use_id: null, message: { content: 'hi' } });
    expect(transcript.entries).toEqual([{ kind: 'user', text: 'hi', images: [] }]);
  });

  it('ends the turn on its result and says nothing when it went well', () => {
    const transcript = applyMessage(addPrompt(EMPTY_TRANSCRIPT, 'hi', []), { type: 'result', subtype: 'success', is_error: false });
    expect(transcript.busy).toBe(false);
    expect(transcript.entries).toHaveLength(1);
  });

  it('says why a turn ended badly', () => {
    const transcript = applyMessage(EMPTY_TRANSCRIPT, { type: 'result', subtype: 'error_max_turns', is_error: true, errors: ['too many'] });
    expect(transcript.entries).toEqual([{ kind: 'notice', text: 'too many' }]);
  });

  it('takes the session, model and mode from init', () => {
    const transcript = applyMessage(EMPTY_TRANSCRIPT, {
      type: 'system', subtype: 'init', session_id: 's', model: 'opus', permissionMode: 'default',
    });
    expect([transcript.sessionId, transcript.model, transcript.permissionMode]).toEqual(['s', 'opus', 'default']);
  });
});

describe('applyEvent', () => {
  it('stops being busy when the session ends, and says why', () => {
    const transcript = applyEvent(addPrompt(EMPTY_TRANSCRIPT, 'hi', []), { kind: 'ended', error: 'spawn ENOENT' });
    expect(transcript.busy).toBe(false);
    expect(transcript.entries.at(-1)).toEqual({ kind: 'notice', text: 'The session ended: spawn ENOENT' });
  });
});
