# App: hard rules

The one-line rule is in `CLAUDE.md`; this is what breaking it looked like.

## app-rule-1: IPC channels are `<noun>:<verb>`

The thing first, then what you do to it: `link:open`, `session:write`,
`board:read`, `pty:resize`, `notification:show`. Every channel in
`src/preload/preload.ts` follows it.

`notify:show` did not — two verbs, nothing named. Grep for the channels that
touch notifications and it does not sort next to them, so the next person adds
`alert:send` and now there are three spellings of one idea.
