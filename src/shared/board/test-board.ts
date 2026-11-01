import { DEFAULT_PRIORITY, type Board } from './board';

// One array of titles per column. Each title is also its card's id.
export function board(...columns: string[][]): Board {
  return {
    columns: columns.map((titles, index) => ({
      name: `Column ${index}`,
      cards: titles.map((title) => ({ id: title, title, notes: '', priority: DEFAULT_PRIORITY, parent: null })),
    })),
  };
}

export function titles(result: Board): string[][] {
  return result.columns.map((column) => column.cards.map((card) => card.title));
}
