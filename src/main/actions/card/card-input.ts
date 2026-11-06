import type { Refused } from '../../../shared/app/bridge';

// The input every card action starts from: the project's folder and the card's id.
export type CardInput = { projectPath: string; id: string };

export function cardInput(raw: Record<string, unknown>): CardInput | Refused {
  const { projectPath, id } = raw;
  if (typeof projectPath !== 'string' || projectPath === '') return { refused: 'no project folder was given' };
  if (typeof id !== 'string' || id.trim() === '') return { refused: 'no card id was given' };
  return { projectPath, id };
}
