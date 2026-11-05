import { icon } from '../app/icons';
import { viewerOverlay } from '../app/overlay';
import { openLinksOutside, renderMarkdown } from '../chat/chat-markdown';

// A doc read as markdown, full screen on the sheet the Claude screen opens an image on, drawn by the
// Claude screen's own renderer so tables, code and images read the way they do there. Its one row,
// Edit, leads it and is always the highlighted one: Enter or a click on it puts the viewer away and
// opens the file in the project's nvim. The arrows and Page keys scroll the doc, Escape puts it away.
// A link opens in the browser, the way one on the Claude screen does. With no `edit`, the manager's
// page, there is no row and Enter closes it as Escape does.
export function docOverlay(
  name: string, text: string, images: Record<string, string>, edit: (() => void) | null, openLink: (url: string) => void,
): void {
  const body = document.createElement('div');
  body.className = 'chat-text doc-viewer-text';
  body.innerHTML = renderMarkdown(text, images);
  openLinksOutside(body, openLink);
  const shown = document.createElement('div');
  if (edit === null) {
    shown.append(body);
    viewerOverlay('doc-viewer', shown);
    return;
  }
  const row = editRow(name, 'Enter edits · ↑↓ scroll · Escape closes');
  shown.append(row, body);
  const editing = (): void => {
    close();
    edit();
  };
  const close = viewerOverlay('doc-viewer', shown, { enter: editing });
  row.addEventListener('click', editing);
}

// The row at the top of a viewer that opens the doc in nvim, with the viewer's keys beside it. Kept in
// sight while the doc scrolls under it.
export function editRow(name: string, keysLine: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'drawer-row highlighted doc-viewer-edit';
  const label = document.createElement('span');
  label.className = 'drawer-name';
  label.textContent = `Edit ${name} in nvim`;
  const keys = document.createElement('span');
  keys.className = 'drawer-detail';
  keys.textContent = keysLine;
  row.append(icon('editor'), label, keys);
  return row;
}
