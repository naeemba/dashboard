import { PDF_TILE } from './chat-entries';
import { PANE_LINK } from './chat-pane-links';
import { imageOverlay } from '../app/overlay';

export type ScreenClicks = { openPdf(tile: HTMLElement): void; goToPane(id: string): void; openExternal(url: string): void };

// What a click on a conversation does, the main log's and an agent's alike: an image opens full size
// over the app, a PDF's tile the PDF, a pane link lands on its pane, and any other link opens in the
// browser, where main decides what is safe to hand the system, never in this window.
export function screenClick(event: MouseEvent, clicks: ScreenClicks): void {
  if (event.target instanceof HTMLImageElement) {
    event.preventDefault();
    imageOverlay(event.target.src);
    return;
  }
  const target = event.target instanceof Element ? event.target : null;
  const tile = target?.closest<HTMLElement>(`.${PDF_TILE}`);
  if (tile) return clicks.openPdf(tile);
  const pane = target?.closest<HTMLElement>(`.${PANE_LINK}`);
  const link = target?.closest('a');
  if (!pane && !link) return;
  event.preventDefault();
  if (pane) clicks.goToPane(pane.dataset.pane ?? '');
  else if (link) clicks.openExternal(link.href);
}
