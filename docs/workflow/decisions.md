# Workflow: decisions

Settled questions. Read the entry before re-litigating it.

## workflow-decision-1: Comments do not count toward the 600-line ceiling

`main.ts` and `renderer.ts` are measured in code lines with `grep -cvE '^\s*(//|$)'`. Comments are never
dropped or packed to fit. This branch moved `processTree`, `baseBranch` and `shellLivesIn` out of
`main.ts`, and `showPicker` and page syncing out of `renderer.ts`, instead.

## workflow-decision-2: `history.md` files merge with the union driver

`.gitattributes` marks `docs/**/history.md` `merge=union`. Those files only ever gain an appended line per
merged change, so two cards landing together always touched the same last line: `history.md` showed up in
72 conflicted merges (`docs/review/2026-11-01.md` P1). Union keeps both sides' lines, ours then theirs,
with no conflict. The cost: a real edit to an existing line on both sides is no longer flagged either, and
both versions land. History lines are never edited, so that case is not expected. And a branch that merges main
lists its own line above the lines merged meanwhile, so a `history.md` is in the order lines were reconciled,
not merged; each line's date is the truth.

## workflow-decision-3: pnpm with the hoisted linker

Every card runs in a worktree of its own, and under npm each worktree held its own `node_modules`: about
982 MB, 708 MB of packages and 274 MB of Electron's binary. pnpm keeps one copy of each package file in
its store (`~/.pnpm-global/v3`, on the same filesystem as the checkouts) and hard-links it into every
`node_modules`. Measured on 2026-11-03: a second install of the same lockfile took 1 s, its files share
inodes with the first worktree's (`@xterm/xterm/lib/xterm.js` has 3 links: the store and both
`node_modules`), and the two `node_modules` together, Electron's binary aside, are 702 MB on disk where
two npm copies of the same packages were 1.4 GB.

- `nodeLinker: hoisted`: a flat `node_modules` as npm made it. Electron Forge packages from
  `node_modules`, and its CLI refuses anything else: `@electron-forge/cli`'s `check-system.js` throws
  "When using pnpm, `node-linker` must be set to \"hoisted\"" before it packages. The cost is pnpm's
  strict layout: a package can still import a dependency it never declared, as under npm.
- `packageManager` pins `pnpm@10.33.3`. pnpm 10, not 9, because 10 runs no dependency's install script
  unless it is named in `onlyBuiltDependencies`: CI runs the install straight out of a pull
  request's `package.json`. 10.33.3, not the newest 10.x, because it is the release already in this
  machine's corepack cache: corepack 0.28.2 cannot verify the signature on a pnpm downloaded since its
  keys rotated, and fails with `Cannot find matching keyid`, so a newer pin breaks every `pnpm`
  command here until corepack is upgraded.
- Every pnpm setting (`nodeLinker`, `overrides`, `onlyBuiltDependencies`, `supportedArchitectures`) lives in
  `pnpm-workspace.yaml`, not `.npmrc` or a `pnpm` block in `package.json`. pnpm 10 reads all three
  places; pnpm 11 reads only `pnpm-workspace.yaml`. With `node-linker=hoisted` in `.npmrc`, `pnpm config
  get node-linker` answered `hoisted` under 10.33.3 and `undefined` under 11.24.0, and 11's
  `install --frozen-lockfile` stopped with `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` because it no longer saw
  `package.json`'s overrides. Kept there, a later bump to 11 installs the same layout with the same
  overrides and build allowlist.
- `onlyBuiltDependencies` names the packages whose npm lock entry had an install script: `node-pty`
  (builds `pty.node` on Linux), `electron-winstaller` (picks the 7-Zip build the Squirrel maker uses on
  Windows) and `fsevents` (a mac only). Electron 45 has no install script: it downloads its binary on
  first use, into each worktree's `node_modules/electron/dist`, so those 274 MB are still one per
  worktree.
