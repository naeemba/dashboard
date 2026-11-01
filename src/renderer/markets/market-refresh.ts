// When one of the manager's market cards reads its source again. Each card has its own: a refresh of
// Bitcoin leaves the gold card's timer alone.
//
// - A refresh while a read is still running does nothing. Ten clicks on a slow source are one request,
//   not ten racing to draw.
// - The next scheduled read is counted from when the last one finished, however it started. Clicked
//   twenty-nine minutes into the half hour, the card does not read again a minute later.
export type MarketRefresh = { refresh(): void };

export function createMarketRefresh(
  read: () => Promise<void>, intervalMs: number, onBusy: (busy: boolean) => void,
): MarketRefresh {
  let busy = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function refresh(): void {
    if (busy) return;
    busy = true;
    clearTimeout(timer);
    onBusy(true);
    // A rejected read is the card's own business to draw; here it only has to end the spin and
    // schedule the next read, or the card would spin and never read again.
    void read().catch(() => {}).finally(() => {
      busy = false;
      onBusy(false);
      timer = setTimeout(refresh, intervalMs);
    });
  }

  return { refresh };
}
