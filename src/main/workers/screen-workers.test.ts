import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { screenKey } from '../../shared/workers/screen-key';
import { savedScreens, screenSignal, screenWorkers } from './screen-workers';
import { temporaryFolder } from '../testing/temporary-folder';

let folder: string;
beforeEach(() => { folder = temporaryFolder('screen-workers-'); });

const SESSION = 'ccaaf965-c864-48db-8044-30bf27d93087';
const START = { session: SESSION, name: 'api-terminal-2', prompt: 'fix it\n\nSendMessage to main-api when done' };
// New Claude, as pane.dispatch starts it.
const BY_HAND = { session: 'mine', name: 'api-terminal-2', prompt: null };

function workers(file = path.join(folder, 'screen-workers.json'), kept: Record<string, { busy: boolean }> = {}) {
  const said: string[] = [];
  const screens = screenWorkers({
    file,
    changed: () => said.push('changed'),
    tell: (key, text) => said.push(`tell ${key} ${text.split('\n')[0]}`),
    stop: (key) => said.push(`stop ${key}`),
    start: (key) => said.push(`start ${key}`),
    host: { ready: Promise.resolve(), kept: (session) => (session in kept ? { key: session, ...kept[session] } : undefined), query: () => Promise.resolve(null) },
    notify: (id, state, waiting) => said.push(`${id} ${state}${waiting ? ` ${waiting.background}/${waiting.scheduled}` : ''}`),
    newSession: (projectPath) => { said.push(`new ${projectPath}`); return `new-${said.length}`; },
  });
  return { screens, said, file };
}

// What the SDK hands a hook callback; the abort signal is never read here.
const hookOptions = { signal: new AbortController().signal };

describe('screenSignal', () => {
  it('reads a question asked and gone, and the session started, and nothing else', () => {
    expect(screenSignal({ kind: 'ask', ask: { id: 'a', toolName: 'Bash', input: {}, defaultToNo: false, suppressAlwaysAllowRule: false } })).toBe('blocked');
    expect(screenSignal({ kind: 'ask-gone', id: 'a' })).toBe('running');
    expect(screenSignal({ kind: 'message', message: { type: 'system', subtype: 'init' } })).toBe('started');
    expect(screenSignal({ kind: 'message', message: { type: 'assistant' } })).toBeNull();
    expect(screenSignal({ kind: 'ended', error: null })).toBe('turn-over');
    expect(screenSignal({ kind: 'message', message: { type: 'result', subtype: 'error_during_execution' } })).toBe('turn-over');
  });
});

