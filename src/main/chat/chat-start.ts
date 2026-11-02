import { paneFromId } from '../../shared/panes/terminals';

// Whether a page's main session starts as soon as the page opens rather than the first time its Claude
// screen is shown. A worker main dispatched that came back after a restart ends its turn by
// SendMessage to main by name, which needs main running to arrive at; any other page waits until you
// look at it, or until the app tells it something (performance finding 3: an idle CLI is ~100 MB).
export function startsAtOpen(slot: number, mainsWorkerPanes: ReadonlySet<string>): boolean {
  return [...mainsWorkerPanes].some((id) => paneFromId(id).slot === slot);
}
