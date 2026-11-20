import type { CardInput, Refused } from '../../../shared/app/bridge';
import { isRefused } from '../action';
import { projectInput } from '../pane/pane-input';

export type { CardInput };

export function cardInput(raw: Record<string, unknown>): CardInput | Refused {
  const project = projectInput(raw);
  if (isRefused(project)) return project;
  const { id } = raw;
  if (typeof id !== 'string' || id.trim() === '') return { refused: 'no card id was given' };
  return { ...project, id };
}
