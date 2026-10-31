import { describe, expect, it } from 'vitest';
import { asksUltrathink, commandMenu, effortRows, footEffort, namedEffort, completion, droppedFiles, fileMention, localCommandOutput, mentionInsertion, modelRows, namedModel, nextCopyBlock, pickedModel, planSends, resumeRows, screenCommand, shellExchange, tabFill, typedCommand, type CommandRow } from './chat-commands';

const row = (name: string, extra: Partial<CommandRow> = {}): CommandRow => ({ name, description: name, argumentHint: '', ...extra });

describe('screenCommand', () => {
  it('takes /resume and /plan for the screen', () => {
    expect(screenCommand('/resume')).toEqual({ kind: 'resume' });
    expect(screenCommand('/diff')).toEqual({ kind: 'diff' });
    expect(screenCommand('/rewind')).toEqual({ kind: 'rewind' });
    expect(screenCommand('  /plan  add a login page ')).toEqual({ kind: 'plan', rest: 'add a login page' });
    expect(screenCommand('/plan')).toEqual({ kind: 'plan', rest: '' });
    expect(screenCommand('/branch')).toEqual({ kind: 'branch', rest: '' });
    expect(screenCommand('/branch  try the other fix ')).toEqual({ kind: 'branch', rest: 'try the other fix' });
    expect(screenCommand('/model')).toEqual({ kind: 'model', rest: '' });
    expect(screenCommand('/model sonnet')).toEqual({ kind: 'model', rest: 'sonnet' });
    expect(screenCommand('/effort  max ')).toEqual({ kind: 'effort', rest: 'max' });
    expect(screenCommand('/rename  board drag fix ')).toEqual({ kind: 'rename', rest: 'board drag fix' });
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

describe('tabFill', () => {
  it('takes the picked command over the suggestion', () => {
    expect(tabFill(row('compact'), '', 'fix the test')).toEqual({ kind: 'command', row: row('compact') });
  });
  it('leaves a typed box alone', () => expect(tabFill(null, 'half a prompt', 'fix the test')).toBeNull());
  it('does nothing without a suggestion', () => expect(tabFill(null, '', null)).toBeNull());
  it('fills an empty box with the suggestion', () => {
    expect(tabFill(null, '', 'fix the test')).toEqual({ kind: 'suggestion', text: 'fix the test' });
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

describe('fileMention', () => {
  it('mentions a dropped file by its path, quoted when it has a space', () => {
    expect(fileMention('/home/me/notes.md')).toBe('@/home/me/notes.md');
    expect(fileMention('/home/me/my notes.md')).toBe('@"/home/me/my notes.md"');
  });
});

describe('mentionInsertion', () => {
  it('sets the mentions off from a word before them, and leaves a space after', () => {
    expect(mentionInsertion('look at', ['@a', '@b'])).toBe(' @a @b ');
    expect(mentionInsertion('look at ', ['@a'])).toBe('@a ');
    expect(mentionInsertion('', ['@a'])).toBe('@a ');
  });
});

describe('droppedFiles', () => {
  const png = { type: 'image/png', path: '/a.png' };
  const text = { type: 'text/plain', path: '/notes.txt' };
  const pageSvg = { type: 'image/svg+xml', path: '' };
  it('attaches pictures and mentions every other file on disk', () => {
    expect(droppedFiles([png, text])).toEqual({ pictures: [png], paths: ['/notes.txt'], refused: false });
  });
  it('leaves out a file with no path, and refuses a drop that leaves nothing', () => {
    expect(droppedFiles([pageSvg, text])).toEqual({ pictures: [], paths: ['/notes.txt'], refused: false });
    expect(droppedFiles([pageSvg])).toEqual({ pictures: [], paths: [], refused: true });
  });
  it('does not refuse a drop of pictures alone', () => {
    expect(droppedFiles([png, pageSvg])).toEqual({ pictures: [png], paths: [], refused: false });
  });
});

describe('localCommandOutput', () => {
  it('reads what a slash command printed back as its output, with the escapes undone', () => {
    expect(localCommandOutput('<local-command-stdout>Set model to `opus (claude-opus-5-5)`</local-command-stdout>'))
      .toBe('Set model to `opus (claude-opus-5-5)`');
    expect(localCommandOutput('<local-command-stderr>no such model: &lt;x&gt;</local-command-stderr>')).toBe('no such model: <x>');
  });

  it('reads the caveat that rides along as nothing to show', () => {
    expect(localCommandOutput('<local-command-caveat>The command below was run directly in Claude Code.</local-command-caveat>')).toBe('');
  });

  it('leaves any other message alone', () => {
    expect(localCommandOutput('set the model')).toBeNull();
    expect(localCommandOutput('<system-reminder>x</system-reminder>')).toBeNull();
  });
});

describe('shellExchange', () => {
  it('reads a command run with ! back as the line typed', () => {
    expect(shellExchange('<bash-input>git push gitlab HEAD</bash-input>')).toEqual({ kind: 'input', text: '! git push gitlab HEAD' });
  });

  it('reads what it printed as stdout then stderr, with the escapes undone', () => {
    expect(shellExchange('<bash-stdout>a  HEAD -&gt; main\n</bash-stdout><bash-stderr>warned</bash-stderr>'))
      .toEqual({ kind: 'output', text: 'a  HEAD -> main\nwarned' });
    expect(shellExchange('<bash-stdout>done</bash-stdout><bash-stderr></bash-stderr>')).toEqual({ kind: 'output', text: 'done' });
  });

  it('leaves any other message alone', () => {
    expect(shellExchange('push it')).toBeNull();
    expect(shellExchange("Why does `shellExchange('<bash-stdout>done</bash-stdout>')` fail here?")).toBeNull();
    expect(shellExchange('see <bash-input>ls</bash-input> above')).toBeNull();
  });

  it('keeps the line typed as it was typed', () => {
    expect(shellExchange("<bash-input>echo '&amp;' > x</bash-input>")).toEqual({ kind: 'input', text: "! echo '&amp;' > x" });
  });
});

describe('nextCopyBlock', () => {
  it('starts at the first block and walks on while the same entry is selected', () => {
    expect(nextCopyBlock(null, 3, 2)).toBe(0);
    expect(nextCopyBlock({ entry: 3, block: 0 }, 3, 2)).toBe(1);
    expect(nextCopyBlock({ entry: 3, block: 1 }, 3, 2)).toBe(0);
    expect(nextCopyBlock({ entry: 5, block: 1 }, 3, 2)).toBe(0);
  });

  it('has nothing to copy in an entry with no block', () => {
    expect(nextCopyBlock(null, 3, 0)).toBeNull();
  });
});

describe('namedEffort', () => {
  it('reads a level or auto, and refuses any other word', () => {
    expect(namedEffort('XHigh')).toBe('xhigh');
    expect(namedEffort('auto')).toBeNull();
    expect(namedEffort('ultra')).toBeUndefined();
  });
});

describe('effortRows', () => {
  it('lists auto then the levels, marking the one the screen is on', () => {
    expect(effortRows('high', '').map((row) => row.name)).toEqual(['auto', 'low', 'medium', '● high', 'xhigh', 'max']);
    expect(effortRows(null, '')[0]).toMatchObject({ name: '● auto', choice: null });
  });

  it('marks no row before a level is picked', () => {
    expect(effortRows(undefined, '').some((row) => row.name.startsWith('● '))).toBe(false);
  });

  it('keeps the levels holding what is typed', () => {
    expect(effortRows(null, 'HI').map((row) => row.choice)).toEqual(['high', 'xhigh']);
  });
});

describe('asksUltrathink', () => {
  it('finds the keyword as a word in any case', () => {
    expect(asksUltrathink('Ultrathink about the cache')).toBe(true);
    expect(asksUltrathink('ultrathinking is not it')).toBe(false);
  });
});

describe('footEffort', () => {
  const asked = (text: string) => ({ kind: 'user' as const, text, images: [] });

  it('names the level chosen, auto, or the default before any pick', () => {
    expect(footEffort('high', 'ready', [])).toEqual({ label: 'high effort', ultrathink: false });
    expect(footEffort(null, 'working', [])).toEqual({ label: 'auto effort', ultrathink: false });
    expect(footEffort(undefined, 'ready', [])).toEqual({ label: 'default effort', ultrathink: false });
  });

  it('says ultrathink only while the turn of a prompt asking for it runs or waits', () => {
    const entries = [asked('ultrathink about the cache')];
    expect(footEffort('low', 'working', entries)).toEqual({ label: 'ultrathink', ultrathink: true });
    expect(footEffort('low', 'waiting', entries).ultrathink).toBe(true);
    expect(footEffort('low', 'ready', entries).label).toBe('low effort');
  });

  it('goes by the newest prompt, one sent while the turn runs included', () => {
    expect(footEffort('high', 'working', [asked('ultrathink first'), asked('then this')]).label).toBe('high effort');
    expect(footEffort('high', 'working', [asked('plain first'), asked('ultrathink this')]).label).toBe('ultrathink');
  });
});
