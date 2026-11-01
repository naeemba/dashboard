import type { ShipHome } from './board';

// Where each ship not yet back came from, by project. A second ship from the same column needs the
// first one's home to know where it stood — shipHome says why.
//
// Kept per project rather than per board view, because one project has two views on one file: its
// own page's board and the manager's card stack. Ship `b` from the stack and `c` from the page while
// git runs, and a list per view leaves `c` never having heard of `b`, so the two come back swapped.

type Listener = { projectPath: string; view: unknown; onHome: () => void };

export type ShipsAway = {
  // Every ship from this project still out.
  away(projectPath: string): ShipHome[];
  // Records a ship as out, and hands back what takes it off the list again once it is back or failed.
  leave(projectPath: string, home: ShipHome): () => void;
  // A ship came home and `writer`'s board wrote the file. Every other view of that project is told,
  // because main does not announce the app's own writes, and a view left holding the board from
  // before would write it back over this one on your next keystroke — the card put back in Ship for
  // good. The view that wrote already holds what it wrote, and another project's file is untouched.
  cameHome(projectPath: string, writer: unknown): void;
  // A view of a project, hearing every other view of it put a ship home. Hands back what stops it
  // hearing, for when the view is dropped: a closed project's view left on the list would be kept
  // alive, whole board and all, for as long as the window is open.
  listen(projectPath: string, view: unknown, onHome: () => void): () => void;
};

export function createShipsAway(): ShipsAway {
  const byProject = new Map<string, ShipHome[]>();
  let listeners: Listener[] = [];
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
    cameHome(projectPath, writer) {
      for (const listener of listeners) {
        if (listener.projectPath === projectPath && listener.view !== writer) listener.onHome();
      }
    },
    listen(projectPath, view, onHome) {
      const listener = { projectPath, view, onHome };
      listeners.push(listener);
      return () => {
        listeners = listeners.filter((entry) => entry !== listener);
      };
    },
  };
}

// The one the renderer's views share. One window, so one list is every view in it.
export const shipsAway = createShipsAway();

// What a view does with a ship that worked, in the only order that is safe.
export type HomePorts = {
  // Read the file into the view. True when the read worked and the view now holds what it read.
  read(): Promise<boolean>;
  // Put the card home on what the view holds, and write that. False when there was nothing to move.
  putHome(): Promise<boolean>;
  // Tell every other view of the project that the file changed.
  announce(): void;
};

// The file first, not the board the view holds. The manager's stack and a project's own page are two
// views of one file, and the one a ship finishes in can be hidden and hours stale: put the card home
// on its own copy and it writes that copy over whatever the other view shipped since. A read that
// fails leaves the card in Ship, rather than guess, and the read has already said why.
export async function bringHome(ports: HomePorts): Promise<void> {
  if (!(await ports.read())) return;
  if (!(await ports.putHome())) return;
  ports.announce();
}
