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

## skills-decision-3: A worker takes a docs id at merge time, not from a range main reserves

Parallel pull requests that each took the next docs id when they wrote it collided four times in
one week. Main reserving a range per card would hold only if main is the one starting every card,
and a card shipped from the board starts with no main in the loop. So `/work-card` writes a
placeholder, merges `origin/<base branch>` right before the pull request opens, takes the next id
free there, and names it in its report; a later conflict on the id is the same step again.
(2026-11-24)
