import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Channels } from './channels';
import { replaceFile } from './replace-file';
import { SESSION_FILE } from './session';
import { parseShownRecord, recordMovesForward, type LastShown, type ShownRecord } from '../../shared/app/whats-new';

const WHATS_NEW_FILE = 'whats-new.json';

// What the what's-new popup last spoke for, in userData. One channel: the renderer hands over what
// this build carries and gets back the record before, so the record moves forward whether or not
// anything is shown. The same build again, or an older one, writes nothing: replaceFile flushes on
// main's thread, mid-launch. A client channel (remote-protocol.ts): it is this install's, not a
// joined host's.
//
// Whether the folder was used before is read here, at registration, before the window opens: the
// launch's own restore writes session.json before the renderer asks, so asking then reads every first
// install as an old one.
export function registerWhatsNew(table: Channels, userData: string): void {
  const file = join(userData, WHATS_NEW_FILE);
  const history = existsSync(join(userData, SESSION_FILE));
  table.handle('whats-new:record', (_screen, current: ShownRecord): LastShown => {
    let shown: ShownRecord | null = null;
    try {
      shown = parseShownRecord(JSON.parse(readFileSync(file, 'utf8')));
    } catch {
      // No record yet, or one that does not parse: read as none.
    }
    if (recordMovesForward(shown, current)) replaceFile(file, JSON.stringify(current));
    return { shown, history };
  });
}
