import { readFileSync } from 'node:fs';
import { isRecord } from '../../shared/app/is-record';

// A file that is missing, unreadable or not what this app wrote reads as empty.
// A JSON file of string values, keyed by project path: the main conversations chat-sessions.ts resumes,
// the session names project-names.ts gives.
export function readStringRecord(file: string): Record<string, string> {
  try {
    const read: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return isRecord(read) ? Object.fromEntries(Object.entries(read).filter(([, id]) => typeof id === 'string')) as Record<string, string> : {};
  } catch {
    return {};
  }
}
