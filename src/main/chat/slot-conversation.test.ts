import { describe, expect, it } from 'vitest';
import type { ScreenSession } from './chat-sessions';
import { onScreen, slotConversation } from './slot-conversation';

const screen = (owner: 'main' | 'you', resume: boolean): ScreenSession => ({
  id: '1:2', projectPath: '/work/api', session: 'abc', resume, name: 'api-terminal-2', hooks: {}, owner, carryOnIn: () => undefined,
});

describe('slotConversation', () => {
  it('names a screen its own conversation once written, never main\'s, and no cut', () => {
    expect(slotConversation(screen('you', true), 'mains', 'm3')).toMatchObject({ live: 'abc', cut: undefined, mains: 'mains', remembers: false });
    expect(slotConversation(screen('you', false), 'mains', 'm3').live).toBeUndefined();
  });

  it('starts a new screen under its own id and resumes one whose conversation is written', () => {
    expect(slotConversation(screen('main', false), 'mains', undefined).opening).toEqual({ sessionId: 'abc' });
    expect(slotConversation(screen('main', true), 'mains', undefined).opening).toEqual({ resume: 'abc' });
  });

  it('has the page resume the remembered conversation up to a pending cut', () => {
    const page = slotConversation(undefined, 'mains', 'm3');
    expect(page).toMatchObject({ screen: undefined, live: 'mains', cut: 'm3', mains: undefined, remembers: true });
    expect(page.opening).toEqual({ resume: 'mains', resumeSessionAt: 'm3', forkSession: true });
  });

  it('keeps the conversation only on main\'s worker screen', () => {
    expect(slotConversation(screen('main', true), undefined, undefined).keeps).toBe(true);
    expect(slotConversation(screen('you', true), undefined, undefined).keeps).toBe(false);
    expect(slotConversation(undefined, undefined, undefined).keeps).toBe(false);
  });
});

describe('onScreen', () => {
  it('marks the live conversation, and none while the page holds a cut', () => {
    expect(onScreen(slotConversation(undefined, 'mains', undefined))).toBe('mains');
    expect(onScreen(slotConversation(undefined, 'mains', 'm3'))).toBeNull();
    expect(onScreen(slotConversation(screen('you', false), 'mains', 'm3'))).toBeNull();
  });
});
