// Where a link sits in the line, as string offsets, end exclusive.
export type LinkSpan = { start: number; end: number };

// The line number and column are inside the span, so the underline covers `main.ts:42` whole.
export type FileLink = LinkSpan & {
  path: string;
  line?: number;
  column?: number;
};

// A link comes out of a shell's output, so it is only as trustworthy as whatever printed it. Handing the
// operating system an arbitrary scheme is how a line of text opens a mail client or fires a registered
// protocol handler, so only pages get through.
export function isOpenableLink(url: string): boolean {
  const scheme = URL.parse(url)?.protocol;
  return scheme === 'http:' || scheme === 'https:';
}
