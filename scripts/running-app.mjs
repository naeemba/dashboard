// Which command lines are an app running out of this checkout. Kept apart from
// no-running-app.mjs, which reads the process list and exits at import, so the rule can be tested.

// Forward slashes on every platform, so one pattern reads a Windows command line and a POSIX one.
const slashes = (text) => text.replaceAll('\\', '/');

export function runningFromRepository(commandLines, repositoryPath, platform) {
  // Windows paths are not case sensitive, and a command line may spell the drive either way.
  const fold = platform === 'win32' ? (text) => text.toLowerCase() : (text) => text;
  const prefix = fold(`${slashes(repositoryPath)}/`);
  return commandLines.filter((line) => {
    const command = fold(slashes(line));
    return command.includes(prefix) && /\/(out|\.vite)\/|\/node_modules\/electron\//.test(command);
  });
}
