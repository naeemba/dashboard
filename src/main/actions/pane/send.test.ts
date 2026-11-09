import { describe, expect, it } from 'vitest';
import { bind } from '../action';
import { paneSend, type PaneSendPorts } from './send';

// Pane 2:1 is a screen, 2:2 a shell, 2:3 Claude Code in its terminal.
function panes(overrides: Partial<PaneSendPorts> = {}) {
  const typed: string[] = [];
  const prompted: string[] = [];
  const handed: string[] = [];
  const send = bind(paneSend, {
    agentIn: (id) => id !== '2:2',
    handTo: (id, dispatcherPath) => { handed.push(`${id} ${dispatcherPath}`); },
    screenPrompt: (id, text) => id === '2:1' && prompted.push(`${id} ${text}`) > 0,
    typeIntoShell: (id, text) => { typed.push(`${id} ${text}`); },
    ...overrides,
  });
  return { send, typed, prompted, handed };
}

const reportLine = '\n\nSendMessage to main-api when done, saying what you did.';

describe('pane.send', () => {
  it('hands the text to a screen as its prompt, and types it into the shell only when there is none', async () => {
    const { send, typed, prompted } = panes();
    expect(await send.call({ id: '2:1', text: 'run the tests', dispatcherPath: null })).toEqual({ output: 'typed into 2:1', handed: false });
    await send.call({ id: '2:2', text: 'run the tests', dispatcherPath: null });
    expect(prompted).toEqual(['2:1 run the tests']);
    expect(typed).toEqual(['2:2 run the tests']);
  });

  it('makes an agent a main sends work the main\'s worker, and tells it to report there', async () => {
    const { send, typed, prompted, handed } = panes();
    expect(await send.call({ id: '2:1', text: 'fix it', dispatcherPath: '/work/api' })).toEqual({ output: 'typed into 2:1', handed: true });
    await send.call({ id: '2:3', text: 'fix it', dispatcherPath: '/work/api' });
    expect(handed).toEqual(['2:1 /work/api', '2:3 /work/api']);
    expect(prompted).toEqual([`2:1 fix it${reportLine}`]);
    expect(typed).toEqual([`2:3 fix it${reportLine}`]);
  });

  it('types a main\'s text into a shell as it is, and hands nothing over', async () => {
    const { send, typed, handed } = panes();
    expect(await send.call({ id: '2:2', text: 'npm test', dispatcherPath: '/work/api' })).toEqual({ output: 'typed into 2:2', handed: false });
    expect(typed).toEqual(['2:2 npm test']);
    expect(handed).toEqual([]);
  });
});
