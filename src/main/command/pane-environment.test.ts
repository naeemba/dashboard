import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { environmentForPanes, keptCommands, paneCommands } from './pane-environment';
import { temporaryFolder } from '../testing/temporary-folder';

function build(stamp: string): string {
  const folder = temporaryFolder('pane-commands-build-');
  for (const file of Object.values(paneCommands(folder))) writeFileSync(file, `${path.basename(file)} ${stamp}`);
  return folder;
}

describe('keptCommands', () => {
  it('points the panes at copies a rebuild does not touch, and a restart rewrites in the same place', () => {
    const kept = path.join(temporaryFolder('pane-commands-kept-'), 'commands');
    const installed = build('v1');
    const warnings: string[] = [];
    const warn = (line: string) => warnings.push(line);
    expect(keptCommands(installed, kept, warn)).toEqual(paneCommands(kept));
    writeFileSync(path.join(installed, 'dashboard-cli-entry.js'), 'dashboard-cli-entry.js v2');
    expect(readFileSync(path.join(kept, 'dashboard-cli-entry.js'), 'utf8')).toBe('dashboard-cli-entry.js v1');
    keptCommands(installed, kept, warn);
    expect(readFileSync(path.join(kept, 'dashboard-cli-entry.js'), 'utf8')).toBe('dashboard-cli-entry.js v2');
    expect(JSON.parse(readFileSync(path.join(kept, 'package.json'), 'utf8'))).toEqual({ type: 'commonjs' });
    expect(warnings).toEqual([]);
  });

  it('leaves the panes on the build\'s own files, and says why, when the copy fails', () => {
    const blocked = path.join(temporaryFolder('pane-commands-blocked-'), 'commands');
    mkdirSync(path.join(blocked, 'board-cli-entry.js'), { recursive: true });
    const installed = build('v1');
    const warnings: string[] = [];
    expect(keptCommands(installed, blocked, (line) => warnings.push(line))).toEqual(paneCommands(installed));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(blocked);
  });
});

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
