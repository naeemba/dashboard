# Skills: history

One line per merged change: date and why.

- 2026-11-06 #225 — The app installs `/adopt-docs`, and the manager rolls it out
  to every project by hand (skills-decision-1, skills-decision-2)
- 2026-11-09 #276 — A test fails when the docs rule in `CLAUDE.md` or the
  `docs/README.md` preamble is no longer in the `/adopt-docs` text
  (skills-decision-2)
- 2026-11-16 #288 — The app installs `/work-card`; the version bump is the
  project's `bumpVersion`, off by default (projects-decision-1)
- 2026-11-19 — `/work-card` runs a project's `check` script once and reads its log, rather than
  running the suite again to see its counts (workflow-decision-11)
- 2026-11-19 — `/work-card` reads subtasks from `board show`, finds code with codegraph, greps docs,
  and writes the history line before the pull request; `/adopt-docs` and the index say a new history
  line names no pull request (skills-decision-2)
- 2026-11-20 — `/work-card` says never to run tests in parallel or start a second run while one
  is going (workflow-decision-12)
- 2026-11-24 — `/work-card` starts from a literal `codegraph explore` command, checks the Doing and
  Review cards and open pull requests for overlap, comments on the card, reports an overlap to
  main and waits for go on or stop (goes on with no main), and takes a new docs id last
  (skills-decision-3)
- 2026-11-24 — The app installs a `dashboard-browser` skill, so a session matching a page task to
  a skill finds this browser rather than Claude in Chrome (browser-decision-8)
- 2026-11-24 — `/work-card` opens a merge request with `glab mr create` on a GitLab project
- 2026-11-25 — `/work-card` reports to main and stops once its pull request opens when the app
  starts a review on it, since that review waits on CI and killed a worker's own wait with the
  report after it; with `review.autoLoop` off it still waits on CI itself. A file on the checks'
  coverage line gets a test or a reason in the pull request's body
- 2026-11-26 — `/work-card` says to rerun only the failed files to tell a failure from load, since
  a full run now waits while another runs on the machine (workflow-decision-14)
- 2026-11-26 — `/work-card` opens the pull request with `pr create` and names `pr ready` and
  `pr comment`, not raw gh: workers retried `gh pr create` by hand after a GitHub 502 and met
  `a pull request already exists`
- 2026-11-28 — `/work-card` gives the report to main a five-line template, the detail on the pull
  request: worker messages were about 30% of one main session's transcript
- 2026-11-28 — `/work-card` numbers a new docs id before its commit, from the base branch and the
  open pull requests' diffs, instead of writing `-next` and numbering it last: the commit check
  refused six commits in one session, and two open pull requests took the same id
- 2026-11-28 — `/work-card` says the worker cannot see its review start and leaves nothing to
  hold it, and gives dev servers and long checks the longest background timeout; `dashboard-browser`
  says the same of a dev server: three pull requests sat unreviewed for five hours, and a dev
  server and checks died at the 30-minute default
