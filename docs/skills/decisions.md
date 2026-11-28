# Skills: decisions

Settled questions. Read the entry before re-litigating it.

## skills-decision-1: The rollout is run by hand, and nothing merges

`/adopt-docs` is rolled out to the other projects by the manager session, by hand, one worker pane
per project; nothing in the app starts it. Each run opens one pull request and never merges it: the
manager collects the links and merges none of them, so every project's new docs are read by a
person before they land. (2026-11-06, #225)

## skills-decision-2: The skill's text follows this repository's docs

`ADOPT_DOCS_SKILL` copies the index preamble from `docs/README.md` and the docs rule from
`CLAUDE.md` word for word, so this repository is the worked example every other project is moved
towards. A change to either, or to the id scheme, changes the skill's text in the same pull request;
`CLAUDE.md` carries that rule beside the docs rule, where someone rewording it will see it.
(2026-11-06, #225)

## skills-decision-3: A worker numbers a docs id before its commit, from main and open pull requests

Parallel pull requests that each took the next docs id when they wrote it collided four times in
one week. Main reserving a range per card would hold only if main started every card, and a card
shipped from the board reaches main only when its worker reports. So `/work-card` first wrote a
placeholder and numbered it after merging `origin/<base branch>` (2026-11-24). This repository's
commit check refuses a `-next` id, so one session had six commits refused, and the merge still
missed the open pull requests: one took `workers-decision-12` while another guessed it. Now it
numbers the id before the commit that adds it, from the ids on `origin/<base branch>` and those the
open pull requests' diffs add, checks again after merging the base branch, and names it in its
report; a later conflict on the id is the same step again. (2026-11-28)
