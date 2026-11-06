import { describe, expect, it } from 'vitest';
import { channels } from '../app/channels';
import { APP_VERBS, BOARD_REQUEST } from '../board/board-cli';
import { action, actionRequests, bind, registerActions, verbOf } from './action';
import { cardActions, type CardActionsMain } from './card/card-actions';

// An action that answers with what it was given, so the test sees what each door handed it.
const echo = action<null, Record<string, unknown>, { output: string }>('card.echo', {
  words: ['id', 'column'],
  input: (raw) => (raw.id === 'no' ? { refused: 'not that one' } : raw),
  run: async (_ports, input) => ({ output: JSON.stringify(input) }),
});

const otherwise = async () => ({ ok: true, output: 'the session command' });

describe('the action registry', () => {
  it('binds an action to its channel, with the screen as the user', async () => {
    const table = channels();
    registerActions(table, [bind(echo, null)]);
    expect(table.handled()).toEqual(['card:echo']);
    const answer = await table.invoke('local', 'card:echo', [{ projectPath: '/work/api', id: 'card', column: 'Done', source: 'command' }]);
    expect(JSON.parse((answer as { output: string }).output)).toEqual({ projectPath: '/work/api', id: 'card', column: 'Done', source: 'user' });
    await expect(table.invoke('local', 'card:echo', [{ id: 'no' }])).resolves.toEqual({ refused: 'not that one' });
  });

  it('binds the same action to its board verb, with the command as the source', async () => {
    const answer = actionRequests([{ ...bind(echo, null), name: 'card.move' }], otherwise);
    const reply = await answer({ directory: '/', args: [BOARD_REQUEST, 'move', '/work/api', 'card', 'Done'] });
    expect(reply.ok).toBe(true);
    expect(JSON.parse(reply.output)).toEqual({ projectPath: '/work/api', id: 'card', column: 'Done', source: 'command' });
    await expect(answer({ directory: '/', args: [BOARD_REQUEST, 'move', '/work/api', 'card'] }))
      .resolves.toEqual({ ok: false, output: 'usage: board move <id> <column>' });
    await expect(answer({ directory: '/', args: [BOARD_REQUEST, 'move', '/work/api', 'no', 'Done'] }))
      .resolves.toEqual({ ok: false, output: 'not that one' });
    await expect(answer({ directory: '/', args: ['claim'] })).resolves.toEqual({ ok: true, output: 'the session command' });
  });

  // What main serves, not a list beside it: the actions cardActions binds and the channels it registers.
  it('serves exactly the verbs the command asks for, and a channel only for card.move', () => {
    const table = channels();
    const { actions } = cardActions({ table, worktrees: () => [] } as unknown as CardActionsMain);
    expect(actions.map((each) => verbOf(each.name))).toEqual([...APP_VERBS]);
    expect(table.handled()).toEqual(['card:move']);
  });
});
