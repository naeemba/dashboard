# Manager: decisions

Settled questions. Read the entry before re-litigating it.

## manager-decision-1: One version line, not two

The card that added it asked for a version "in the manager tab and on the
app". It ships one: `v1.1.0` along the foot of the manager page, read from
`package.json` at build time (now with the build's commit; workflow-rule-3).
There is no second display inside a project's own view.

The manager page is the one screen every project sits under, open or not, so
it is the one place a version is guaranteed to be on screen already. A second
copy inside each project's view would need its own layout, would only be
visible while that project was open, and would say the same number the foot
line already says. Hold the foot line up against the last commit on `main` —
that is the comparison the card asked for, and it needs only the one line to
make it.

## manager-decision-2: Terminals in the slot no project has

The manager's terminals use the same slot-keyed machinery a project's do: the
same Claude screen, the same `session` socket, the same worker panes. Main
gives slot `MANAGER_SLOT` the folder `~/.dashboard` (`manager-terminals.ts`),
so the session sees `projects.yaml`.

`MANAGER_SLOT` moved from -1 to -2. Every slot lookup answers -1 for "no
project", and at -1 a `session claim` from the manager was refused as coming
from nowhere — or, read the other way, a folder in no project would have
opened panes on the manager.

Its sessions are `main-manager` and `manager-terminal-<n>`. The folder name
`.dashboard` would have slugged to `main-dashboard`, the name of a checkout
of this app's own main, and its workers' reports would have gone there.

Terminals is drawn last on the strip but is not a section: there Alt+H and
Alt+L are the terminals keys' left and right, as on a project, so the
section keys are not heard in it. The terminals key gets in; the mode keys
or a click on the strip get out.

Not done: the session file does not record the manager's workers, so a
restart brings back its main's conversation but not its workers.

## manager-decision-3: A digit allows only a call the row shows

A digit on a Claude screen's row answers a permission prompt only when the
row prints the call: the tool's name and the command, path or URL it is about
to use (`chat-row-call.ts`). With the wrong row highlighted, a `1` would
otherwise allow a call nobody read. The session's own title is not printed in
its place, since it can say less than the call does, and a command's later
lines are joined onto the first with ⏎, so `echo ok` above `rm -rf ~` never
reads as `echo ok`. A call longer than the row's 160 characters is printed cut,
with an ellipsis, and takes no digit: in `cd x && <150 harmless characters> &&
rm -rf ~` the cut is the `rm`.

A plan, an agent's prompt or an MCP tool's arguments do not fit one line, so
their rows take no digit and they are answered on the screen. A single
question with one pick allows nothing beyond the answer, and stays one key.
