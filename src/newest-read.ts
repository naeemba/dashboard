// Reads that can overlap, where only the newest one is allowed to put its result on screen.
//
// Ctrl+B Ctrl+T Ctrl+B can leave two reads of one board running at once, and the older one can land
// last. Only the newest is landed; an older one throws its result away. It does not answer "failed",
// though: the file read fine, by another call. So it answers with the newest read's answer. Answering
// false is what left a ship's card in Ship for good when it finished just as you arrived on the manager.
export type NewestRead<Outcome, Answer> = {
  // Starts a read. `land` runs only if no newer read was started by the time this one settles, and
  // what it returns is the answer — for this read and for every older one still waiting.
  run(read: () => Promise<Outcome>, land: (outcome: Outcome) => Answer): Promise<Answer>;
  // True while the newest read has not landed yet.
  pending(): boolean;
};

export function createNewestRead<Outcome, Answer>(): NewestRead<Outcome, Answer> {
  let started = 0;
  let landed = 0;
  // Always set before any read settles: run assigns it in the same turn it starts the read.
  let newest: Promise<Answer> | null = null;

  return {
    run(read, land) {
      const token = ++started;
      const answer = read().then((outcome): Answer | Promise<Answer> => {
        if (token !== started && newest) return newest;
        landed = token;
        return land(outcome);
      });
      newest = answer;
      return answer;
    },
    pending: () => landed !== started,
  };
}
