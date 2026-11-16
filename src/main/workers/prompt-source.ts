// Whose turn a worker is on: main's, or yours. A turn you started by typing into a worker's pane is a
// conversation you are having with it, and its stop told to main as "stopped without a report" was a
// turn main spent on a worker it had nothing to do with: twelve of them in one session
// (workers-decision-1). So stop-notices.ts tells main nothing of a turn whose last typed prompt was
// yours.
//
// The prompt hook's source cannot tell who typed: main's `pane send` types into the pane, or hands a
// Claude screen its prompt, the way you do. What tells them apart is the prompt itself: every one main
// hands a worker ends with the line asking for a report (asksForReport), whatever order its prompts
// and yours are submitted in.

// UserPromptSubmit's `source`: `user` from Claude Code's composer, `sdk` from an Agent SDK session, a
// Claude screen's. Both are a prompt somebody typed or sent. Anything else (`system` for a task
// notification or a peer's message, the wakeups) is the session waking itself on the turn it was on,
// and a hook that names none, an older Claude Code, decides nothing either.
export function isTyped(source: string | undefined): boolean {
  return source === 'user' || source === 'sdk';
}

export type PromptSources = {
  // The pane's prompt hook fired, with the source it named and whether the prompt asks for a report.
  prompted(id: string, source: string | undefined, handed: boolean): void;
  // Whether the last typed prompt in the pane was yours.
  fromUser(id: string): boolean;
  // The pane's worker is gone or started again: the first typed prompt after is the one it was
  // started on, main's, whoever started it (a run, a ship, the review loop, a resume).
  forget(id: string): void;
};

export function promptSources(): PromptSources {
  // Per pane, once a typed prompt has been seen: whether the last typed prompt was yours. The first is
  // main's even without the line, since a ship's or the review loop's agent is started on a prompt of
  // its own.
  const panes = new Map<string, boolean>();
  return {
    prompted(id, source, handed) {
      if (isTyped(source)) panes.set(id, panes.has(id) && !handed);
    },
    fromUser: (id) => panes.get(id) ?? false,
    forget(id) {
      panes.delete(id);
    },
  };
}
