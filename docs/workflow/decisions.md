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

- `node-linker=hoisted` in `.npmrc`: a flat `node_modules` as npm made it. Electron Forge packages from
  `node_modules`, and its CLI refuses anything else: `@electron-forge/cli`'s `check-system.js` throws
  "When using pnpm, `node-linker` must be set to \"hoisted\"" before it packages. The cost is pnpm's
  strict layout: a package can still import a dependency it never declared, as under npm.
- `packageManager` pins `pnpm@10.33.3`. pnpm 10, not 9, because 10 runs no dependency's install script
  unless it is named in `pnpm.onlyBuiltDependencies`: CI runs the install straight out of a pull
  request's `package.json`. 10.33.3, not the newest 10.x, because it is the release already in this
  machine's corepack cache: corepack 0.28.2 cannot verify the signature on a pnpm downloaded since its
  keys rotated, and fails with `Cannot find matching keyid`, so a newer pin breaks every `pnpm`
  command here until corepack is upgraded. Not 11: with the same `.npmrc`, `pnpm config get
  node-linker` answers `hoisted` under 10.33.3 and `undefined` under 11.24.0, so 11 would install the
  isolated layout, and Forge would refuse to package.
- `onlyBuiltDependencies` names the packages whose npm lock entry had an install script: `node-pty`
  (builds `pty.node` on Linux), `electron-winstaller` (picks the 7-Zip build the Squirrel maker uses on
  Windows) and `fsevents` (a mac only). Electron 45 has no install script: it downloads its binary on
  first use, into each worktree's `node_modules/electron/dist`, so those 274 MB are still one per
  worktree.
- `pnpm-lock.yaml` came from `pnpm import` of the old `package-lock.json`, so no version moved, except
  that the import resolved `@typescript/old` (`@typescript/typescript6`'s alias of `typescript@^6`) to
  6.0.2 where npm had locked 6.0.3; the lock was set back to 6.0.3 by hand. npm's `overrides` moved to
  `pnpm.overrides`, which pnpm reads with the same selectors.
