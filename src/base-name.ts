// The last segment of a path, splitting on both separators.
//
// node:path's basename would be the obvious reader, and two things stop it. It does not split on a
// backslash on darwin, so a path from a Windows share comes back whole — a project opened from one
// would show its entire path where its name goes, and shell.ts would miss the PowerShell branch on a
// SHELL_COMMAND written with backslashes. And the renderer cannot import node:path as a value at all.
//
// The fallback is the path itself rather than an empty string: a name is being shown to somebody, and
// showing nothing says less than showing something odd.
export function baseName(path: string): string {
  return path.split(/[\\/]/).filter((segment) => segment !== '').pop() ?? path;
}
