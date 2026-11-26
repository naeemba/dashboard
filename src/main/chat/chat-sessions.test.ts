import { describe, expect, it } from 'vitest';
import { afterReport, conversationReporter, flagSettingsOf, nextConversation, replayedFlagSettings, mainSessionStart, relayed, runningConversation, shownPreferences } from './chat-sessions';
import { slotConversation } from './slot-conversation';

describe('relayed', () => {
  const streamed = (event: unknown) => ({ type: 'stream_event', event });
  it('relays a hook starting and answering, not the lines it prints between', () => {
    expect(relayed({ type: 'system', subtype: 'hook_started' })).toBe(true);
    expect(relayed({ type: 'system', subtype: 'hook_progress' })).toBe(false);
  });

  it('relays streamed text', () => {
    expect(relayed(streamed({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'a' } }))).toBe(true);
  });
  it('relays streamed thinking, which the working line counts', () => {
    expect(relayed(streamed({ type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'a' } }))).toBe(true);
  });
  it('relays a tool input streaming in and a message\'s closing usage, which the working line counts', () => {
    expect(relayed(streamed({ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{' } }))).toBe(true);
    expect(relayed(streamed({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 90 } }))).toBe(true);
  });
  it('keeps a message starting and stopping', () => {
    expect(relayed(streamed({ type: 'message_start', message: {} }))).toBe(false);
    expect(relayed(streamed({ type: 'message_stop' }))).toBe(false);
  });
  it('keeps a subagent\'s stream, and relays its finished messages', () => {
    expect(relayed({ ...streamed({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'a' } }), parent_tool_use_id: 't1' })).toBe(false);
    expect(relayed({ type: 'assistant', parent_tool_use_id: 't1' })).toBe(true);
  });
  it('keeps a rate limit event that says the plan is fine', () => expect(relayed({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed' } })).toBe(false));
  it('relays a rate limit warning', () => expect(relayed({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed_warning' } })).toBe(true));
  it('relays a finished message', () => expect(relayed({ type: 'assistant' })).toBe(true));
  it('relays the suggested next prompt', () => expect(relayed({ type: 'prompt_suggestion' })).toBe(true));
  it('relays a prompt\'s lifecycle', () => expect(relayed({ type: 'command_lifecycle' })).toBe(true));
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

describe('flagSettingsOf', () => {
  it('sends only the flag-layer keys the change names, auto as null', () => {
    expect(flagSettingsOf({ model: 'opus' })).toEqual({});
    expect(flagSettingsOf({ effort: null })).toEqual({ effortLevel: null });
    expect(flagSettingsOf({ effort: 'high', fast: false })).toEqual({ effortLevel: 'high', fastMode: false });
    expect(flagSettingsOf({ fast: undefined })).toEqual({});
  });
});

describe('replayedFlagSettings', () => {
  it('replays auto effort and a chosen fast mode, and leaves any other effort to the query option', () => {
    expect(replayedFlagSettings(undefined)).toEqual({});
    expect(replayedFlagSettings({ effort: 'high' })).toEqual({});
    expect(replayedFlagSettings({ effort: null, fast: false })).toEqual({ effortLevel: null, fastMode: false });
    expect(replayedFlagSettings({ effort: 'high', fast: true })).toEqual({ fastMode: true });
  });

  it('does not replay a fast mode the session only reported', () => {
    const after = afterReport({ fast: true }, { fast: false, permissionMode: 'plan' });
    expect(after).toEqual({ chosen: { fast: true, permissionMode: 'plan' }, reportedFast: false });
    expect(replayedFlagSettings(after.chosen)).toEqual({ fastMode: true });
    expect(replayedFlagSettings(afterReport(undefined, { fast: true }).chosen)).toEqual({});
    expect(shownPreferences(after.chosen, after.reportedFast)).toEqual({ fast: false, permissionMode: 'plan' });
  });
});

describe('shownPreferences', () => {
  it('puts the reported fast mode over the chosen one, and leaves the choice alone without a report', () => {
    expect(shownPreferences({ fast: true }, false)).toEqual({ fast: false });
    expect(shownPreferences({ fast: true }, undefined)).toEqual({ fast: true });
    expect(shownPreferences(undefined, undefined)).toEqual({});
  });
});

describe('runningConversation', () => {
  it('reports a resume of the remembered conversation, which keeps its id', () => {
    expect(runningConversation({ type: 'system', subtype: 'init', session_id: 'remembered' })).toBe('remembered');
  });
  it('reports none after a /clear', () => expect(runningConversation({ type: 'conversation_reset' })).toBeNull());
  it('says nothing for any other message', () => expect(runningConversation({ type: 'assistant' })).toBeUndefined());
});

describe('conversationReporter', () => {
  it('lets only the session that reported last clear the conversation', () => {
    const reporters = conversationReporter<string>();
    reporters.report('/a', 'old');
    reporters.report('/a', 'new');
    expect(reporters.ended('/a', 'old')).toBe(false);
    expect(reporters.ended('/a', 'new')).toBe(true);
    expect(reporters.ended('/a', 'new')).toBe(false);
  });
});

describe('nextConversation', () => {
  const screen = { id: '1:2', projectPath: '/work/api', session: 'abc', resume: true, name: 'api-terminal-2', hooks: {}, owner: 'you' as const, carryOnIn: () => undefined };

  const onScreen = slotConversation(screen, 'mains', undefined);
  const page = slotConversation(undefined, 'mains', undefined);

  it('keeps a screen opened by hand off main\'s remembered conversation and its held cut', () => {
    expect(nextConversation(onScreen, screen, 'picked')).toEqual({ carryOnIn: 'picked' });
    expect(nextConversation(onScreen, screen, undefined)).toEqual({ carryOnIn: null });
    expect(nextConversation(onScreen, screen, { cutAt: 'm3' })).toEqual({ fork: 'm3' });
  });

  it('has the page\'s main remember the id, forget it, or hold the cut', () => {
    expect(nextConversation(page, undefined, 'picked')).toEqual({ remember: 'picked' });
    expect(nextConversation(page, undefined, undefined)).toEqual({ remember: undefined });
    expect(nextConversation(page, undefined, { cutAt: 'm3' })).toEqual({ cut: 'm3' });
  });

  it('leaves main alone when the screen closed while its fork ran', () => {
    expect(nextConversation(onScreen, undefined, 'forked')).toEqual({ nothing: true });
    expect(nextConversation(onScreen, undefined, { cutAt: 'm3' })).toEqual({ nothing: true });
  });
});
