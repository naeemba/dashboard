import { describe, expect, it } from 'vitest';
import { commandMenu, screenCommand, typedCommand, type CommandRow } from './chat-commands';

const row = (name: string, extra: Partial<CommandRow> = {}): CommandRow => ({ name, description: name, argumentHint: '', ...extra });

describe('screenCommand', () => {
  it('takes /resume and /plan for the screen', () => {
    expect(screenCommand('/resume')).toEqual({ kind: 'resume' });
    expect(screenCommand('  /plan  add a login page ')).toEqual({ kind: 'plan', rest: 'add a login page' });
    expect(screenCommand('/plan')).toEqual({ kind: 'plan', rest: '' });
  });
  it('leaves every other command, and a word that only starts the same, to the session', () => {
    expect(screenCommand('/compact')).toBeNull();
    expect(screenCommand('/planner')).toBeNull();
    expect(screenCommand('resume')).toBeNull();
  });
});

describe('commandMenu', () => {
  const session = [row('pr-loop'), row('compact', { builtin: true }), row('loop', { builtin: true }), row('usage', { aliases: ['cost'] })];

  it('lists only while a slash and a name are all that is typed', () => {
    expect(commandMenu('/', session).length).toBeGreaterThan(0);
    expect(commandMenu('/pr-loop 12', session)).toEqual([]);
    expect(commandMenu('hello', session)).toEqual([]);
  });

  it('puts names that start with what was typed before aliases, then names that hold it', () => {
    expect(commandMenu('/lo', session).map((each) => each.name)).toEqual(['loop', 'pr-loop']);
    expect(commandMenu('/co', session).map((each) => each.name)).toEqual(['compact', 'usage']);
  });

  it('shows a name listed twice once, as the session\'s own', () => {
    const twice = commandMenu('/loop', [row('loop', { description: 'mine' }), row('loop', { builtin: true, description: 'builtin' })]);
    expect(twice.map((each) => each.description)).toEqual(['builtin']);
  });

  it('answers /resume with the screen\'s row, not the session\'s', () => {
    expect(commandMenu('/resume', [row('resume', { description: 'unavailable' })])[0].description).not.toBe('unavailable');
  });
});

describe('typedCommand', () => {
  it('reads a saved command back as it was typed', () => {
    expect(typedCommand('<command-message>work-card</command-message>\n<command-name>/work-card</command-name>\n<command-args>abc</command-args>'))
      .toBe('/work-card abc');
    expect(typedCommand('<command-name>/context</command-name>\n            <command-args></command-args>')).toBe('/context');
  });
  it('leaves a prompt that is not one', () => expect(typedCommand('fix the build')).toBeNull());
});
