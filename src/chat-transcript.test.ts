import { describe, expect, it } from 'vitest';
import {
  applyEvent, applyMessage, conversationChange, EMPTY_TRANSCRIPT, imagesFit, preferencesOf, withEarlier, working, type Transcript,
} from './chat-transcript';

const prompted = (said: string): Transcript => applyEvent(EMPTY_TRANSCRIPT, { kind: 'prompt', content: [{ type: 'text', text: said }] });

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
    const transcript = applyMessage(prompted('hi'), { type: 'result', subtype: 'success', is_error: false });
    expect(transcript.busy).toBe(false);
    expect(transcript.entries).toHaveLength(1);
  });

  it('says why a turn ended badly', () => {
    const transcript = applyMessage(EMPTY_TRANSCRIPT, { type: 'result', subtype: 'error_max_turns', is_error: true, errors: ['too many'] });
    expect(transcript.entries).toEqual([{ kind: 'notice', text: 'too many' }]);
  });

  it('says a turn stopped by Escape was stopped', () => {
    expect(applyMessage(prompted('hi'), { type: 'result', subtype: 'error_during_execution', is_error: true }).entries.at(-1))
      .toEqual({ kind: 'notice', text: 'Stopped.' });
  });

  it('draws the stop the session writes in your name as one notice, not as something you said', () => {
    const interrupted = { type: 'user', parent_tool_use_id: null, message: { content: [{ type: 'text', text: '[Request interrupted by user]' }] } };
    const stopped = fold([interrupted, { type: 'result', subtype: 'error_during_execution', is_error: true }], prompted('count'));
    expect(stopped.entries.slice(1)).toEqual([{ kind: 'notice', text: 'Stopped.' }]);
  });

  it('reads a saved slash command back as it was typed', () => {
    const saved = { type: 'user', parent_tool_use_id: null, message: { content: '<command-message>pr-loop</command-message>\n<command-name>/pr-loop</command-name>\n<command-args>12</command-args>' } };
    expect(applyMessage(EMPTY_TRANSCRIPT, saved).entries).toEqual([{ kind: 'user', text: '/pr-loop 12', images: [] }]);
  });

  it('says when the conversation was compacted', () => {
    expect(applyMessage(EMPTY_TRANSCRIPT, { type: 'system', subtype: 'compact_boundary' }).entries)
      .toEqual([{ kind: 'notice', text: 'Conversation compacted.' }]);
  });

  it('starts the live line again when a new block starts', () => {
    const transcript = fold([delta('old'), { type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_start' } }]);
    expect(transcript.live).toBe('');
  });

  it('takes the model from init', () => {
    expect(applyMessage(EMPTY_TRANSCRIPT, { type: 'system', subtype: 'init', model: 'opus' }).model).toBe('opus');
  });

  it('cuts a long tool output when it arrives', () => {
    const transcript = fold([
      assistant([{ type: 'tool_use', id: 't1', name: 'Bash', input: {} }]),
      { type: 'user', parent_tool_use_id: null, message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'x'.repeat(30_000) }] } },
    ]);
    const entry = transcript.entries[0];
    expect(entry.kind === 'tool' && entry.result?.text).toMatch(/… 10000 more characters$/);
  });
});

describe('applyEvent', () => {
  it('stops being busy when the session ends, and says why', () => {
    const transcript = applyEvent(prompted('hi'), { kind: 'ended', error: 'spawn ENOENT' });
    expect(transcript.busy).toBe(false);
    expect(transcript.entries.at(-1)).toEqual({ kind: 'notice', text: 'The session ended: spawn ENOENT' });
  });
});

describe('imagesFit', () => {
  it('takes a screenshot under 5 MB', () => expect(imagesFit([4_000_000])).toBe(true));
  it('refuses one over it', () => expect(imagesFit([6_000_000])).toBe(false));
  it('counts a prompt\'s images together', () => expect(imagesFit([3_000_000, 3_000_000])).toBe(false));
});