describe('screenWorkers', () => {
  it('draws the pane as a screen before it hands the session its first prompt', () => {
    const { screens, said } = workers();
    screens.start('2:1', '/work/api', '/work/api.worktrees/fix', START, null, '/work/api');
    expect(said).toEqual(['changed', `tell ${screenKey('2:1')} fix it`]);
    expect(screens.ids()).toEqual(['2:1']);
    expect(screens.directoryOf(screenKey('2:1'))).toBe('/work/api.worktrees/fix');
    expect(screens.folder('2:1')).toBe('/work/api.worktrees/fix');
    expect(screens.session(screenKey('2:1'))).toMatchObject({ session: SESSION, resume: false, name: 'api-terminal-2' });
    expect(screens.session(screenKey('2:2'))).toBeUndefined();
  });

  // The Stop hook's input is what PR #211 reads from stdin; here it arrives as an object.
  it('reports the turns its hooks hear, with what a stop still waits on', async () => {
    const { screens, said } = workers();
    screens.start('2:1', '/work/api', '/work/api', START, null, '/work/api');
    const hooks = screens.session(screenKey('2:1'))?.hooks ?? {};
    await hooks.UserPromptSubmit?.[0].hooks[0]({ hook_event_name: 'UserPromptSubmit' } as never, undefined, hookOptions);
    expect(screens.working('2:1')).toBe(true);
    await hooks.Stop?.[0].hooks[0]({ hook_event_name: 'Stop', background_tasks: [{}], session_crons: [] } as never, undefined, hookOptions);
    expect(said.slice(-2)).toEqual(['2:1 running', '2:1 done 1/0']);
    expect(screens.working('2:1')).toBe(false);
    expect(screens.working('2:2')).toBeUndefined();
  });

  it('stops the worker already in the pane before it starts another there', () => {
    const { screens, said } = workers();
    screens.start('2:1', '/work/api', '/work/api', START, null, '/work/api');
    screens.start('2:1', '/work/api', '/work/api', { ...START, session: 'next' }, null, '/work/api');
    expect(said.slice(2)).toEqual([`stop ${screenKey('2:1')}`, 'changed', `tell ${screenKey('2:1')} fix it`]);
    expect(screens.paneRunning(SESSION)).toBeUndefined();
    expect(screens.paneRunning('next')).toBe('2:1');
  });

  it('takes no hook from a worker the pane has let go of, even once another worker runs at its number', async () => {
    const { screens, said } = workers();
    screens.start('2:1', '/work/api', '/work/api', START, null, '/work/api');
    const released = screens.session(screenKey('2:1'))?.hooks ?? {};
    screens.drop('2:1');
    screens.start('2:1', '/work/api', '/work/api', START, null, '/work/api');
    await released.PostToolUse?.[0].hooks[0]({ hook_event_name: 'PostToolUse' } as never, undefined, hookOptions);
    await released.Stop?.[0].hooks[0]({ hook_event_name: 'Stop', background_tasks: [], session_crons: [] } as never, undefined, hookOptions);
    expect(said.filter((line) => line.startsWith('2:1 '))).toEqual([]);
    expect(screens.working('2:1')).toBe(true);
  });

  // Stop does not run for an interrupted turn or a session that dies; left working, the review sweep
  // would never start that card's review.
  it('ends the turn on the session result or its end, without telling main', async () => {
    const { screens, said } = workers();
    screens.start('2:1', '/work/api', '/work/api', START, null, '/work/api');
    const hooks = screens.session(screenKey('2:1'))?.hooks ?? {};
    await hooks.UserPromptSubmit?.[0].hooks[0]({ hook_event_name: 'UserPromptSubmit' } as never, undefined, hookOptions);
    screens.observe(screenKey('2:1'), { kind: 'message', message: { type: 'result', subtype: 'error_during_execution' } });
    expect(screens.working('2:1')).toBe(false);
    expect(said.at(-1)).toBe('2:1 running');
  });

  it('tells main a worker whose session failed, a refused start among them, has stopped', () => {
    const { screens, said } = workers();
    screens.start('2:1', '/work/api', '/work/api', START, null, '/work/api');
    screens.observe(screenKey('2:1'), { kind: 'ended', error: 'The screen host is running for another Dashboard' });
    expect(screens.working('2:1')).toBe(false);
    expect(said.at(-1)).toBe('2:1 done');
  });

  it('marks a question as blocked, and resumes the conversation once the session has started it', () => {
    const { screens, said } = workers();
    screens.start('2:1', '/work/api', '/work/api', START, null, '/work/api');
    screens.observe(screenKey('2:1'), { kind: 'ask', ask: { id: 'a', toolName: 'Bash', input: {}, defaultToNo: false, suppressAlwaysAllowRule: false } });
    screens.observe(screenKey('2:1'), { kind: 'message', message: { type: 'system', subtype: 'init' } });
    screens.observe(5, { kind: 'ask-gone', id: 'a' });
    expect(said.at(-1)).toBe('2:1 blocked');
    expect(screens.session(screenKey('2:1'))?.resume).toBe(true);
  });

  it('takes a pane send as the next prompt, and leaves any other pane to its terminal', () => {
    const { screens, said } = workers();
    screens.start('2:1', '/work/api', '/work/api', START, null, '/work/api');
    expect(screens.send('2:1', 'run the tests')).toBe(true);
    expect(screens.send('2:2', 'run the tests')).toBe(false);
    expect(said.at(-1)).toBe(`tell ${screenKey('2:1')} run the tests`);
  });

  it('stops the session when its pane goes, and forgets it', () => {
    const { screens, said, file } = workers();
    screens.start('2:1', '/work/api', '/work/api', START, null, '/work/api');
    screens.drop('2:1');
    screens.drop('2:1');
    expect(said.filter((line) => line.startsWith('stop'))).toEqual([`stop ${screenKey('2:1')}`]);
    expect(screens.has('2:1')).toBe(false);
    expect(savedScreens(file)).toEqual([]);
  });

  it('closes the screens working in a removed worktree, and only those', () => {
    const { screens, said } = workers();
    screens.start('2:1', '/work/api', '/work/api.worktrees/fix', START, 'c1', null);
    screens.start('2:2', '/work/api', '/work/api', START, null, '/work/api');
    said.length = 0;
    screens.closeIn('/work/api.worktrees/fix');
    expect(screens.ids()).toEqual(['2:2']);
    expect(said).toEqual([`stop ${screenKey('2:1')}`, 'changed']);
    screens.closeIn('/work/api.worktrees/fix');
    expect(said).toHaveLength(2);
  });

  // Slots are a launch's page order, so the worker comes back under whatever slot its project opens in.
  it('brings a worker back after a restart under the slot its project opens in, resuming it', () => {
    const before = workers();
    before.screens.start('2:3', '/work/api', '/work/api.worktrees/fix', START, 'card-1', '/work/desk');
    const after = workers(before.file);
    expect(after.screens.comeBack(5, '/work/other')).toEqual([]);
    expect(after.screens.comeBack(4, '/work/api')).toMatchObject([{ index: 3, directory: '/work/api.worktrees/fix', dispatcherPath: '/work/desk', cardId: 'card-1' }]);
    expect(after.screens.session(screenKey('4:3'))).toMatchObject({ session: SESSION, resume: false });
    expect(after.screens.working('4:3')).toBe(false);
    expect(after.screens.comeBack(4, '/work/api')).toEqual([]);
  });

  // The screen host kept the session through the restart: a turn still under way is counted working,
  // so the review sweep leaves its worktree alone, and the session is taken up at once to hear it.
  it('takes up at once a worker the screen host kept, working while its turn goes on', () => {
    const before = workers();
    before.screens.start('2:3', '/work/api', '/work/api', START, null, '/work/api');
    before.screens.start('2:4', '/work/api', '/work/api', { ...START, session: 'other' }, null, '/work/api');
    const after = workers(before.file, { [SESSION]: { busy: true }, other: { busy: false } });
    after.screens.comeBack(4, '/work/api');
    expect(after.screens.working('4:3')).toBe(true);
    expect(after.screens.working('4:4')).toBe(false);
    expect(after.said).toEqual([`start ${screenKey('4:3')}`, `start ${screenKey('4:4')}`]);
  });

  // Resuming an id with no transcript fails every prompt after the restart.
  it('resumes after a restart only a conversation the session wrote', () => {
    const before = workers();
    before.screens.start('2:3', '/work/api', '/work/api', START, null, '/work/api');
    before.screens.observe(screenKey('2:3'), { kind: 'message', message: { type: 'system', subtype: 'init' } });
    const after = workers(before.file);
    after.screens.comeBack(4, '/work/api');
    expect(after.screens.session(screenKey('4:3'))).toMatchObject({ resume: true });
  });

  it('opens a screen by hand as yours, with no first prompt', () => {
    const { screens, said } = workers();
    screens.start('2:1', '/work/api', '/work/api', BY_HAND, null, null);
    expect(said).toEqual(['changed']);
    expect(screens.folder('2:1')).toBe('/work/api');
    expect(screens.session(screenKey('2:1'))).toMatchObject({ session: 'mine', resume: false, owner: 'you' });
  });

  it('carries a screen opened by hand on in another conversation, and brings it back there as yours', () => {
    const before = workers();
    before.screens.start('2:1', '/work/api', '/work/api', BY_HAND, null, null);
    before.screens.session(screenKey('2:1'))?.carryOnIn('picked');
    expect(before.screens.session(screenKey('2:1'))).toMatchObject({ session: 'picked', resume: true });
    const after = workers(before.file);
    expect(after.screens.comeBack(3, '/work/api')).toMatchObject([{ session: 'picked', dispatcherPath: null }]);
    expect(after.screens.session(screenKey('3:1'))).toMatchObject({ session: 'picked', resume: true, owner: 'you' });
    after.screens.session(screenKey('3:1'))?.carryOnIn(null);
    expect(after.screens.session(screenKey('3:1'))).toMatchObject({ resume: false, owner: 'you' });
    expect(after.said).toEqual(['new /work/api']);
  });

  it('brings main\'s worker back as main\'s', () => {
    const before = workers();
    before.screens.start('2:3', '/work/api', '/work/api', START, null, '/work/desk');
    const after = workers(before.file);
    after.screens.comeBack(4, '/work/api');
    expect(after.screens.session(screenKey('4:3'))?.owner).toBe('main');
  });

  it('reads a file that is missing or not its own as nobody to bring back', () => {
    const file = path.join(folder, 'screen-workers.json');
    expect(savedScreens(file)).toEqual([]);
    writeFileSync(file, '{"not": "a list"}');
    expect(savedScreens(file)).toEqual([]);
    writeFileSync(file, JSON.stringify([{ projectPath: '/work/api', index: 'three' }]));
    expect(savedScreens(file)).toEqual([]);
    expect(readFileSync(file, 'utf8')).toContain('three');
  });
});
