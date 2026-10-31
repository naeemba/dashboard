import path from 'node:path';

// What `chat-export:write` answers: where the file went, or why it was not written.
export type ExportWrite = { path: string } | { refused: string };

// Where a typed name saves to, or why not. A name leaving the project's folder — an absolute path or
// one whose first segment is `..` — is refused, and so is a file already there, so /export never
// overwrites anything. The folder check is on the typed path: a linked folder inside the project is
// followed out, but what it leads to is still never overwritten, since `exists` follows the link.
export function exportTarget(folder: string, name: string, exists: (file: string) => boolean): ExportWrite {
  const target = path.resolve(folder, name);
  const inside = path.relative(folder, target);
  if (inside === '' || inside === '..' || inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside)) {
    return { refused: `${name} is outside the project's folder.` };
  }
  if (exists(target)) return { refused: `${name} already exists; pick another name.` };
  return { path: target };
}
