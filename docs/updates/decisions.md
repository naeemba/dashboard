# Updates: decisions

## updates-decision-1: GitHub's releases API, swapped by hand off Windows

The source is `api.github.com/repos/naeemba/dashboard/releases/latest`, public
and unauthenticated. The limit is 60 requests an hour; a check on launch and
every six hours is far under it. There is no update server and no website to
keep.

Electron's `autoUpdater` refuses an unsigned mac build, and has no Linux
updater at all, so both swap the zip in by hand, the way `scripts/rebuild.sh`
does: staged beside the install, checked for the version's stamp, and renamed
in. Windows uses Squirrel, which `release.yml` already feeds.

Only the semver is compared. The commit in the stamp moves with every merge, so
comparing it would offer v2.44.0 to every local build of main past that tag.
