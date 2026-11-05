// The memory files the latest measure of each project's session named: its CLAUDE.md files and the
// memory files Claude Code loaded. The context popup opens them in the doc viewer, so docs:read takes
// exactly these paths besides its own roots, and nothing else; a measure replaces what the one before
// it named, so a file the session dropped stops opening.
const named = new Map<string, ReadonlySet<string>>();

export function nameMemoryFiles(projectPath: string, files: readonly { path: string }[]): void {
  named.set(projectPath, new Set(files.map((file) => file.path)));
}

export function memoryFilesOf(projectPath: string): ReadonlySet<string> {
  return named.get(projectPath) ?? new Set();
}
