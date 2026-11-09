import { describe, expect, it } from 'vitest';
import { bind } from '../action';
import { paneSend, type PaneSendPorts } from './send';

// Pane 2:1 is a screen, 2:2 a shell, 2:3 Claude Code started as a worker, 2:4 Claude Code with no
// worker hooks (resumed from the drawer).
function panes(overrides: Partial<PaneSendPorts> = {}) {
  const typed: string[] = [];
  const prompted: string[] = [];
  const handed: string[] = [];
  const send = bind(paneSend, {
    agentIn: (id) => id !== '2:2',
    screenIn: (id) => id === '2:1',
    mainsWorkerIn: (id) => id === '2:3',
    handTo: (id, dispatcherPath) => { handed.push(`${id} ${dispatcherPath}`); },
    screenPrompt: (id, text) => id === '2:1' && prompted.push(`${id} ${text}`) > 0,
    typeIntoShell: (id, text) => { typed.push(`${id} ${text}`); },
    ...overrides,
  });
  return { send, typed, prompted, handed };
}

const reportLine = '\n\nSendMessage to main-api when done, saying what you did.';

describe('pane.send', () => {
  it('makes an agent a main sends work the main\'s worker, and tells it to report there', async () => {
    const { send, typed, prompted, handed } = panes();
    expect(await send.call({ id: '2:1', text: 'fix it', dispatcherPath: '/work/api' })).toEqual({ output: 'typed into 2:1', handed: true });
    await send.call({ id: '2:3', text: 'fix it', dispatcherPath: '/work/api' });
    expect(handed).toEqual(['2:1 /work/api', '2:3 /work/api']);
    expect(prompted).toEqual([`2:1 fix it${reportLine}`]);
    expect(typed).toEqual([`2:3 fix it${reportLine}`]);
  });

  it('types a main\'s text into a shell, or an agent with no worker hooks, as it is, and hands nothing over', async () => {
    const { send, typed, handed } = panes();
    expect(await send.call({ id: '2:2', text: 'npm test', dispatcherPath: '/work/api' })).toEqual({ output: 'typed into 2:2', handed: false });
    expect(await send.call({ id: '2:4', text: 'run the tests', dispatcherPath: '/work/api' })).toEqual({ output: 'typed into 2:4', handed: false });
    expect(typed).toEqual(['2:2 npm test', '2:4 run the tests']);
    expect(handed).toEqual([]);
  });

  it('refuses text from no main', async () => {
    const { send } = panes();
    expect(await send.call({ id: '2:1', text: 'fix it' })).toEqual({ refused: 'no pane or text was given' });
  });
});
