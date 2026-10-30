import { describe, expect, it } from 'vitest';
import { commandMenu, completion, modelRows, namedModel, pickedModel, planSends, resumeRows, screenCommand, typedCommand, type CommandRow } from './chat-commands';

const row = (name: string, extra: Partial<CommandRow> = {}): CommandRow => ({ name, description: name, argumentHint: '', ...extra });

describe('screenCommand', () => {
  it('takes /resume and /plan for the screen', () => {
    expect(screenCommand('/resume')).toEqual({ kind: 'resume' });
    expect(screenCommand('  /plan  add a login page ')).toEqual({ kind: 'plan', rest: 'add a login page' });
    expect(screenCommand('/plan')).toEqual({ kind: 'plan', rest: '' });
    expect(screenCommand('/model')).toEqual({ kind: 'model', rest: '' });
    expect(screenCommand('/model sonnet')).toEqual({ kind: 'model', rest: 'sonnet' });
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

describe('resumeRows', () => {
  const now = Date.UTC(2026, 9, 29);
  const found = {
    current: 'b',
    sessions: [
      { sessionId: 'a', summary: 'Fix the board drag', lastModified: now - 3_600_000, gitBranch: 'main' },
      { sessionId: 'b', summary: 'Claude screen parity', lastModified: now - 60_000, gitBranch: 'chat' },
    ],
  };
  it('lists newest first with the current one marked', () => {
    expect(resumeRows(found, '', now).map((row) => row.name)).toEqual(['● Claude screen parity', 'Fix the board drag']);
  });
  it('keeps what matches the title or branch', () => {
    expect(resumeRows(found, 'board', now).map((row) => row.choice)).toEqual(['a']);
  });
});

describe('typedCommand', () => {
  it('reads a saved command back as it was typed', () => {
    expect(typedCommand('<command-message>work-card</command-message>\n<command-name>/work-card</command-name>\n<command-args>abc</command-args>'))
      .toBe('/work-card abc');
    expect(typedCommand('<command-name>/context</command-name>\n            <command-args></command-args>')).toBe('/context');
  });
  it('keeps arguments that hold a <', () => {
    expect(typedCommand('<command-name>/pr-review</command-name>\n<command-args>make sure x < y holds</command-args>'))
      .toBe('/pr-review make sure x < y holds');
  });
  it('leaves a prompt that is not one', () => expect(typedCommand('fix the build')).toBeNull());
});

describe('planSends', () => {
  it('only switches the mode when nothing came with it', () => expect(planSends('', 0)).toBe(false));
  it('sends what was typed after it', () => expect(planSends('add a login page', 0)).toBe(true));
  it('sends a pasted image on its own', () => expect(planSends('', 1)).toBe(true));
});

describe('completion', () => {
  it('runs a command without arguments on Enter', () => expect(completion(row('compact'), true)).toEqual({ text: '/compact', runs: true }));
  it('holds one on Tab, ready for more', () => expect(completion(row('compact'), false)).toEqual({ text: '/compact ', runs: false }));
  it('holds one that takes arguments even on Enter', () => {
    expect(completion(row('plan', { argumentHint: '[what]' }), true)).toEqual({ text: '/plan ', runs: false });
  });
});

describe('modelRows', () => {
  const models = [
    { value: 'default', resolvedModel: 'claude-opus-5-5', displayName: 'Default', description: 'recommended' },
    { value: 'opus', resolvedModel: 'claude-opus-5-5', displayName: 'Opus', description: 'most capable' },
    { value: 'haiku', displayName: 'Haiku', description: 'fastest' },
  ];

  it('lists the session\'s models in its order and marks the one on, by alias or full id', () => {
    expect(modelRows(models, 'claude-opus-5-5', '').map((each) => each.name)).toEqual(['Default', '● Opus', 'Haiku']);
    expect(modelRows(models, 'haiku', '').map((each) => each.name)).toEqual(['Default', 'Opus', '● Haiku']);
    expect(modelRows(models, null, '').some((each) => each.name.startsWith('●'))).toBe(false);
  });

  it('keeps only what matches what is typed, and picks by value', () => {
    expect(modelRows(models, null, 'hai').map((each) => each.choice)).toEqual(['haiku']);
  });

  it('finds a typed name by alias, full id or shown name, and nothing for a misspelling', () => {
    expect(namedModel(models, 'opus')).toBe('opus');
    expect(namedModel(models, 'claude-opus-5-5')).toBe('opus');
    expect(namedModel(models, 'Haiku')).toBe('haiku');
    expect(namedModel(models, 'opsu')).toBeNull();
  });

  it('keeps the default row as no model named, as the model key does', () => {
    expect([pickedModel('default'), pickedModel('opus')]).toEqual([null, 'opus']);
  });
});
