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
`adopt-docs-skill.test.ts` checks the docs rule and the index preamble are in the skill's text, so
rewording either without the skill fails `pnpm test`.