describe('the prompt event', () => {
  it('shows what was asked, images too, and is busy until the result', () => {
    const transcript = applyEvent(EMPTY_TRANSCRIPT, {
      kind: 'prompt',
      content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } }, { type: 'text', text: 'what is this' }],
    });
    expect(transcript.busy).toBe(true);
    expect(transcript.entries).toEqual([{ kind: 'user', text: 'what is this', images: [{ mediaType: 'image/png', data: 'AAA' }] }]);
  });
});

describe('preferencesOf', () => {
  it('takes a choice made on any screen', () => {
    expect(preferencesOf({ kind: 'configured', change: { permissionMode: 'acceptEdits' } })).toEqual({ permissionMode: 'acceptEdits' });
  });
  it('takes the mode the session started in', () => {
    expect(preferencesOf({ kind: 'message', message: { type: 'system', subtype: 'init', permissionMode: 'acceptEdits' } }))
      .toEqual({ permissionMode: 'acceptEdits' });
  });
  it('takes a mode the session moved to by itself, such as a plan approved', () => {
    expect(preferencesOf({ kind: 'message', message: { type: 'system', subtype: 'status', status: null, permissionMode: 'acceptEdits' } }))
      .toEqual({ permissionMode: 'acceptEdits' });
  });
  it('says nothing about any other message', () => {
    expect(preferencesOf({ kind: 'message', message: { type: 'system', subtype: 'status', status: 'compacting' } })).toBeNull();
    expect(preferencesOf({ kind: 'message', message: { type: 'assistant' } })).toBeNull();
  });
});

describe('withEarlier', () => {
  const earlier = [{ type: 'user', parent_tool_use_id: null, message: { content: 'before' } }];
  it('draws the earlier conversation on an empty screen', () => {
    expect(withEarlier(EMPTY_TRANSCRIPT, earlier).entries).toEqual([{ kind: 'user', text: 'before', images: [] }]);
  });
  it('drops it once something newer is on screen', () => {
    expect(withEarlier(prompted('now'), earlier).entries).toEqual([{ kind: 'user', text: 'now', images: [] }]);
  });
});

describe('working', () => {
  it('is idle with no turn and no question', () => expect(working(EMPTY_TRANSCRIPT, 0)).toBe(false));
  it('is working during a turn', () => expect(working(prompted('hi'), 0)).toBe(true));
  it('is working while a question waits', () => expect(working(EMPTY_TRANSCRIPT, 1)).toBe(true));
});

describe('conversationChange', () => {
  const init = (id: string) => ({ type: 'system', subtype: 'init', session_id: id });
  it('remembers a conversation init names for the first time', () => expect(conversationChange(init('b'), 'a')).toEqual({ remember: 'b', reset: false }));
  it('leaves the one already remembered', () => expect(conversationChange(init('a'), 'a')).toEqual({ reset: false }));
  it('forgets it and clears every screen on /clear', () => {
    expect(conversationChange({ type: 'conversation_reset' }, 'a')).toEqual({ remember: null, reset: true });
  });
  it('changes nothing for any other message', () => expect(conversationChange({ type: 'assistant' }, 'a')).toEqual({ reset: false }));
});

describe('the working line\'s count', () => {
  const block = (type: string) => ({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_start', content_block: { type } } });
  const thought = (thinking: string) => ({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking } } });

  it('counts thinking and text as they stream, says which is streaming, and starts over with the next turn', () => {
    const streaming = fold([block('thinking'), thought('abcd'), block('text'), delta('hello')], prompted('hi'));
    expect([streaming.streamed, streaming.thinking, streaming.live]).toEqual([9, false, 'hello']);
    expect(fold([block('thinking')], prompted('hi')).thinking).toBe(true);
    const ended = applyMessage(streaming, { type: 'result', subtype: 'success' });
    expect([ended.streamed, ended.thinking, ended.started]).toEqual([0, false, null]);
  });

  it('goes on counting, from the same start, when a prompt is sent while the turn runs', () => {
    const first = fold([delta('abcd')], prompted('hi'));
    const joined = applyEvent(first, { kind: 'prompt', content: [{ type: 'text', text: 'and this' }] });
    expect([fold([delta('ef')], joined).streamed, joined.started]).toEqual([6, first.started]);
  });
});
