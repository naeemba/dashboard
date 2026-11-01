import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { imageDataUrl, type ImageType } from '../../shared/chat/chat-transcript';
import type { DocEntry, DocReply } from '../../shared/drawer/drawer';
import { isInside } from '../panes/shell-directory';

// The markdown files under a project's docs/ folder, which the drawer lists, and one of them read for
// its viewer. A project with no docs/ lists none rather than failing.

// The order the rows print in: by folder, each folder's README before the rest of it, so the index of a
// feature leads the feature.
export function docOrder(one: string, other: string): number {
  const key = (name: string): string => name.replace(/(^|\/)README\.md$/i, '$1');
  return key(one).localeCompare(key(other));
}

export async function listDocs(projectPath: string): Promise<DocEntry[]> {
  const root = path.join(projectPath, 'docs');
  let names: string[];
  try {
    names = await readdir(root, { recursive: true });
  } catch {
    return [];
  }
  return names
    .filter((name) => name.toLowerCase().endsWith('.md'))
    .map((name) => name.split(path.sep).join('/'))
    .sort(docOrder)
    .map((name) => ({ path: path.join(root, name), name }));
}

// The media types of the images a doc points at, by extension; only those the Claude screen's renderer
// shows inline count.
const IMAGE_TYPES: Record<string, ImageType> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};
// An image's address, the text after `![alt](` up to a space or the closing bracket.
const IMAGE_PATTERN = /!\[[^\]]*\]\(\s*([^)\s]+)/g;

// Whether a file is one of the project's docs, the only files the viewer reads: a path from anywhere
// else is refused, so the channel cannot be asked for ~/.ssh/id_rsa.
export function isDoc(projectPath: string, file: string): boolean {
  const root = path.join(projectPath, 'docs');
  return file !== root && isInside(file, root) && file.toLowerCase().endsWith('.md');
}

// The file an image in a doc names, relative to the doc's folder, when it is one the viewer carries:
// inside the project, of a type the renderer shows, not an address on the web, a name that decodes.
function imageFile(source: string, file: string, projectPath: string): { image: string; mediaType: ImageType } | null {
  const mediaType = IMAGE_TYPES[path.extname(source).toLowerCase()];
  if (mediaType === undefined || /^[a-z]+:/i.test(source)) return null;
  let name: string;
  try {
    name = decodeURI(source);
  } catch {
    return null;
  }
  const image = path.resolve(path.dirname(file), name);
  return isInside(image, projectPath) ? { image, mediaType } : null;
}

// The addresses a doc's images point at. Main has no markdown parser (it is the window's), so this
// also takes image syntax shown as code; the renderer swaps only what marked reads as an image, and
// such an example is drawn as written, at the cost of reading that file for nothing.
function imageSources(text: string): string[] {
  return [...text.matchAll(IMAGE_PATTERN)].map(([, source]) => source);
}

// A doc's images, carried inline. The markdown renderer shows only an image carried inline and never
// reads the disk (chat-markdown.ts says why), so a screenshot a doc points at is read by main and sent
// beside the text, by the address the doc gives it; the text itself travels as written, and
// renderMarkdown swaps the address for the data URL where marked reads an image. `images` is
// what was read, by path; one not in it is left out and prints as its alt text.
export function imageUrls(text: string, file: string, projectPath: string, images: ReadonlyMap<string, Buffer>): Record<string, string> {
  return Object.fromEntries(imageSources(text).flatMap((source) => {
    const found = imageFile(source, file, projectPath);
    const bytes = found === null ? undefined : images.get(found.image);
    if (found === null || bytes === undefined) return [];
    return [[source, imageDataUrl({ mediaType: found.mediaType, data: bytes.toString('base64') })]];
  }));
}

export async function readDoc(projectPath: string, file: string): Promise<DocReply> {
  if (!isDoc(projectPath, file)) return { refused: 'Only a file under the project\'s docs/ folder opens here' };
  const text = await readFile(file, 'utf8');
  const wanted = imageSources(text).flatMap((source) => imageFile(source, file, projectPath)?.image ?? []);
  const read = await Promise.all([...new Set(wanted)].map(async (image) => [image, await readFile(image).catch(() => null)] as const));
  const images = new Map(read.flatMap(([image, bytes]) => (bytes === null ? [] : [[image, bytes] as const])));
  return { text, images: imageUrls(text, file, projectPath, images) };
}
