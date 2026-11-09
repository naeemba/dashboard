// Lines from a real dashboard.log, scrubbed: paths and project names replaced, messages kept as the
// app wrote them. The first four are from builds before entries carried a source, build or context;
// the next two are from after; the error with a stack and a cause is built the way main writes one,
// since the real file had none yet; the last two are what a crash mid-write and a hand edit leave.
export const LOG_FIXTURE_LINES = [
  '{"level":"info","kind":"app","message":"started v1.16.0","time":"2026-10-26T07:17:21.985Z"}',
  '{"level":"info","kind":"project","project":"/home/user/projects/alpha","message":"opened","time":"2026-10-26T07:17:22.154Z"}',
  '{"level":"warn","kind":"pane","project":"/home/user/projects/dashboard","message":"terminal 3 exited (code 129)","time":"2026-10-29T12:12:05.074Z"}',
  '{"level":"error","kind":"error","message":"there is no file /boot here","time":"2026-10-30T09:01:44.210Z"}',
  '{"source":"main","level":"info","kind":"app","message":"started v2.45.0+cc807141cc73","time":"2026-11-08T22:42:14.982Z","build":"2.45.0+cc807141cc73"}',
  '{"source":"main","level":"info","kind":"agent","project":"/home/user/projects/dotfiles","message":"agent started in terminal 2","context":{"pane":1},"time":"2026-11-08T22:45:18.043Z","build":"2.45.0+cc807141cc73"}',
  JSON.stringify({
    source: 'main', level: 'error', kind: 'error', channel: 'board:write', action: 'board.move',
    message: 'board:write failed: EACCES: permission denied',
    error: {
      name: 'Error', message: 'EACCES: permission denied', code: 'EACCES',
      stack: 'Error: EACCES: permission denied\n    at writeCard (board-store.js:40:11)\n    at moveCard (board.js:88:5)',
      cause: { name: 'Error', message: 'read-only folder', stack: 'Error: read-only folder\n    at open (fs.js:1:1)' },
    },
    context: { slot: 2, card: 'c30c8a10' }, time: '2026-11-09T08:00:00.000Z', build: '2.46.0+0123456789ab',
  }),
  '{"level":"info","kind":"project","message":"opene',
  'not json at all',
];
