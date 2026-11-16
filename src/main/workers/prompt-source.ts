// Whose turn a worker is on: main's, or yours. A turn you started by typing into a worker's pane is a
// conversation you are having with it, and its stop told to main as "stopped without a report" was a
// turn main spent on a worker it had nothing to do with: twelve of them in one session
// (workers-decision-1). So stop-notices.ts tells main nothing of a turn whose last typed prompt was
// yours.
//
// The prompt hook cannot tell who typed: main's `pane send` types into the pane, or hands a Claude
// screen its prompt, the way you do. What tells them apart is the app's own record: a typed prompt
// after main handed the pane work is main's, and one with nothing handed since the last is yours.

// UserPromptSubmit's `source`: `user` from Claude Code's composer, `sdk` from an Agent SDK session, a
// Claude screen's. Both are a prompt somebody typed or sent. Anything else (`system` for a task
// notification or a peer's message, the wakeups) is the session waking itself on the turn it was on,
// and a hook that names none, an older Claude Code, decides nothing either.
export function isTyped(source: string | undefined): boolean {
  return source === 'user' || source === 'sdk';
}

export type PromptSources = {
  // Main ran the pane's worker or sent it work: the next typed prompt is main's.
  handed(id: string): void;
  // The pane's prompt hook fired, with the source it named.
  prompted(id: string, source: string | undefined): void;
  // Whether the last typed prompt in the pane was yours.
  fromUser(id: string): boolean;
  // The pane's worker is gone or started again: the first typed prompt after is the one it was
  // started on, main's, whoever started it (a run, a ship, the review loop, a resume).
  forget(id: string): void;
};

export function promptSources(): PromptSources {
  // Per pane, once a typed prompt has been seen: whether main handed it work since, and whether the
  // last typed prompt was yours.
  const panes = new Map<string, { handed: boolean; fromUser: boolean }>();
  return {
    handed(id) {
      panes.set(id, { handed: true, fromUser: panes.get(id)?.fromUser ?? false });
    },
    prompted(id, source) {
      if (!isTyped(source)) return;
      const pane = panes.get(id);
      panes.set(id, { handed: false, fromUser: pane !== undefined && !pane.handed });
    },
    fromUser: (id) => panes.get(id)?.fromUser ?? false,
    forget(id) {
      panes.delete(id);
    },
  };
}
