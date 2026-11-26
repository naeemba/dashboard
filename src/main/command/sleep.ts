// A synchronous sleep, for the programs that run start to end without an event loop to wait on.
export function sleep(milliseconds: number): void {
  if (milliseconds > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}
