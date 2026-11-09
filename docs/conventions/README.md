# Conventions

Cross-cutting rules every screen outside a terminal is held to: keyboard first,
`dir="auto"` on every box, `hidden` against the stylesheet, and 600 code lines
a file. Owns `text-direction.test.ts`, which holds conventions-rule-2,
`hidden-rule.test.ts`, which holds conventions-rule-3, and the `max-lines` rule
in `eslint.config.mjs` and `stylesheet-size.test.ts`, which hold
conventions-rule-4 for code and stylesheets.
`CLAUDE.md` carries keyboard first in one line and points at its id here; the
other three are held by their checks and not repeated there (workflow-decision-8).

## Scenarios

- Given a list of rows, when you click one, then the selection moves there and it does what Enter does there.
- Given a new text box, when you type a Persian card title, then the caret stays with the text.
- Given a class that sets `display`, when an element with it is `hidden`, then it disappears because a `[hidden]` rule sits in its stylesheet's foot block.
- Given a file of 601 code lines, when `pnpm exec eslint .` runs, then it fails on `max-lines`; comments and blank lines do not count.
- Given a stylesheet of 601 code lines, when `pnpm test` runs, then `stylesheet-size.test.ts` fails.
