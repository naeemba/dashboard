import path from 'node:path';

// Where a typed name saves to, or null when it leaves the project's folder — an absolute path or one
// climbing out with `..` — which is refused, so /export never overwrites a file elsewhere on disk.
export function exportTarget(folder: string, name: string): string | null {
  const target = path.resolve(folder, name);
  const inside = path.relative(folder, target);
  return inside === '' || inside.startsWith('..') || path.isAbsolute(inside) ? null : target;
}
