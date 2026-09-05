// A link comes out of a shell's output, so it is only as trustworthy as whatever printed it. Handing the
// operating system an arbitrary scheme is how a line of text opens a mail client or fires a registered
// protocol handler, so only pages get through.
export function isOpenableLink(url: string): boolean {
  const scheme = URL.parse(url)?.protocol;
  return scheme === 'http:' || scheme === 'https:';
}
