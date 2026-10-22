import { heldSlots, resumable, type ClaudeSlot } from './claude-resume';
import type { SavedPage } from './session';

// What a launch owes each pane, and what each pane counts as running when session.json is written.
// claude-resume.ts holds the rules one slot at a time; this holds them across a run: which saved slots
// are still to be handed out, which panes were resumed and when, and which reading of the panes is the
// latest. session-store.ts is the file and the channels around it.

// One reading of where every live session is, by pane, and when the reading was taken. Taken, not
// arrived: the sweep reads the panes before it reads every log on the machine, and what it found is as
// old as the moment it looked.
export type SessionPlacement = { byPane: ReadonlyMap<string, ClaudeSlot>; takenAt: number };

export type ResumeLedger = {
  // The session pane `index` of this project should resume, or null. Used up whether or not it
  // resumes, so a project closed and opened again later in the run starts empty like any other.
  take(projectPath: string, index: number, id: string, now: number): ClaudeSlot | null;
  place(placement: SessionPlacement): void;
  // What each pane is running, by terminal id, for the next write.
  held(): ReadonlyMap<string, ClaudeSlot>;
};

export function resumeLedger(
  pages: readonly SavedPage[],
  exists: (directory: string) => boolean,
): ResumeLedger {
  const pending = new Map(pages.map((page) => [page.path, [...page.claude]]));
  const resumed = new Map<string, ClaudeSlot>();
  // The grace runs from the last pane resumed, not from launch: a launch spends seconds on the window
  // and the restore before the first pane exists, and every one of them would come off the grace.
  let resumedAt: number | null = null;
  let latest: SessionPlacement = { byPane: new Map(), takenAt: -Infinity };

  return {
    take(projectPath, index, id, now) {
      const slots = pending.get(projectPath);
      const slot = slots?.[index];
      if (slots !== undefined) slots[index] = null;
      if (!resumable(slot, exists)) return null;
      resumed.set(id, slot);
      resumedAt = now;
      return slot;
    },
    place(placement) {
      // A sweep that looked before Quit can finish after it, and what it saw is older than what Quit saw.
      if (placement.takenAt < latest.takenAt) return;
      latest = placement;
    },
    held() {
      if (resumedAt === null) return latest.byPane;
      return heldSlots(latest.byPane, resumed, latest.takenAt - resumedAt);
    },
  };
}
