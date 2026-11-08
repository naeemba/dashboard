# App: decisions

Settled questions. Read the entry before re-litigating it.

## app-decision-1: A second launch hands over its argv, and only its argv

A launch that loses the single-instance lock exits, and Electron hands its
command line to the running app on `second-instance`. The running app reads it
with the reader it used for its own `process.argv`: `connectAtLaunch` in
`remote-ipc.ts` returns that reader, and `whenLaunchedAgain` in
`launch-gate.ts` calls it after bringing the window forward. One reader for
both launches is what keeps a flag from working on a first launch and doing
nothing on a second. A new flag goes there, beside `--remote`.

The working directory and Electron's `additionalData` are not passed on:
nothing read from the command line is a path yet. A flag that names a relative
path is the change that adds the working directory, resolved before the
reader sees it. The `dashboard` command (board card 18a7caa6) drives a running
app through the session socket, not through argv; with no arguments it launches
the app, which a second launch turns into focusing the running one.

## app-decision-2: A log entry from another build still reads

`readBody` (`log-entry.ts`) reads both: `readLogEntry` for a line in the file,
`readLogDraft` for a draft off the wire. An
entry needs a string `time`, `level`, `kind` and `message`; every field added
since (`error`, `source`, `action`, `channel`, `context`, `build`) is optional,
and one of the wrong type is left off rather than costing the line. A key it
does not know is ignored. A level or kind it does not know is kept as the text
it is: a newer build wrote it, and dropping the line for its label hides it
from the one place someone looks. A draft main is about to write is held to the
levels and kinds this build writes, and its `time`, `build` and `source` are
main's to stamp, never the sender's.

A stack is cut at 2000 characters and a message at 1000, a cause chain at four
deep (an error that is its own cause would never end). At that size a 5 MB file
still holds a couple of thousand failures, and twenty-odd frames say where one
came from.
