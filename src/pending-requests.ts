import type { Reply } from './remote-protocol';

// Requests out on the wire with no reply yet. Settled by id when the reply comes, expired by the
// client's timer, failed together when the socket drops; a request never waits forever, so no dialog
// hangs on a wifi that went away.
export type Pending = {
  open(id: number, resolve: (value: unknown) => void, reject: (error: Error) => void): void;
  settle(reply: Reply): void;
  expire(id: number, address: string): void;
  failAll(reason: string): void;
};

export function pendingRequests(): Pending {
  const waiting = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  return {
    open(id, resolve, reject) { waiting.set(id, { resolve, reject }); },
    settle(reply) {
      const entry = waiting.get(reply.id);
      if (!entry) return;
      waiting.delete(reply.id);
      if (reply.error !== undefined) entry.reject(new Error(reply.error));
      else entry.resolve(reply.result);
    },
    expire(id, address) {
      const entry = waiting.get(id);
      if (!entry) return;
      waiting.delete(id);
      entry.reject(new Error(`No answer from ${address}`));
    },
    failAll(reason) {
      for (const entry of waiting.values()) entry.reject(new Error(reason));
      waiting.clear();
    },
  };
}
