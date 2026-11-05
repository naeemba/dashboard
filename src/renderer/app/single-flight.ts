// A refresh that runs one read at a time: a press while a read is running does nothing, so ten clicks
// on a slow source are one request, not ten racing to draw. `onBusy` hears when the read starts and
// ends, for a button's spin. A rejected read only ends the spin; a caller that wants to say why
// catches inside `run`. The market cards and the Claude screen's meters both refresh through this.
export function singleFlight(run: () => Promise<unknown>, onBusy: (busy: boolean) => void): () => void {
  let busy = false;
  return () => {
    if (busy) return;
    busy = true;
    onBusy(true);
    void run().catch(() => {}).finally(() => {
      busy = false;
      onBusy(false);
    });
  };
}
