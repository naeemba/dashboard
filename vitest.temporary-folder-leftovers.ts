// What a test run left in its temporary folder that a test should have removed, counted by the name
// it was made with (mkdtemp's six random characters dropped): `dashboard-review- ×62`. Node's own
// compile caches are not a test's: node writes them into whatever TMPDIR says and keeps them on purpose.
const NODE_CACHES = /^(node-compile-cache|v8-compile-cache)(-|$)/;

export function leftoverTemporaryEntries(entries: string[]): string[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (NODE_CACHES.test(entry)) continue;
    const name = entry.replace(/[A-Za-z0-9]{6}$/, '');
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([name, count]) => `${name} ×${count}`);
}
