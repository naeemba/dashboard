# Projects: decisions

Settled questions. Read the entry before re-litigating it.

## projects-decision-1: Whether a card bumps the version is the project's, off by default

A shipped card bumps its project's version only when that project's `projects.yaml` entry says
`bumpVersion: true`. Off by default because a project can refuse the bump outright: this one's CI
fails a pull request that moves `package.json`'s version (workflow-rule-3), and every card shipped
here while `/work-card` bumped by default failed CI on it. It lives in `projects.yaml` because that
is the one file with an entry per project; a missing file, one that does not read, or a project it
does not list all read as off, so a broken file never adds a change CI refuses. (2026-11-16)
