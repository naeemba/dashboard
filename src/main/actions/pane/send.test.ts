import { describe, expect, it } from 'vitest';
import { bind } from '../action';
import { paneSend } from './send';

describe('pane.send', () => {
  it('hands the text to a screen as its prompt, and types it into the shell only when there is none', async () => {
    const typed: string[] = [];
    const send = bind(paneSend, {
      screenPrompt: (id) => id === '2:1',
      typeIntoShell: (id, text) => { typed.push(`${id} ${text}`); },
    });
    expect(await send.call({ id: '2:1', text: 'run the tests' })).toEqual({ output: 'typed into 2:1' });
    await send.call({ id: '2:2', text: 'run the tests' });
    expect(typed).toEqual(['2:2 run the tests']);
  });
});
