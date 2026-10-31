# Remote host: decisions

Settled questions. Read the entry before re-litigating it.

## remote-host-decision-1: The host owns the list of open projects

Two screens can open and close projects, so the renderer no longer decides what is open. Main does, and
pushes `projects:change` with the whole list; each renderer makes its pages match through
`pageMoves` in `page-reconcile.ts`. The reply to a renderer's own `projects:open` carries the same
list, so the push and the reply are idempotent whichever lands first. Settings stay on the screen that
shows them: a mac on a Linux host keeps its Cmd keys.
