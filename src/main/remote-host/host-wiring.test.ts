import { describe, expect, it } from 'vitest';
import { channels } from '../app/channels';
import { startHost, type HeldByMain } from './host-wiring';
import { screens } from '../../shared/remote-host/screens';
import type { Settings } from '../../shared/settings/settings';

describe('startHost', () => {
  it('listens on nothing when the settings give no port', () => {
    const held = {
      table: channels(), version: '1', screenCopies: new Map(), shells: new Map(), screens: screens(),
      settings: () => ({ host: { port: null, token: 't' } }) as Settings,
      projects: () => ({ projects: [], panes: [] }), worktrees: () => ({ entries: [], paneDirectories: {} }),
      usage: () => 'usage' as never, log: () => undefined, hold: () => undefined,
    } as HeldByMain;
    expect(startHost(held)).toBeNull();
  });
});
