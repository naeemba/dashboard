# Workflow: history

One line per merged change: date, pull request, why.

- 2026-09-05 #6 — Run the checks in CI
- 2026-11-02 #167 — Merge `docs/**/history.md` with the union driver (workflow-decision-2)
- 2026-11-02 #168 — Stamp the build's commit in its version; cards stop bumping package.json
- 2026-11-02 #191 — Build hooks in Node and a Windows-aware forge.config, so the app starts and packages on Windows
- 2026-11-02 #197 — Run the checks and the Squirrel make on windows-latest in CI
- 2026-11-03 #201 — Install with pnpm and the hoisted linker, so worktrees share one copy of node_modules (workflow-decision-3)
- 2026-11-06 #221 — Build and publish releases for Linux, Windows and macOS from GitHub Actions (workflow-decision-4)
- 2026-11-07 #231 — One command to cut a release: scripts/release.sh and /release, with a What's new list from the board (workflow-decision-5)
- 2026-11-08 #238 — release.sh polls the run and retries GitHub reads, every failure says Stopped:, and --resume accepts the release commit (workflow-decision-6)
- 2026-11-08 #244 — Tests run in a temporary folder of their own and fail on leftovers, after their folders filled /tmp
- 2026-11-09 #277 — CI fails a pull request that moves package.json version (workflow-rule-3)
- 2026-11-09 #281 — A hook refuses quitting, killing or replacing the running app (workflow-decision-7)
- 2026-11-09 #285 — CLAUDE.md drops the rules a test, lint or CI step holds; eslint's keep one line each (workflow-decision-8)
- 2026-11-16 #293 — A pre-commit hook runs eslint on staged code and the typecheck; tests that touch paths pass on Windows (workflow-rule-5, workflow-rule-6)
- 2026-11-17 #320 — A hook refuses removing the session's own worktree and editing another one (workflow-decision-10)
- 2026-11-17 — A hook refuses npm, yarn or bun in a pnpm project, and the other ways round (workflow-decision-9)
- 2026-11-18 #328 — CI refuses a pull request that changes the board's files; pre-commit refuses code without node_modules; release.sh waits for CI (workflow-rule-7, workflow-rule-5, workflow-decision-6)
- 2026-11-18 #331 — rebuild.sh runs pnpm install --frozen-lockfile before packaging, after a checkout installed before #156 failed to resolve yaml
