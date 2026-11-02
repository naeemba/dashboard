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
