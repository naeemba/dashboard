// Whether showing the Claude screen should start its page's session: the first show in a conversation
// does, and only that one, so a session that fails to start waits for a prompt, not the next visit.
// A new conversation arms it again.
export type FirstShow = { take(): boolean; rearm(): void };

export function firstShow(): FirstShow {
  let shown = false;
  return {
    take() {
      if (shown) return false;
      shown = true;
      return true;
    },
    rearm() {
      shown = false;
    },
  };
}
