import { describe, expect, it } from 'vitest';
import { boundUnit, earlierMains, heldRefusal, listedScopes, mainHolder, mainScopeDescription, type ListedScope } from './main-scopes';

const OWNER = '/home/sharp/.config/Dashboard';
const OLD_BUILD = '[systemd-run] /opt/claude --output-format stream-json --resume=43c1 --name main-dashboard --chrome';

function scope(unit: string, description: string, state = 'active'): ListedScope {
  return { unit, state, description };
}

describe('earlierMains', () => {
  it("stops an earlier launch's main and an older build's, never this launch's", () => {
    const scopes = [
      scope('agent-main-dashboard-otg2.scope', mainScopeDescription(OWNER, 'earlier1')),
      scope('agent-main-shop-k4f2.scope', OLD_BUILD),
      scope('agent-main-web-a1b2.scope', mainScopeDescription(OWNER, 'thisone1')),
    ];
    expect(earlierMains(scopes, OWNER, 'thisone1')).toEqual(['agent-main-dashboard-otg2.scope', 'agent-main-shop-k4f2.scope']);
  });

  it("leaves another app folder's mains, a worker's scope and one already ended", () => {
    const scopes = [
      scope('agent-main-dashboard-otg2.scope', mainScopeDescription('/tmp/demo/Dashboard', 'earlier1')),
      scope('agent-main-terminal-2-x9q0.scope', '[systemd-run] /opt/claude --name main-terminal-2', 'inactive'),
      scope('agent-main-shop-k4f2.scope', mainScopeDescription(OWNER, 'earlier1'), 'failed'),
      scope('agent-main-api-zz11.scope', '[systemd-run] /bin/zsh -ilc claude'),
    ];
    expect(earlierMains(scopes, OWNER, 'thisone1')).toEqual([]);
  });
});

describe('listedScopes', () => {
  it('reads each block systemctl show prints, a description with = and spaces kept whole', () => {
    const shown = 'Id=agent-main-a-k4f2.scope\nActiveState=active\nDescription=[systemd-run] claude --settings={"a":1}\n\n'
      + 'Id=agent-main-b-x9q0.scope\nActiveState=deactivating\nDescription=Dashboard main session for /x, launch 1\n';
    expect(listedScopes(shown)).toEqual([
      scope('agent-main-a-k4f2.scope', '[systemd-run] claude --settings={"a":1}'),
      scope('agent-main-b-x9q0.scope', 'Dashboard main session for /x, launch 1', 'deactivating'),
    ]);
    expect(listedScopes('')).toEqual([]);
  });
});

describe('mainHolder', () => {
  it("finds the main's own scope, not a longer project name's", () => {
    const left = ['agent-main-dashboard-two-k4f2.scope', 'agent-main-dashboard-otg2.scope'];
    expect(mainHolder('main-dashboard', left)).toBe('agent-main-dashboard-otg2.scope');
    expect(mainHolder('main-shop', left)).toBeNull();
    expect(heldRefusal('main-dashboard', 'agent-main-dashboard-otg2.scope')).toContain('systemctl --user stop agent-main-dashboard-otg2.scope');
  });
});

describe('boundUnit', () => {
  it("binds to the app's own scope or service under the user manager", () => {
    expect(boundUnit('0::/user.slice/user-1000.slice/user@1000.service/app.slice/app-dashboard-3205112.scope\n'))
      .toBe('app-dashboard-3205112.scope');
    expect(boundUnit('0::/user.slice/user-1000.slice/user@1000.service/app.slice/dashboard.service')).toBe('dashboard.service');
  });

  it('binds to nothing the user manager cannot reach, nor the manager itself', () => {
    expect(boundUnit('0::/user.slice/user-1000.slice/session-2.scope')).toBeNull();
    expect(boundUnit('0::/user.slice/user-1000.slice/user@1000.service/init.scope')).toBeNull();
    expect(boundUnit('0::/user.slice/user-1000.slice/user@1000.service')).toBeNull();
    expect(boundUnit('12:pids:/\n1:name=systemd:/')).toBeNull();
    expect(boundUnit('')).toBeNull();
  });
});
