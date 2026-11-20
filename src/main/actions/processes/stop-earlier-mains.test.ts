import { describe, expect, it } from 'vitest';
import { bind } from '../action';
import { mainScopeDescription } from '../../processes/main-scopes';
import { processesStopEarlierMains } from './stop-earlier-mains';

const OWNER = '/home/sharp/.config/Dashboard';

function shown(units: Record<string, string>): string {
  return Object.entries(units).map(([unit, launch]) => `Id=${unit}\nActiveState=active\nDescription=${mainScopeDescription(OWNER, launch)}`).join('\n\n');
}

// A user manager running `running`, whose stop ends every unit asked but those in `stuck`.
function manager(running: Record<string, string>, stuck: string[] = []) {
  const stops: string[][] = [];
  const bound = bind(processesStopEarlierMains, {
    list: async () => shown(running),
    async stop(units) {
      stops.push(units);
      for (const unit of units) if (!stuck.includes(unit)) delete running[unit];
      if (stuck.length > 0) throw new Error('Connection timed out');
    },
  });
  return { stops, call: () => bound.call({ owner: OWNER, launch: 'thisone1' }) };
}

describe('processes.stop-earlier-mains', () => {
  it("stops an earlier launch's mains and leaves this launch's", async () => {
    const { stops, call } = manager({ 'agent-main-a-k4f2.scope': 'earlier1', 'agent-main-b-x9q0.scope': 'thisone1' });
    expect(await call()).toMatchObject({ output: 'stopped the main sessions an earlier launch left running: agent-main-a-k4f2.scope', stopped: ['agent-main-a-k4f2.scope'], left: [] });
    expect(stops).toEqual([['agent-main-a-k4f2.scope']]);
  });

  it('answers the ones a stop that timed out left running', async () => {
    const { call } = manager({ 'agent-main-a-k4f2.scope': 'earlier1', 'agent-main-b-x9q0.scope': 'earlier1' }, ['agent-main-b-x9q0.scope']);
    expect(await call()).toMatchObject({ output: expect.stringContaining('agent-main-a-k4f2.scope; still running: agent-main-b-x9q0.scope'), stopped: ['agent-main-a-k4f2.scope'], left: ['agent-main-b-x9q0.scope'] });
  });

  it('asks nothing to stop when no earlier main runs', async () => {
    const { stops, call } = manager({});
    expect(await call()).toMatchObject({ stopped: [], left: [] });
    expect(stops).toEqual([]);
  });
});
