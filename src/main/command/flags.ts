// The `--flag value` words after a verb, for every noun that takes flags. `--name value` and
// `--name=value` both, because an agent writing the command will use either and refusing one of them
// is a refusal nobody can see coming. Every flag comes back in the order given, a repeated one each
// time, so a verb that takes a flag many times (`project set --deploy`) reads them all and one that
// takes it once keeps the last. A switch (`board list --all`) takes no value and comes back with ''.
export function readFlagList(
  flagArguments: readonly string[],
  allowed: readonly string[],
  switches: readonly string[] = [],
): { flags: [string, string][] } | { message: string } {
  const flags: [string, string][] = [];
  for (let at = 0; at < flagArguments.length; at += 1) {
    const argument = flagArguments[at];
    if (!argument.startsWith('--')) return { message: `not a flag: ${argument}` };
    const equals = argument.indexOf('=');
    const name = equals === -1 ? argument.slice(2) : argument.slice(2, equals);
    if (switches.includes(name)) {
      if (equals !== -1) return { message: `--${name} takes no value` };
      flags.push([name, '']);
      continue;
    }
    if (!allowed.includes(name)) return { message: `no --${name} here; this command takes ${[...switches, ...allowed].map((flag) => `--${flag}`).join(', ')}` };
    if (equals !== -1) {
      flags.push([name, argument.slice(equals + 1)]);
      continue;
    }
    // A missing value is refused rather than read as an empty string: `--branch --notes x` would
    // otherwise clear the branch and say nothing, and the notes would go missing with it.
    at += 1;
    if (at >= flagArguments.length) return { message: `--${name} needs a value` };
    flags.push([name, flagArguments[at]]);
  }
  return { flags };
}
