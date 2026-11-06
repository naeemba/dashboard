import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Channels } from './channels';
import { replaceFile } from './replace-file';
import { SESSION_FILE } from './session';
import { parseShownBuild, type LastShown, type ShownBuild } from '../../shared/app/whats-new';

const WHATS_NEW_FILE = 'whats-new.json';

// The build the what's-new popup last spoke for, in userData. One channel: the renderer hands over
// the build it is and gets back the one before, so the record moves on whether or not anything is
// shown. A client channel (remote-protocol.ts): it is this install's, not a joined host's.
//
// Whether the folder was used before is read here, at registration, before the window opens: the
// launch's own restore writes session.json before the renderer asks, so asking then reads every first
// install as an old one.
export function registerWhatsNew(table: Channels, userData: string): void {
  const file = join(userData, WHATS_NEW_FILE);
  const history = existsSync(join(userData, SESSION_FILE));
  table.handle('whats-new:record', (_screen, current: ShownBuild): LastShown => {
    let shown: ShownBuild | null = null;
    try {
      shown = parseShownBuild(JSON.parse(readFileSync(file, 'utf8')));
    } catch {
      // No record yet, or one that does not parse: read as none.
    }
    const last = { shown, history };
    replaceFile(file, JSON.stringify(current));
    return last;
  });
}
