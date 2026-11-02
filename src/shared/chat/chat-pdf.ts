// A PDF the conversation names, drawn as a tile that opens in Chromium's own viewer. Two places name
// one: a prompt that mentions it with `@`, which Claude Code reads relative to the session folder,
// and a Read call on it. The mention is sent to Claude as typed; this only decides what the screen
// draws and what main agrees to hand back.

// The largest PDF main reads. Its bytes go back to the screen as base64, a third bigger, and a
// second screen gets them in one frame under the host's 8 MB limit (MAX_FRAME_BYTES).
export const PDF_LIMIT = 5 * 1024 * 1024;
// The limit as the tile and the help dialog say it.
const PDF_LIMIT_SHOWN = `${PDF_LIMIT / 1024 / 1024} MB`;

function isPdfPath(file: string): boolean {
  return /\.pdf$/i.test(file);
}

// `@notes/spec.pdf` or `@"My Spec.pdf"`, standing on its own: an address like `me@host.pdf` is not
// a mention, and a full stop or comma after one ends the sentence, not the name.
const MENTION = /(?:^|\s)@(?:"([^"]+)"|(\S+?))(?=[.,;:!?)]*(?:\s|$))/g;

export function pdfMentions(text: string): string[] {
  return [...text.matchAll(MENTION)]
    .map((match) => match[1] ?? match[2])
    .filter(isPdfPath);
}

// The PDF a tool call reads, or null when it reads none.
export function pdfOfTool(name: string, input: Record<string, unknown>): string | null {
  const file = input.file_path;
  return name === 'Read' && typeof file === 'string' && isPdfPath(file) ? file : null;
}

// Why main will not hand a file back, or null when it will. `size` is null for a file that is not
// there. Main asks this before it reads a byte, and the tile shows what it says.
// A file that is not there is always refused, and the overload says so to a caller holding no size.
export function pdfRefusal(file: string, size: null): string;
export function pdfRefusal(file: string, size: number | null): string | null;
export function pdfRefusal(file: string, size: number | null): string | null {
  if (!isPdfPath(file)) return 'not a PDF';
  if (size === null) return 'not found';
  if (size > PDF_LIMIT) return `over ${PDF_LIMIT_SHOWN}`;
  return null;
}

// What `pdf:read` answers: the file's bytes in base64, or why not.
export type PdfRead = { data: string } | { refused: string };
