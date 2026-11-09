# Conventions

Cross-cutting rules every screen outside a terminal is held to: keyboard first,
`dir="auto"` on every box, `hidden` against the stylesheet, and 600 code lines
a file. Owns `text-direction.test.ts`, which holds conventions-rule-2, and the
`max-lines` rule in `eslint.config.mjs`, which holds conventions-rule-4.
`CLAUDE.md` carries the first three in one line each and points at their id
here; the file-size rule is eslint's, and `docs/workflow/claude-md-audit.md`
says what CLAUDE.md keeps of it.

## Scenarios

- Given a list of rows, when you click one, then the selection moves there and it does what Enter does there.
- Given a new text box, when you type a Persian card title, then the caret stays with the text.
- Given a class that sets `display`, when an element with it is `hidden`, then it disappears because a `[hidden]` rule sits beside it.
- Given a file of 601 code lines, when `pnpm exec eslint .` runs, then it fails on `max-lines`; comments and blank lines do not count.
