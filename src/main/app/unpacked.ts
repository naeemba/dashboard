import path from 'node:path';

// The copy of a packaged file that forge put in app.asar.unpacked, for a file something reads from a
// plain path on disk (node running a CLI entry, a worker thread, the agent binary), which cannot reach
// inside the asar. forge.config.ts lists what is unpacked. In development there is no asar in the path
// and this returns it unchanged.
export function unpacked(file: string): string {
  return file.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
}
