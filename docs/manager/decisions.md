# Manager: decisions

Settled questions. Read the entry before re-litigating it.

## manager-decision-1: One version line, not two

The card that added it asked for a version "in the manager tab and on the
app". It ships one: `v1.1.0` along the foot of the manager page, read from
`package.json` at build time. There is no second display inside a project's
own view.

The manager page is the one screen every project sits under, open or not, so
it is the one place a version is guaranteed to be on screen already. A second
copy inside each project's view would need its own layout, would only be
visible while that project was open, and would say the same number the foot
line already says. Hold the foot line up against `package.json` on `main` —
that is the comparison the card asked for, and it needs only the one line to
make it.
