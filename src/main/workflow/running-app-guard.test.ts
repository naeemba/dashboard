import { describe, expect, it } from 'vitest';
import { runningProcess, stopsRunningApp } from './running-app-guard';

const opt = '/home/me/.local/opt/dashboard';
const running = (pid: number, comm: string, commandLine: string) => runningProcess(pid, comm, commandLine.split(' '));
const processes = [
  running(4242, 'Dashboard', `${opt}/Dashboard`),
  running(4243, 'Dashboard', '/Applications/Dashboard.app/Contents/MacOS/Dashboard'),
  running(4244, 'electron', '/home/me/dashboard/node_modules/electron/dist/electron .vite/build/main.cjs'),
  running(4245, 'MainThread', `node ${opt}/resources/app.asar.unpacked/.vite/build/pane-host-entry.js /home/me/.config/Dashboard/pane-host/panes-1.sock`),
  running(4246, 'MainThread', `node ${opt}/resources/app.asar.unpacked/.vite/build/screen-host-entry.mjs /home/me/.config/Dashboard/screen-host/screens-1.sock`),
  running(4247, 'claude', `${opt}/resources/app.asar.unpacked/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude --name main-dashboard`),
  running(5000, 'vim', '/usr/bin/vim notes.md'),
  running(5001, 'node', '/home/me/dashboard.worktrees/x/node_modules/.bin/vitest run'),
  running(5002, 'electron', '/home/me/other-app/node_modules/electron/dist/electron .'),
];
const onLinux = () => processes;
const onMac = () => null;

describe('stopsRunningApp', () => {
  it.each([
    'pkill -f Dashboard',
    'pkill electron',
    'killall Dashboard',
    'sudo killall -9 dashboard',
    'killall node',
    'pkill node',
    'pkill -f claude',
    'pkill -f screen-host',
    'pkill -f pane-host',
    'kill $(pgrep -f Dashboard)',
    'kill $(pgrep node)',
    'pgrep electron | xargs kill',
    'pgrep node | xargs kill',
    'kill -9 $(pidof dashboard)',
    'kill 4242',
    'kill -TERM 4243',
    'sleep 1; kill -9 4244',
    'kill 4245',
    '/bin/kill 4242',
    'command kill 4242',
    'kill -9 -1',
    'kill -- -4242',
    'kill -TERM -4242',
    'systemctl --user stop agents.slice',
    `osascript -e 'quit app "Dashboard"'`,
    `osascript -e 'tell application "Dashboard" to quit'`,
    'open -a Dashboard',
    'open -a "Dashboard"',
    'open /Applications/Dashboard.app',
    'rm -rf ~/.local/opt/dashboard',
    'cp -a out/Dashboard-linux-x64 "$HOME/.local/opt/dashboard"',
    'mv /tmp/build /home/me/.local/opt/dashboard',
    'ditto out/arm64/Dashboard.app /Applications/Dashboard.app',
    'rsync -a out/Dashboard-linux-x64/ ~/.local/opt/dashboard/',
    'tar -xf b.tar -C ~/.local/opt/dashboard',
    'unzip -o b.zip -d ~/.local/opt/dashboard',
    'install -m755 x ~/.local/opt/dashboard/Dashboard',
    'unlink ~/.local/opt/dashboard/Dashboard',
    `find ~/.local/opt/dashboard -name '*.log' -delete`,
    'echo x > ~/.local/opt/dashboard/resources/app.asar',
    'cat x | tee /Applications/Dashboard.app/Contents/Info.plist',
    'pkill -f "vitest|node"',
    'kill $(pgrep -f "vitest|node")',
    "killall -r 'vim|node'",
    'pkill -u me node',
    'killall -u me node',
    'killall -r Dash',
    'systemctl --user restart panes.slice',
    'timeout 5 pkill node',
    '(pkill node)',
    'sudo -u me pkill node',
    'env FOO=1 pkill node',
    'bash -c "pkill -f Dashboard"',
    "sh -c 'killall node'",
  ])('refuses %s', (command) => {
    expect(stopsRunningApp(command, onLinux)).toBe(true);
  });

  it.each([
    'scripts/rebuild.sh',
    'sh scripts/release.sh minor',
    'pnpm run package',
    'pnpm exec electron-forge make',
    'rm -rf out .vite',
    'rm -rf ~/.local/opt/.dashboard.rebuild',
    'ls ~/.local/opt/dashboard',
    `find ~/.local/opt/dashboard -name '*.log'`,
    'node "$HOME/.local/opt/dashboard/resources/app.asar.unpacked/.vite/build/board-cli-entry.js" show x > /tmp/card',
    'pkill -f vitest',
    'pkill -f /home/me/dashboard.worktrees/x/node_modules/.bin/vitest',
    'kill 5000',
    'kill 5002',
    'kill 9999',
    'kill %1',
    'kill %1; pgrep -fl electron',
    'pgrep -f Dashboard',
    `osascript -e 'quit app "Safari"'`,
    'open -a Safari',
    'git commit -m "Refuse open -a in the guard"',
    'git commit -m "Refuse rm -rf ~/.local/opt/dashboard in the guard"',
    'gh pr create --title x --body "runs pkill naming Dashboard"',
    'grep -rn killall /home/me/dashboard/src',
    'kill -1 5000',
    'pkill -f "("',
    'git commit -m "Refuse kill 4242; pkill node in the guard"',
  ])('lets %s through', (command) => {
    expect(stopsRunningApp(command, onLinux)).toBe(false);
  });

  it('judges a kill by its names where the processes cannot be read', () => {
    expect(stopsRunningApp('pkill -f Dashboard', onMac)).toBe(true);
    expect(stopsRunningApp('killall node', onMac)).toBe(true);
    expect(stopsRunningApp('pkill -f vitest', onMac)).toBe(false);
    expect(stopsRunningApp('kill 4242', onMac)).toBe(false);
  });
});
