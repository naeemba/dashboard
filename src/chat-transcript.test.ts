import { describe, expect, it, vi } from 'vitest';
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

  it('stamps a message with when it was written and the model that wrote it', () => {
    const transcript = fold([
      { type: 'user', parent_tool_use_id: null, timestamp: '2026-11-01T09:00:00.000Z', message: { content: 'hi' } },
      { ...assistant([{ type: 'text', text: 'Hello' }]), timestamp: '2026-11-01T09:00:05.000Z', message: { model: 'claude-opus-5-5', content: [{ type: 'text', text: 'Hello' }] } },
    ]);
    expect(transcript.entries).toEqual([
      { kind: 'user', text: 'hi', images: [], at: Date.parse('2026-11-01T09:00:00.000Z') },
      { kind: 'text', text: 'Hello', at: Date.parse('2026-11-01T09:00:05.000Z'), model: 'claude-opus-5-5' },
    ]);
  });

  it('keeps the time but drops the model on a notice Claude Code wrote itself', () => {
    const transcript = fold([
      { ...assistant([{ type: 'text', text: 'Limit hit' }]), timestamp: '2026-11-01T09:00:05.000Z', message: { model: '<synthetic>', content: [{ type: 'text', text: 'Limit hit' }] } },
    ]);
    expect(transcript.entries).toEqual([{ kind: 'text', text: 'Limit hit', at: Date.parse('2026-11-01T09:00:05.000Z') }]);
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

  it('leaves out a subagent\'s message whose call is not listed', () => {
    const transcript = applyMessage(EMPTY_TRANSCRIPT, { ...assistant([{ type: 'text', text: 'inner' }]), parent_tool_use_id: 't1' });
    expect(transcript).toBe(EMPTY_TRANSCRIPT);
  });

  it('folds a subagent\'s own steps into the call that started it, and its subagent\'s into its call', () => {
    const under = (id: string, message: Record<string, unknown>) => ({ ...message, parent_tool_use_id: id });
    const transcript = fold([
      assistant([{ type: 'tool_use', id: 'a1', name: 'Agent', input: { description: 'look' } }]),
      under('a1', assistant([{ type: 'text', text: 'Reading it.' }, { type: 'tool_use', id: 'r1', name: 'Read', input: { file_path: 'x' } }])),
      under('a1', { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'r1', content: 'ok' }] } }),
      under('a1', assistant([{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'false' } }])),
      under('a1', { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'b1', content: 'boom', is_error: true }] } }),
      under('a1', assistant([{ type: 'tool_use', id: 'a2', name: 'Agent', input: {} }])),
      under('a2', assistant([{ type: 'text', text: 'deeper' }])),
      under('a1', { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'x' } } }),
    ]);
    const call = transcript.entries[0];
    expect(transcript.entries).toHaveLength(1);
    expect(transcript.live).toBe('');
    expect(call.kind === 'tool' && call.steps).toEqual([
      { kind: 'text', text: 'Reading it.' },
      { kind: 'tool', id: 'r1', name: 'Read', input: { file_path: 'x' }, result: { text: '', images: [], isError: false } },
      { kind: 'tool', id: 'b1', name: 'Bash', input: { command: 'false' }, result: { text: '', images: [], isError: true } },
      { kind: 'tool', id: 'a2', name: 'Agent', input: {}, result: null, steps: [{ kind: 'text', text: 'deeper' }] },
    ]);
  });

  it('folds what Claude Code wrote for a subagent to its line, and leaves out its prompt', () => {
    const under = (message: Record<string, unknown>) => ({ ...message, parent_tool_use_id: 'a1' });
    const transcript = fold([
      assistant([{ type: 'tool_use', id: 'a1', name: 'Agent', input: { prompt: 'look' } }]),
      under({ type: 'user', message: { content: [{ type: 'text', text: 'look' }] } }),
      under(assistant([{ type: 'tool_use', id: 's1', name: 'Skill', input: { skill: 'review' } }])),
      under({ type: 'user', isSynthetic: true, sourceToolUseID: 's1', message: { content: [{ type: 'text', text: '# Review\nsteps' }] } }),
    ]);
    const call = transcript.entries[0];
    expect(call.kind === 'tool' && call.steps?.map((step) => step.kind)).toEqual(['tool', 'notice']);
    expect(call.kind === 'tool' && call.steps?.[1]).toEqual({ kind: 'notice', text: 'review skill' });
  });

  it('keeps the transcript when a subagent\'s message adds no step', () => {
    const start = fold([
      assistant([{ type: 'tool_use', id: 'a1', name: 'Agent', input: {} }]),
      { ...assistant([{ type: 'text', text: 'said' }]), parent_tool_use_id: 'a1' },
    ]);
    expect(applyMessage(start, { ...assistant([{ type: 'thinking', thinking: 'hm' }]), parent_tool_use_id: 'a1' })).toBe(start);
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

  it('leaves the SDK\'s diagnostic out of why a turn ended', () => {
    const ended = { type: 'result', subtype: 'error_during_execution', is_error: true, errors: ['[ede_diagnostic] result_type=user last_content_type=n/a stop_reason=null'] };
    expect(applyMessage(prompted('hi'), ended).entries.at(-1)).toEqual({ kind: 'notice', text: 'Stopped.' });
  });

  it('draws what a slash command printed as a notice, and its caveat as nothing', () => {
    const said = (content: string) => ({ type: 'user', parent_tool_use_id: null, message: { content } });
    const ran = fold([said('<local-command-caveat>Run directly in Claude Code.</local-command-caveat>'),
      said('<local-command-stdout>Set model to `opus`</local-command-stdout>')], EMPTY_TRANSCRIPT);
    expect(ran.entries).toEqual([{ kind: 'notice', text: 'Set model to `opus`' }]);
  });

  it('folds a skill\'s instructions under the call that loaded it, never as something you said', () => {
    const call = { type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id: 't1', name: 'Skill', input: { skill: 'simplify' } }] } };
    const body = { type: 'user', parent_tool_use_id: null, isMeta: true, sourceToolUseID: 't1', message: { content: [{ type: 'text', text: 'Review the diff.' }] } };
    expect(fold([call, body]).entries.at(-1)).toEqual({ kind: 'event', title: 'simplify skill', body: 'Review the diff.' });
  });

  it('still hands a synthetic message\'s tool result to its call', () => {
    const call = { type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: {} }] } };
    const result = { type: 'user', parent_tool_use_id: null, isSynthetic: true, message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } };
    expect(fold([call, result]).entries).toHaveLength(1);
    expect(fold([call, result]).entries[0]).toMatchObject({ kind: 'tool', result: { text: 'ok' } });
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

  it('folds thinking to one line, and draws nothing for thinking with no text', () => {
    const transcript = fold([assistant([
      { type: 'thinking', thinking: 'Check the tests first.' },
      { type: 'thinking', thinking: '' },
      { type: 'redacted_thinking', data: 'x' },
    ])]);
    expect(transcript.entries).toEqual([{ kind: 'event', title: 'Thinking', body: 'Check the tests first.' }]);
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

  it('drops the tasks the ended session was running', () => {
    const running = applyMessage(prompted('hi'), { type: 'system', subtype: 'task_started', task_id: 'a', description: 'Review a' });
    expect(running.tasks).toHaveLength(1);
    expect(applyEvent(running, { kind: 'ended', error: null }).tasks).toEqual([]);
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
    expect(transcript.entries).toEqual([{ kind: 'user', text: 'what is this', images: [{ mediaType: 'image/png', data: 'AAA' }], at: expect.any(Number) }]);
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
  it('takes the fast mode the session reports, cooldown as still on', () => {
    expect(preferencesOf({ kind: 'message', message: { type: 'system', subtype: 'init', permissionMode: 'auto', fast_mode_state: 'on' } }))
      .toEqual({ permissionMode: 'auto', fast: true });
    expect(preferencesOf({ kind: 'message', message: { type: 'result', fast_mode_state: 'cooldown' } })).toEqual({ fast: true });
    expect(preferencesOf({ kind: 'message', message: { type: 'result', fast_mode_state: 'off' } })).toEqual({ fast: false });
  });
  it('says nothing about any other message', () => {
    expect(preferencesOf({ kind: 'message', message: { type: 'system', subtype: 'status', status: 'compacting' } })).toBeNull();
    expect(preferencesOf({ kind: 'message', message: { type: 'result' } })).toBeNull();
    expect(preferencesOf({ kind: 'message', message: { type: 'assistant' } })).toBeNull();
  });
});

describe('withEarlier', () => {
  const earlier = [{ type: 'user', parent_tool_use_id: null, message: { content: 'before' } }];
  it('draws the earlier conversation on an empty screen', () => {
    expect(withEarlier(EMPTY_TRANSCRIPT, earlier).entries).toEqual([{ kind: 'user', text: 'before', images: [] }]);
  });
  it('drops it once something newer is on screen', () => {
    expect(withEarlier(prompted('now'), earlier).entries).toEqual([{ kind: 'user', text: 'now', images: [], at: expect.any(Number) }]);
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
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_000);
      const first = fold([delta('abcd')], prompted('hi'));
      vi.setSystemTime(5_000);
      const joined = applyEvent(first, { kind: 'prompt', content: [{ type: 'text', text: 'and this' }] });
      expect([first.started, fold([delta('ef')], joined).streamed, joined.started]).toEqual([1_000, 6, 1_000]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('a command run with !', () => {
  const said = (text: string) => ({ type: 'user', parent_tool_use_id: null, message: { content: [{ type: 'text', text }] } });

  it('is the line typed, then a block of what it printed', () => {
    const transcript = fold([said('<bash-input>ls</bash-input>'), said('<bash-stdout>a.txt</bash-stdout><bash-stderr></bash-stderr>')]);
    expect(transcript.entries).toEqual([{ kind: 'user', text: '! ls', images: [], ran: true }, { kind: 'shell', text: 'a.txt' }]);
  });
});

describe('a message Claude Code injected', () => {
  it('is one folded event, not the person\'s words', () => {
    const notification = {
      type: 'user', parent_tool_use_id: null, origin: { kind: 'task-notification' },
      message: { content: '<task-notification><summary>Agent "Review" finished</summary><result>done</result></task-notification>' },
    };
    expect(fold([notification]).entries).toEqual([{ kind: 'event', title: 'Agent "Review" finished', body: 'done' }]);
  });
});

describe('the suggested next prompt', () => {
  const suggested = fold([{ type: 'result', subtype: 'success' }, { type: 'prompt_suggestion', suggestion: 'run the tests' }]);

  it('is held after the turn\'s result', () => expect(suggested.suggestion).toBe('run the tests'));

  it('is dropped when a prompt is sent', () => {
    expect(applyEvent(suggested, { kind: 'prompt', content: [{ type: 'text', text: 'hi' }] }).suggestion).toBeNull();
  });

  it('is dropped when a turn nobody typed here starts', () => {
    expect(applyMessage(suggested, delta('On it')).suggestion).toBeNull();
    expect(applyMessage(suggested, assistant([{ type: 'text', text: 'On it' }])).suggestion).toBeNull();
  });

  it('is dropped by the next result and when the session ends', () => {
    expect(applyMessage(suggested, { type: 'result', subtype: 'success' }).suggestion).toBeNull();
    expect(applyEvent(suggested, { kind: 'ended', error: null }).suggestion).toBeNull();
  });

  it('survives a task update between turns', () => {
    expect(applyMessage(suggested, { type: 'system', subtype: 'task_started', task_id: 'a' }).suggestion).toBe('run the tests');
  });

  it('is not held when it is blank', () => {
    expect(applyMessage(EMPTY_TRANSCRIPT, { type: 'prompt_suggestion', suggestion: '  ' }).suggestion).toBeNull();
  });
});
