import { describe, expect, it } from 'vitest';
import { appEnvironment, appLaunchArguments, appStarter, appStartRefusal } from './start-app';

describe('appStartRefusal', () => {
  it('refuses an unset DASHBOARD_APP and one naming a file that is gone', () => {
    expect(appStartRefusal(undefined, () => true)).toContain('DASHBOARD_APP is not set');
    expect(appStartRefusal('/opt/dashboard/dashboard', () => false)).toBe('/opt/dashboard/dashboard does not exist — rebuild and reinstall the app with rebuild.sh');
    expect(appStartRefusal('/opt/dashboard/dashboard', () => true)).toBeNull();
    expect(appStarter({ DASHBOARD_APP: '/gone' }, () => false)).toBeNull();
  });
});

describe('appEnvironment', () => {
  it('drops the calling Claude session and the pane variables, keeps the rest', () => {
    expect(appEnvironment({
      HOME: '/home/ann', PATH: '/bin', CLAUDECODE: '1', CLAUDE_PID: '9', CLAUDE_CODE_SESSION_ID: 'x',
      CLAUDE_CODE_MESSAGING_TOKEN: 't', DASHBOARD_SOCKET: '/run/s', DASHBOARD_APP: '/opt/d', CLAUDE_CONFIG_DIR: '/c',
    })).toEqual({ HOME: '/home/ann', PATH: '/bin', CLAUDE_CONFIG_DIR: '/c' });
  });
});

describe('appLaunchArguments', () => {
  it('opens the app on the pane\'s userData folder when the pane names one', () => {
    expect(appLaunchArguments({ DASHBOARD_USER_DATA: '/tmp/copy' }, ['--project', 'x'])).toEqual(['--user-data-dir=/tmp/copy', '--project', 'x']);
    expect(appLaunchArguments({}, ['--project', 'x'])).toEqual(['--project', 'x']);
  });
});
