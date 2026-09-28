import type { ShipHome } from './board';

// Where each ship not yet back came from, by project. A second ship from the same column needs the
// first one's home to know where it stood — shipHome says why.
//
// Kept per project rather than per board view, because one project has two views on one file: its
// own page's board and the manager's card stack. Ship `b` from the stack and `c` from the page while
// git runs, and a list per view leaves `c` never having heard of `b`, so the two come back swapped.
export type ShipsAway = {
  // Every ship from this project still out.
  away(projectPath: string): ShipHome[];
  // Records a ship as out, and hands back what takes it off the list again once it is back or failed.
  leave(projectPath: string, home: ShipHome): () => void;
};

export function createShipsAway(): ShipsAway {
  const byProject = new Map<string, ShipHome[]>();
  return {
    away: (projectPath) => byProject.get(projectPath) ?? [],
    leave(projectPath, home) {
      byProject.set(projectPath, [...(byProject.get(projectPath) ?? []), home]);
      return () => {
        const left = (byProject.get(projectPath) ?? []).filter((entry) => entry !== home);
        if (left.length === 0) byProject.delete(projectPath);
        else byProject.set(projectPath, left);
      };
    },
  };
}

// The one the renderer's views share. One window, so one list is every view in it.
export const shipsAway = createShipsAway();
