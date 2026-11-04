import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { environmentForPanes, paneCommands } from './pane-environment';

describe('environmentForPanes', () => {
  const commands = paneCommands(path.join('/app', 'build'));

  it('hands every pane the commands, the socket and the userData folder over the app\'s own environment', () => {
    expect(environmentForPanes({ HOME: '/home/ann', DASHBOARD_SOCKET: '/old.sock' }, commands, '/run/s.sock', '/data', '/opt/Dashboard')).toEqual({
      HOME: '/home/ann',
      DASHBOARD_COMMAND: path.join('/app', 'build', 'dashboard-cli-entry.js'),
      DASHBOARD_BOARD: path.join('/app', 'build', 'board-cli-entry.js'),
      DASHBOARD_SESSION: path.join('/app', 'build', 'session-cli-entry.js'),
      DASHBOARD_SOCKET: '/run/s.sock',
      DASHBOARD_USER_DATA: '/data',
      DASHBOARD_APP: '/opt/Dashboard',
    });
  });

  // A development run's executable is Electron's own: started bare, it opens nothing.
  it('names no app to start when there is none to name', () => {
    expect(environmentForPanes({}, commands, '/run/s.sock', '/data', null)).not.toHaveProperty('DASHBOARD_APP');
  });
});
