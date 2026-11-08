import { app, autoUpdater } from 'electron';
import { rmSync } from 'node:fs';
import path from 'node:path';
import type { Refused } from '../../../shared/app/bridge';
import type { LogDraft } from '../../../shared/app/log-entry';
import type { Release, UpdateState } from '../../../shared/app/update';
import { failureText } from '../../../shared/errors/failure';
import type { Channels } from '../../app/channels';
import { clearQuarantine, download, swapInto, unpack } from '../../update/install';
import { assetFor, CHECK_EVERY_MS, installFolder, LATEST_RELEASE_URL, releaseFolderUrl, stagingFolder } from '../../update/release';
import { bind, isRefused, registerActions } from '../action';
import { updateCheck } from './check';
import { updateDownload } from './download';
import { updateRestart } from './restart';

// Main's wiring for the update actions: the state they move, this platform's stage, swap and restart,
// and the check on launch and every six hours. Out of main.ts, which is over its 600-line ceiling.
// Every decision is in release.ts and the three actions.

export type UpdateMain = {
  table: Channels;
  // The local window only: a joined screen has its own app, and its own update (remote-protocol.ts).
  send(channel: string, state: UpdateState): void;
  running: string;
  // The settings row: whether the schedule asks GitHub at all. The dialog's check asks anyway.
  enabled(): boolean;
  log(draft: LogDraft): void;
};

// A stalled GitHub costs the check, not a dialog that says "Checking" until it is closed.
const CHECK_TIMEOUT_MS = 15_000;

type Installer = { stage(release: Release): Promise<void>; swap(release: Release): Promise<void>; relaunch(): void };

async function latest(): Promise<unknown> {
  const response = await fetch(LATEST_RELEASE_URL, {
    headers: { accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
  return response.json();
}

function relaunch(): void {
  app.relaunch();
  app.quit();
}

// Windows: Squirrel's Update.exe, the one Electron's autoUpdater drives, pointed at the release's own
// download folder, where release.yml uploads RELEASES and the nupkg. It checks the package itself, and
// installs it on the restart.
const squirrel: Installer = {
  stage(release) {
    const releases = assetFor(release, 'win32', process.arch);
    if (isRefused(releases)) return Promise.reject(new Error(releases.refused));
    return new Promise((resolve, reject) => {
      const done = (): void => {
        autoUpdater.off('update-downloaded', downloaded);
        autoUpdater.off('error', failed);
        autoUpdater.off('update-not-available', missing);
      };
      const downloaded = (): void => { done(); resolve(); };
      const failed = (error: Error): void => { done(); reject(error); };
      const missing = (): void => { done(); reject(new Error(`Squirrel found no package in v${release.version}`)); };
      autoUpdater.on('update-downloaded', downloaded);
      autoUpdater.on('error', failed);
      autoUpdater.on('update-not-available', missing);
      autoUpdater.setFeedURL({ url: releaseFolderUrl(releases) });
      autoUpdater.checkForUpdates();
    });
  },
  swap: async () => undefined,
  relaunch: () => autoUpdater.quitAndInstall(),
};

// Linux and macOS: the zip into the user data folder, unpacked beside the install, the zip then
// deleted, and swapped in on the restart. `installed` is already known to be an install.
function zipInstaller(installed: string): Installer {
  const staging = stagingFolder(installed);
  // Where the stage left the unpacked app, for the swap.
  let staged = '';
  return {
    async stage(release) {
      const asset = assetFor(release, process.platform, process.arch);
      if (isRefused(asset)) throw new Error(asset.refused);
      const zip = await download(asset, path.join(app.getPath('userData'), 'updates'));
      try {
        staged = await unpack(zip, staging, process.platform);
      } finally {
        rmSync(zip, { force: true });
      }
    },
    async swap(release) {
      await swapInto(staged, installed, staging, release.version, process.platform);
      if (process.platform === 'darwin') await clearQuarantine(installed);
    },
    relaunch,
  };
}

export function updateActions(main: UpdateMain): void {
  let state: UpdateState = { kind: 'none' };
  const ports = {
    state: () => state,
    set(next: UpdateState) { state = next; main.send('update:change', state); },
  };
  const installed = installFolder(process.platform, process.execPath, app.isPackaged);
  const installer = process.platform === 'win32' ? squirrel : isRefused(installed) ? null : zipInstaller(installed);
  const refusal = (release: Release): Refused | null => {
    if (isRefused(installed)) return installed;
    const asset = assetFor(release, process.platform, process.arch);
    return isRefused(asset) ? asset : null;
  };
  // A machine with no installer is refused by the check, so these never run there.
  const unreachable = (): never => { throw new Error('this machine cannot install a release'); };
  const check = bind(updateCheck, { ...ports, latest, running: main.running, refusal });
  const downloadAction = bind(updateDownload, { ...ports, stage: (release) => (installer ?? unreachable()).stage(release) });
  const restart = bind(updateRestart, {
    ...ports,
    swap: (release) => (installer ?? unreachable()).swap(release),
    relaunch() {
      main.log({ level: 'info', kind: 'app', message: 'restarting into the update' });
      (installer ?? unreachable()).relaunch();
    },
  });
  registerActions(main.table, [check, downloadAction, restart]);
  main.table.handle('update:read', () => state);
  // A failed check costs a line in the log, nothing on screen.
  const scheduled = (): void => {
    if (!main.enabled()) return;
    check.call({}).catch((error: unknown) => {
      main.log({ level: 'warn', kind: 'app', message: `update check failed: ${failureText(error)}` });
    });
  };
  scheduled();
  setInterval(scheduled, CHECK_EVERY_MS);
}
