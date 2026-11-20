import type { Refused } from '../../../shared/app/bridge';

// The checks every pane action's input makes of what came in, whichever door it came through.

export function isFilledText(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

export function isFilledTextOrNull(value: unknown): value is string | null {
  return value === null || isFilledText(value);
}

// A page: a project's slot, or the manager's, which is negative.
export function isSlot(value: unknown): value is number {
  return Number.isInteger(value);
}

// The project folder an action acts in: the card and browser actions read it here.
export function projectInput(raw: Record<string, unknown>): { projectPath: string } | Refused {
  return isFilledText(raw.projectPath) ? { projectPath: raw.projectPath } : { refused: 'no project folder was given' };
}
