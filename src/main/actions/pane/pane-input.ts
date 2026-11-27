import type { Refused } from '../../../shared/app/bridge';

// The checks the actions' inputs make of what came in, whichever door it came through: the pane,
// card and browser actions read them here.

export function isFilledText(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

export function isFilledTextOrNull(value: unknown): value is string | null {
  return value === null || isFilledText(value);
}

// A process id: a CI wait's (pane.ci-wait), from the `pane ci` words or any other door.
export function isProcessId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

// A page: a project's slot, or the manager's, which is negative.
export function isSlot(value: unknown): value is number {
  return Number.isInteger(value);
}

// The project folder an action acts in.
export function projectInput(raw: Record<string, unknown>): { projectPath: string } | Refused {
  return isFilledText(raw.projectPath) ? { projectPath: raw.projectPath } : { refused: 'no project folder was given' };
}
