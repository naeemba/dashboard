import { describe, expect, it } from 'vitest';
import { bind } from '../action';
import { paneSend, startsClaude, STARTS_CLAUDE_REFUSAL, type PaneSendPorts } from './send';

// Pane 2:1 is a screen, 2:2 a shell, 2:3 Claude Code started as a worker, 2:4 Claude Code with no
// worker hooks (resumed from the drawer), 2:5 a shell running a program (a Claude opened by hand, nvim).
function panes(overrides: Partial<PaneSendPorts> = {}) {
  const typed: string[] = [];
  const prompted: string[] = [];
  const handed: string[] = [];
  const send = bind(paneSend, {
    agentIn: (id) => id !== '2:2' && id !== '2:5',
    programRunsIn: (id) => id === '2:5',
    screenIn: (id) => id === '2:1',
    mainsWorkerIn: (id) => id === '2:3',
    handTo: (id, dispatcherPath) => { handed.push(`${id} ${dispatcherPath}`); },
    prompt: (id, text) => { (id === '2:1' ? prompted : typed).push(`${id} ${text}`); },
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
    expect(await send.call({ id: '2:1', text: 'fix it' })).toEqual({ refused: 'no pane, text or sending main was given' });
  });

  it('refuses to type claude into a shell, and types the same text to an agent as a prompt', async () => {
    const { send, typed } = panes();
    expect(await send.call({ id: '2:2', text: 'claude "fix it"', dispatcherPath: '/work/api' })).toEqual({ refused: STARTS_CLAUDE_REFUSAL });
    expect(typed).toEqual([]);
    await send.call({ id: '2:4', text: 'claude hooks are broken', dispatcherPath: '/work/api' });
    await send.call({ id: '2:5', text: 'claude hooks are broken', dispatcherPath: '/work/api' });
    expect(typed).toEqual(['2:4 claude hooks are broken', '2:5 claude hooks are broken']);
  });
});

describe('startsClaude', () => {
  it('finds claude as the first word of any command, by name or path', () => {
    for (const text of ['claude', '  claude --resume', 'cd ../web && claude "go"', '/opt/claude-code/bin/claude -p x', 'true; claude', 'env FOO=1 claude', 'exec claude', `bash -lc 'claude -p "fix it"'`, 'sh -c "claude"', 'powershell -Command claude', "pwsh -c 'claude -p x'", 'cmd /c claude']) {
      expect(startsClaude(text), text).toBe(true);
    }
  });

  it('leaves other text alone', () => {
    for (const text of ['npm test', 'claudette', 'echo claude', 'ls ~/.claude', 'git commit -m "claude"', 'echo "x; claude"']) {
      expect(startsClaude(text), text).toBe(false);
    }
  });
});
