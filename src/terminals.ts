export const TERMINAL_COUNT = 5;

export function terminalId(projectIndex: number, terminalIndex: number): string {
  return `${projectIndex}:${terminalIndex}`;
}
