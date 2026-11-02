// Whether text names one place on its own, whatever folder it is read from: `~`, `~/…`, `/…`, or a
// drive letter (`C:\…`, `C:/…`) for the Windows build. Main resolves such a path (wholePath) and the
// picker offers to open one it is typed; shared so the two never disagree on which text is a path.
export function isWholePath(text: string): boolean {
  return /^(~(\/|$)|\/|[A-Za-z]:[\\/])/.test(text);
}
