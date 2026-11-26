# Workflow: history

One line per merged change: date and why.

- 2026-09-05 #6 — Run the checks in CI
- 2026-11-02 #167 — Merge `docs/**/history.md` with the union driver (workflow-decision-2)
- 2026-11-02 #168 — Stamp the build's commit in its version; cards stop bumping package.json
- 2026-11-02 #191 — Build hooks in Node and a Windows-aware forge.config, so the app starts and
  packages on Windows
- 2026-11-02 #197 — Run the checks and the Squirrel make on windows-latest in CI
- 2026-11-03 #201 — Install with pnpm and the hoisted linker, so worktrees share one copy of
  node_modules (workflow-decision-3)
- 2026-11-06 #221 — Build and publish releases for Linux, Windows and macOS from GitHub Actions
  (workflow-decision-4)
- 2026-11-07 #231 — One command to cut a release: scripts/release.sh and /release, with a What's new
  list from the board (workflow-decision-5)
- 2026-11-08 #238 — release.sh polls the run and retries GitHub reads, every failure says Stopped:,
  and --resume accepts the release commit (workflow-decision-6)
- 2026-11-08 #244 — Tests run in a temporary folder of their own and fail on leftovers, after their
  folders filled /tmp
- 2026-11-09 #277 — CI fails a pull request that moves package.json version (workflow-rule-3)
- 2026-11-09 #281 — A hook refuses quitting, killing or replacing the running app
  (workflow-decision-7)
- 2026-11-09 #285 — CLAUDE.md drops the rules a test, lint or CI step holds; eslint's keep one line
  each (workflow-decision-8)
- 2026-11-16 #293 — A pre-commit hook runs eslint on staged code and the typecheck; tests that touch
  paths pass on Windows (workflow-rule-5, workflow-rule-6)
- 2026-11-17 #320 — A hook refuses removing the session's own worktree and editing another one
  (workflow-decision-10)
- 2026-11-17 — A hook refuses npm, yarn or bun in a pnpm project, and the other ways round
  (workflow-decision-9)
- 2026-11-18 #328 — CI refuses a pull request that changes the board's files; pre-commit refuses
  code without node_modules; release.sh waits for CI (workflow-rule-7, workflow-rule-5,
  workflow-decision-6)
- 2026-11-18 #331 — rebuild.sh runs pnpm install --frozen-lockfile before packaging, after a
  checkout installed before #156 failed to resolve yaml
- 2026-11-18 #333 — release.sh checks for an app running out of the checkout before it fast-forwards
  main and installs, not only in rebuild.sh after both
- 2026-11-19 — `pnpm check` runs the three checks into `check.log` and prints a line each;
  `pnpm lint` holds markdown to 100 columns, and the docs are rewrapped to it (workflow-decision-11)
- 2026-11-20 — `board guard` refuses a test command while another test run is going in the same
  worktree, after three parallel vitest runs in one new-crm worktree filled the machine's memory
  (workflow-decision-12)
- 2026-11-24 — `pnpm check` prints the first reasons under a failed check and a coverage line for
  the code changed against main, after workers grepped `check.log` for why and four review findings
  were new branches with no test (workflow-decision-13)
- 2026-11-24 — the package-manager guard follows a `cd` earlier in the line, after new-crm's
  `cd storefront && pnpm install` was refused by the root's npm lockfile four times
  (workflow-decision-9)
- 2026-11-24 — `pnpm lint` refuses a duplicate docs heading id and a leftover `-next` id, since a
  worker writes a new id as `-next` and numbers it at the last merge of main, and nothing stopped
  one that skipped that, or two cards that numbered from the same main, from merging
- 2026-11-24 — the worktree and test-run guards walk a line's `cd`s through the package-manager
  guard's walk, so a test run after `( cd x && … )` is judged where the line's shell is and
  `cd -P <dir>` moves to `<dir>`, not `-P`; and a Git Bash `cd /c/work` is read as `C:\work` on
  Windows, where it had found no lockfile and refused nothing (workflow-decision-10,
  workflow-decision-12)
- 2026-11-24 — the running-app guard covers Windows: it refuses an `rm`, `Remove-Item` or `rd`
  over the Squirrel install `%LOCALAPPDATA%\Dashboard`, and a `taskkill /IM` or `Stop-Process`
  naming the app's images, judged inside `powershell -Command` and `cmd /c` too; before, each went
  through and deleted or killed the installed app mid-turn (workflow-decision-7, issue #326)
- 2026-11-25 — The test-run guard and `pane send` read a `powershell -Command`, `pwsh -c` or
  `cmd /c` body as the running-app guard does: `pwsh -c "pnpm test"` started a second test run, and
  `powershell -Command claude` started a worker with none of the app's settings (issue #365)
- 2026-11-25 — `posixPathsOnly` is one import from `src/main/testing/`, not a copy in each of 14
  test files, after #370 added a POSIX-path test without it; `check.log` opens with the summary,
  since `head check.log` showed only vitest's preamble; `vitest.config.mts`, so Vite stops warning
  that the config is ESM loaded as CommonJS (workflow-rule-6)
- 2026-11-26 — A pane's full test, build or typecheck run waits in `board guard` while another
  runs on the machine, and workers rerun only the failed files to tell a failure from load, after
  whole suites timed out at a load of 22-50 with several panes at once (workflow-decision-14)
