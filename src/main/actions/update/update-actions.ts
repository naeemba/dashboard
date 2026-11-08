import { app, autoUpdater } from 'electron';
import { rmSync } from 'node:fs';
import path from 'node:path';
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

// Main's wiring for the update actions: the state they move, each platform's stage, swap and restart,
// and the check on launch and every six hours. Out of main.ts, which is over its 600-line ceiling.
// Every decision is in release.ts and the three actions.

export type UpdateMain = {
  table: Channels;
  // The local window only: a joined screen has its own app, and its own update (remote-protocol.ts).
  send(channel: string, state: UpdateState): void;
  running: string;
  enabled(): boolean;
  log(draft: LogDraft): void;
};

function refusedAsError<Value>(value: Value | { refused: string }): Value {
  if (isRefused(value)) throw new Error(value.refused);
  return value;
}

async function latest(): Promise<unknown> {
  const response = await fetch(LATEST_RELEASE_URL, { headers: { accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
  return response.json();
}

// Windows: Squirrel's Update.exe, the one Electron's autoUpdater drives, pointed at the release's own
// download folder, where release.yml uploads RELEASES and the nupkg. It checks the package itself.
function squirrelStage(release: Release): Promise<void> {
  const releases = refusedAsError(assetFor(release, 'win32', process.arch));
  return new Promise((resolve, reject) => {
    const done = (): void => { autoUpdater.off('error', failed); autoUpdater.off('update-not-available', missing); };
    const failed = (error: Error): void => { done(); reject(error); };
    const missing = (): void => { done(); reject(new Error(`Squirrel found no package in v${release.version}`)); };
    autoUpdater.once('update-downloaded', () => { done(); resolve(); });
    autoUpdater.once('error', failed);
    autoUpdater.once('update-not-available', missing);
    autoUpdater.setFeedURL({ url: releaseFolderUrl(releases) });
    autoUpdater.checkForUpdates();
  });
}

// Linux and macOS: the zip into the user data folder, unpacked beside the install, the zip then deleted.
async function zipStage(release: Release): Promise<string> {
  const installed = refusedAsError(installFolder(process.platform, process.execPath, app.isPackaged));
  const zip = await download(refusedAsError(assetFor(release, process.platform, process.arch)), path.join(app.getPath('userData'), 'updates'));
  try {
    return await unpack(zip, stagingFolder(installed), process.platform);
  } finally {
    rmSync(zip, { force: true });
  }
}

export function updateActions(main: UpdateMain): void {
  let state: UpdateState = { kind: 'none' };
  // Where zipStage left the unpacked app, for the swap.
  let staged = '';
  const ports = {
    state: () => state,
    set(next: UpdateState) { state = next; main.send('update:change', state); },
  };
  const windows = process.platform === 'win32';
  const check = bind(updateCheck, { ...ports, latest, running: main.running, enabled: main.enabled });
  const downloadAction = bind(updateDownload, {
    ...ports,
    async stage(release) {
      if (windows) return squirrelStage(release);
      staged = await zipStage(release);
    },
  });
  const restart = bind(updateRestart, {
    ...ports,
    async swap(release) {
      if (windows) return;
      const installed = refusedAsError(installFolder(process.platform, process.execPath, app.isPackaged));
      swapInto(staged, installed, stagingFolder(installed), release.version, process.platform);
      if (process.platform === 'darwin') await clearQuarantine(installed);
    },
    relaunch() {
      main.log({ level: 'info', kind: 'app', message: 'restarting into the update' });
      if (windows) return autoUpdater.quitAndInstall();
      app.relaunch();
      app.quit();
    },
  });
  registerActions(main.table, [check, downloadAction, restart]);
  main.table.handle('update:read', () => state);
  // A failed check costs a line in the log, nothing on screen.
  const scheduled = (): void => {
    check.call({ asked: false }).catch((error: unknown) => {
      main.log({ level: 'warn', kind: 'app', message: `update check failed: ${failureText(error)}` });
    });
  };
  scheduled();
  setInterval(scheduled, CHECK_EVERY_MS);
}
