# Updates

The app tells you a newer release is out and installs it from the UI, with no
rebuild. There is no website: the source is GitHub's latest-release answer for
`naeemba/dashboard`, public and read without a token.

## On screen

On launch and every six hours main reads the newest release. If its version is
newer than the running build's (the semver only: the `+<commit>` stamp is
ignored, so a local build of main ahead of the tag never nags), the status bar
says `Dashboard vX.Y.Z is out · Ctrl+Shift+G to update`. A check that fails
says nothing on screen; it is a `warn` line in the log.

Ctrl+Shift+G opens the update dialog and checks again as it opens, whatever the
settings row says. Its rows depend on where the update is:

- **Update** downloads this machine's file from the release into the app's data
  folder, checks its size against the one GitHub lists, and stages it beside
  the install. The status bar then says `Dashboard vX.Y.Z is ready`.
- **Restart to update** checks the staged build carries the release's version,
  then asks to quit. The swap and the relaunch run only once the quit question
  is answered Quit; Cancel leaves the install as it was, the next quit is just a
  quit, and the row is still there. The app restarts only when you pick this
  row, never on its own.
- **What's new** shows the release's notes in the what's-new popup; Enter on a
  line opens the release page.

The arrows walk the rows, Enter picks one, Escape closes. A download that
failed, or a staged build that is not the release, is said on the dialog and on
the status bar, and the row is there to try again. A swap that fails at the
quit leaves the install as it was, logs why, and the app quits without
restarting.

The settings screen's Updates row (`updates.check`, default on) turns the
launch and six-hourly check off. The key still checks when pressed.

### Each platform

- **Linux**: `Dashboard-linux-x64-<version>.zip`, unpacked into
  `.dashboard.update` beside the install, write access for other accounts
  taken off (the release's zip stores its files as 0777), and swapped into the
  install folder (`~/.local/opt/dashboard` for `scripts/rebuild.sh` installs)
  the way `scripts/rebuild.sh` swaps: the staged `app.asar` must carry
  `<version>+` first, then rename the old one aside, rename the new one in,
  delete the old one. The `dashboard` launcher is left as it is.
- **Windows**: Squirrel's `Update.exe`, through Electron's `autoUpdater`,
  pointed at the release's download folder, where `release.yml` uploads
  `RELEASES` and the nupkg. Squirrel checks the package itself. Works unsigned.
- **macOS (Apple silicon)**: `Dashboard-darwin-arm64-<version>.zip`, unpacked
  with `ditto` beside `/Applications/Dashboard.app`, swapped in the same way,
  then `com.apple.quarantine` cleared. Electron's `autoUpdater` refuses unsigned
  mac builds, so this is a swap by hand. If Gatekeeper still blocks the new
  build, the dialog says so and points at the README's Install section.

Any other machine (Linux on arm, an Intel mac) is refused by the check with the
reason, and so is a development run (`pnpm start`), which updates by pulling
and rebuilding: neither is offered an Update it cannot take. Everything that
reads or deletes an `app.asar` runs as `grep` and `rm`, as `rebuild.sh` does,
because Electron's `fs` treats an `.asar` as a folder.

## Files

- `src/shared/app/update.ts`: the release and state types, the dialog's rows,
  title and the status bar line
- `src/main/update/release.ts`: GitHub's answer read, newer or not, which
  download, where the install is (updates-decision-1)
- `src/main/update/install.ts`: download, size check, unpack, the swap
- `src/main/actions/update/`: `update.check` and the schedule's settings gate,
  `update.download`, `update.restart`, `update.install` (what the quit
  question's answer does to an armed update), and `update-actions.ts`, the
  wiring
- `src/renderer/app/update-view.ts`: the status bar line and the dialog

## Scenarios

- Given a release newer than the running build, when the app launches, then the
  status bar says it is out.
- Given a local build of the release's own version with another commit, when
  the check runs, then nothing is said.
- Given the Updates row off, when six hours pass, then GitHub is not asked; when
  the key is pressed, it is.
- Given a download that comes down short, when it finishes, then nothing is
  unpacked and the dialog says why.
- Given a staged build that does not carry the release's version, when Restart
  is picked, then the install is left as it is and the app does not restart.
- Given Restart picked and the quit answered Quit, when the swap fails, then
  the install is left as it is, the log says why, and the app quits without
  restarting.
- Given Restart picked, when the quit question is cancelled, then the install is
  left as it is and a later quit does not restart the app.
- Given Update picked while the dialog's own check is still asking GitHub, when
  the check answers, then the download carries on and Update is not offered
  again.
- Given a screen joined to another Dashboard, when the key is pressed, then it
  is this machine's app that is checked, not the host's.

## Open questions

- Restarting into the new build was checked on Linux only as far as the swap,
  against v2.44.0 swapped into a throwaway folder; the relaunch itself, Windows
  and macOS wait for a release after this one.
