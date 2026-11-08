import type { Channels } from './channels';
import { ipcFailureEntry, isRepeatFailure, LOG_READ_COUNT, readLogDraft, type LogRead } from '../../shared/app/log-entry';
import { logStore, type LogStore } from './log-store';

// The log's three channels, and the line every channel that throws leaves. Main-process wiring; what is
// written and how the files turn over is log-store.ts's. Anything the renderer saw goes through
// `log:write`, is read the way a line on disk is (so a stack another screen sent is cut the same), and
// is stamped here, on main's clock and with this build.
export function registerLog(table: Channels, directory: string, send: (channel: string, ...payload: unknown[]) => void): LogStore {
  const store = logStore(directory, (entry) => send('log:appended', entry), __BUILD_VERSION__);
  table.on('log:write', (_screen, raw: unknown) => {
    const draft = readLogDraft(raw, 'renderer');
    if (draft !== undefined) store.log(draft);
  });
  table.handle('log:read', (): LogRead => ({ file: store.file, entries: store.tail(LOG_READ_COUNT) }));
  const lastThrown = new Map<string, number>();
  table.whenThrown((channel, error, action) => {
    const entry = ipcFailureEntry(channel, error, action);
    if (!isRepeatFailure(lastThrown, entry.message, Date.now())) store.log(entry);
  });
  return store;
}
