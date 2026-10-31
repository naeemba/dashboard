# Conventions

Cross-cutting rules every screen outside a pane is held to: keyboard first,
`dir="auto"` on every box, and `hidden` against the stylesheet. Owns no files;
`CLAUDE.md` carries each rule in one line and points at its id here.

## Scenarios

- Given a list of rows, when you click one, then the selection moves there and it does what Enter does there.
- Given a new text box, when you type a Persian card title, then the caret stays with the text.
- Given a class that sets `display`, when an element with it is `hidden`, then it disappears because a `[hidden]` rule sits beside it.