- `supportedArchitectures` adds `linux` to the current OS, so every install resolves the Linux-only
  packages too. Without it the hoisted layout on Windows, which skips them, left holes at the top of
  `node_modules`: the hoister gave the root slot of a package shared with a skipped subtree to that
  subtree, and nothing landed there. The Squirrel maker then died loading `forge.config.ts` with
  `Cannot find module 'glob'` (`rimraf@2.6.3`, under `electron-winstaller` → `temp`), and once `glob`
  was named directly, `lodash`; `@electron/windows-sign`'s `fs-extra` also lacked `jsonfile` and
  `universalify`. pnpm 10.34.9 lays it out the same. Naming each missing package fixes only the ones
  found so far, so the tree is made the same on every OS instead. The cost: Windows and a mac also
  install the Linux makers' packages and Linux platform binaries. To check a layout from Linux, run
  `pnpm install --frozen-lockfile --ignore-scripts --os win32 --os linux --cpu x64`; the Windows CI job
  runs the Squirrel make on the real one.
- `pnpm-lock.yaml` came from `pnpm import` of the old `package-lock.json`, so no version moved, except
  that the import resolved `@typescript/old` (`@typescript/typescript6`'s alias of `typescript@^6`) to
  6.0.2 where npm had locked 6.0.3; the lock was set back to 6.0.3 by hand. npm's `overrides` moved to
  `overrides` in `pnpm-workspace.yaml`, which pnpm reads with the same selectors.

## workflow-decision-4: Releases build on GitHub Actions, unsigned, with no new dependency

`.github/workflows/release.yml` is the only place a version moves (workflow-rule-3). Agreed on 2026-11-06:

- Unsigned. There is no Apple Developer ID or Windows code-signing certificate, so each system warns once
  before the first launch; README.md says what to click and the release body links to it. A mac build still gets an
  ad hoc signature (`DASHBOARD_SIGNING_IDENTITY=-`, read by `forge.config.ts`): Apple silicon refuses to
  run an app with none, and a runner has no `Dashboard Local` certificate.
- No Forge publisher and no DMG maker. Each leg runs `pnpm run make` and `gh release upload`; the `.dmg`
  is `hdiutil create` from the packaged app. Both tools are already on the runners.
- Draft first, published last. The prepare job creates a draft, each matrix leg uploads to it, and only
  the publish job, when every leg succeeded, writes the download links from the uploaded asset names and
  publishes. A failed leg leaves a draft nobody downloads from half-filled.
- A pre-release tag push is a second trigger. `workflow_dispatch` runs only once the file is on the
  default branch, and it commits to main, so neither can be tried from a pull request. A `v*-*` tag on a
  commit that carries the version (bumped on a throwaway branch, only the tag pushed) runs the same build
  and publish jobs against the branch's own workflow file, without a commit to main. The
  bump-and-commit step is the one part that runs only for real.
- The changelog is GitHub's generated notes, the same text the release shows: every merged pull request
  since the last stable tag, with its number, title and link, grouped as `.github/release.yml` would group
  them (one list while there is none).

## workflow-decision-5: One command cuts a release, and the board writes its first lines

Agreed on 2026-11-07. A release was a hand dispatch of `release.yml`, then watching it, then pulling the
tag and rebuilding the local app. `scripts/release.sh <bump>` does all of it; `/release` is a project
skill that runs the script.

- A shell script, not a Node one, beside `rebuild.sh`: it is a row of guards and `gh` and `git` calls.
  Its refusals were tried by hand (each prints its own reason), not by a test.
- The skill sets `disable-model-invocation: true` and says it runs only when the user typed it. A
  release publishes to everyone who downloads the app; nothing chains it onto a merge.
- The run a dispatch made is the newest dispatched Release run that was not the newest before it:
  `gh workflow run` does not print the run id. `--resume <run id>` covers a run started any other way
  and one finished by re-running its failed jobs. It installs only a release on main, found as the first
  stable tag on main that contains the commit the run ran on, not by the release commit's message; a
  pre-release tag run has none.
- `rebuild.sh` checks the installed build by grepping its `app.asar` for `<version>+<commit>`: `main.cjs`
  is stored in it as plain text, so no asar tool is needed. Every rebuild gets the check, and the install
  paths stay in one script.
- "What's new" comes from the board, not the pull requests: a card's title says what changed for a
  person, a pull request title often says how. A card reached `Done` since the last release when it is in
  `Done` in the checkout and was not at the last stable tag (`git show <tag>:.dashboard/board/cards/...`).
  Cards carry no move history, and the column at two commits is the same answer without one. Cards are
  listed by `updatedAt`, the nearest a card file has to when it moved. Subtasks are part of their
  parent's line. The workflow writes the list, so the script, the skill and the Actions tab give the
  same notes.
