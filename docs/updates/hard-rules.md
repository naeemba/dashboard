# Updates: hard rules

## updates-rule-1: The app restarts only when the person picks Restart

**Nothing restarts the app on its own: not a finished download, not a check.**
workflow-rule-1 keeps agents from restarting the app; this is the other half.
The person choosing the row is the point. A restart that came by itself would
kill whatever a pane the app runs itself was doing, in the middle of it.
