// A link comes out of a shell's output, so it is only as trustworthy as whatever printed it. Handing the
// operating system an arbitrary scheme is how a line of text opens a mail client or fires a registered
// protocol handler, so only pages get through.
export function isOpenableLink(url: string): boolean {
  const scheme = URL.parse(url)?.protocol;
  return scheme === 'http:' || scheme === 'https:';
}

// Where a frame navigation inside the window goes. The PDF viewer keeps its own blob and its own
// extension pages; a page link leaves for the browser, where every other link on the screen goes;
// anything else is dropped. Widen 'allow' and a link in a PDF loads a remote site inside the overlay.
export function frameNavigation(url: string): 'allow' | 'browser' | 'refuse' {
  if (/^(blob|chrome-extension):/.test(url)) return 'allow';
  return isOpenableLink(url) ? 'browser' : 'refuse';
}

// The key that puts the viewer away: a bare Escape going down. Shift+Escape and the key coming back
// up stay with whatever has the keyboard.
export function dismissesViewer(input: {
  type: string; key: string; shift: boolean; control: boolean; alt: boolean; meta: boolean;
}): boolean {
  return input.type === 'keyDown' && input.key === 'Escape'
    && !(input.shift || input.control || input.alt || input.meta);
}
