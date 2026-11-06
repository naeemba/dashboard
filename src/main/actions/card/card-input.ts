import type { CardInput, Refused } from '../../../shared/app/bridge';

export type { CardInput };

export function cardInput(raw: Record<string, unknown>): CardInput | Refused {
  const { projectPath, id } = raw;
  if (typeof projectPath !== 'string' || projectPath === '') return { refused: 'no project folder was given' };
  if (typeof id !== 'string' || id.trim() === '') return { refused: 'no card id was given' };
  return { projectPath, id };
}
