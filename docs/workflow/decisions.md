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
