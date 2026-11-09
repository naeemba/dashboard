import { describe, expect, it } from 'vitest';
import { stopsRunningApp } from './running-app-guard';

const processes: Record<number, string> = {
  4242: '/home/me/.local/opt/dashboard/Dashboard',
  4243: '/Applications/Dashboard.app/Contents/MacOS/Dashboard',
  4244: '/home/me/dashboard/node_modules/electron/dist/electron .vite/build/main.cjs',
  5000: '/usr/bin/vim notes.md',
};
const commandLineOf = (pid: number) => processes[pid] ?? null;

describe('stopsRunningApp', () => {
  it.each([
    'pkill -f Dashboard',
    'pkill electron',
    'killall Dashboard',
    'sudo killall -9 dashboard',
    'kill $(pgrep -f Dashboard)',
    'pgrep electron | xargs kill',
    'kill -9 $(pidof dashboard)',
    'kill 4242',
    'kill -TERM 4243',
    'sleep 1; kill -9 4244',
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
    'echo x > ~/.local/opt/dashboard/resources/app.asar',
    'cat x | tee /Applications/Dashboard.app/Contents/Info.plist',
  ])('refuses %s', (command) => {
    expect(stopsRunningApp(command, commandLineOf)).toBe(true);
  });

  it.each([
    'scripts/rebuild.sh',
    'sh scripts/release.sh minor',
    'pnpm run package',
    'pnpm exec electron-forge make',
    'rm -rf out .vite',
    'rm -rf ~/.local/opt/.dashboard.rebuild',
    'ls ~/.local/opt/dashboard',
    'node "$HOME/.local/opt/dashboard/resources/app.asar.unpacked/.vite/build/board-cli-entry.js" show x > /tmp/card',
    'pkill -f vitest',
    'kill 5000',
    'kill 9999',
    'kill %1',
    'pgrep -f Dashboard',
    `osascript -e 'quit app "Safari"'`,
    'open -a Safari',
    'git commit -m "Refuse open -a in the guard"',
  ])('lets %s through', (command) => {
    expect(stopsRunningApp(command, commandLineOf)).toBe(false);
  });
});
