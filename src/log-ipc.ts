import { ipcMain } from 'electron';
import { LOG_READ_COUNT, type LogDraft, type LogRead } from './log-entry';
import { logStore, type LogStore } from './log-store';

// The log's three channels. Main-process wiring; what is written and how the files turn over is
// log-store.ts's. Anything the renderer saw goes through `log:write` and is stamped here, on main's clock.
export function registerLog(directory: string, send: (channel: string, ...payload: unknown[]) => void): LogStore {
  const store = logStore(directory, (entry) => send('log:appended', entry));
  ipcMain.on('log:write', (_event, draft: LogDraft) => store.log(draft));
  ipcMain.handle('log:read', (): LogRead => ({ file: store.file, entries: store.tail(LOG_READ_COUNT) }));
  return store;
}
