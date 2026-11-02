// Whether text looks like a path that names one place on some platform: `~`, `~/…`, `/…`, or a drive
// letter (`C:\…`, `C:/…`). The picker offers a row for such text. It runs on the screen, which on a
// remote screen is not the machine the project opens on, so it cannot ask that machine's platform; this
// is a superset of what any host's main accepts. Main asks its own platform (wholePath, path.isAbsolute)
// and refuses a row it cannot open.
export function isWholePath(text: string): boolean {
  return /^(~(\/|$)|\/|[A-Za-z]:[\\/])/.test(text);
}
