export type InputQueue<T> = AsyncIterable<T> & { push(message: T): void; close(): void };

// The prompts of one session, handed to the SDK as the async iterable streaming input mode reads.
// Its own file so the screen host (screen-host-entry.ts) can use it without bundling the chat code.
export function inputQueue<T>(): InputQueue<T> {
  const waiting: T[] = [];
  let wake: (() => void) | null = null;
  let closed = false;
  return {
    push(message) { waiting.push(message); wake?.(); },
    close() { closed = true; wake?.(); },
    async *[Symbol.asyncIterator]() {
      for (;;) {
        while (waiting.length > 0) yield waiting.shift() as T;
        if (closed) return;
        await new Promise<void>((resolve) => { wake = resolve; });
        wake = null;
      }
    },
  };
}
