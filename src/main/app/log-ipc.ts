import type { Channels } from './channels';
import { LOG_READ_COUNT, type LogDraft, type LogRead } from '../../shared/app/log-entry';
import { logStore, type LogStore } from './log-store';

// The log's three channels. Main-process wiring; what is written and how the files turn over is
// log-store.ts's. Anything the renderer saw goes through `log:write` and is stamped here, on main's clock.
export function registerLog(table: Channels, directory: string, send: (channel: string, ...payload: unknown[]) => void): LogStore {
  const store = logStore(directory, (entry) => send('log:appended', entry));
  table.on('log:write', (_screen, draft: LogDraft) => store.log(draft));
  table.handle('log:read', (): LogRead => ({ file: store.file, entries: store.tail(LOG_READ_COUNT) }));
  return store;
}
