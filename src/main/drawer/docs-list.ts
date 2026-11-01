import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { imageDataUrl, type ImageType } from '../../shared/chat/chat-transcript';
import type { DocEntry, DocReply } from '../../shared/drawer/drawer';
import { isManagerPath } from '../../shared/manager/manager';
import { isInside } from '../panes/shell-directory';

// The markdown files the drawer lists, and one of them read for its viewer: a project's docs/ folder,
// or on the manager's page the manager's folder and Claude's, both in the home folder. A project with
// no docs/ lists none rather than failing.

// The manager's two folders, by their names in the home folder. ~/.claude holds thousands of files
// (projects/, plugins/, caches), so these are read a folder at a time, as each is opened, never walked.
export const MANAGER_DOC_ROOTS = ['.dashboard', '.claude'];

// The order the rows print in: by folder, each folder's README before the rest of it, so the index of a
// feature leads the feature.
export function docOrder(one: string, other: string): number {
  const key = (name: string): string => name.replace(/(^|\/)README\.md$/i, '$1');
  return key(one).localeCompare(key(other));
}

async function projectDocs(projectPath: string): Promise<DocEntry[]> {
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

// What one of the manager's folders holds, a folder of it named by its path under the home folder: its
// markdown files and its folders, which may hold none. A name outside the two folders lists nothing.
async function managerFolder(home: string, folder: string): Promise<DocEntry[]> {
  const directory = path.resolve(home, folder);
  if (!MANAGER_DOC_ROOTS.some((root) => isInside(directory, path.join(home, root)))) return [];
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const name = (entry: { name: string }): string => path.relative(home, path.join(directory, entry.name)).split(path.sep).join('/');
  return entries.flatMap((entry): DocEntry[] => {
    if (entry.isDirectory()) return [{ path: path.join(directory, entry.name), name: name(entry), folder: true }];
    return entry.name.toLowerCase().endsWith('.md') ? [{ path: path.join(directory, entry.name), name: name(entry) }] : [];
  });
}

// The docs the drawer lists. A project's are every file under docs/, read at once. The manager's are
// its two folders and what is in each folder the tree has open, `open`, by path under the home folder.
export async function listDocs(projectPath: string, open: readonly string[], home: string): Promise<DocEntry[]> {
  if (!isManagerPath(projectPath)) return projectDocs(projectPath);
  const roots = MANAGER_DOC_ROOTS.map((name): DocEntry => ({ path: path.join(home, name), name, folder: true }));
  const inside = await Promise.all([...new Set(open)].map((folder) => managerFolder(home, folder)));
  return [...roots, ...inside.flat().sort((one, other) => docOrder(one.name, other.name))];
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

// Where a doc may be read from and where the images it shows may be: a project's docs/ folder and the
// project, or one of the manager's folders and that folder.
type DocScope = { root: string; images: string };

function scopes(projectPath: string, home: string): DocScope[] {
  if (!isManagerPath(projectPath)) return [{ root: path.join(projectPath, 'docs'), images: projectPath }];
  return MANAGER_DOC_ROOTS.map((name) => ({ root: path.join(home, name), images: path.join(home, name) }));
}

// The scope a file is a doc of, the only files the viewer reads: markdown under the project's docs/,
// or under the manager's two folders on its page. A path from anywhere else is refused, so the channel
// cannot be asked for ~/.ssh/id_rsa.
export function docScope(projectPath: string, file: string, home: string): DocScope | null {
  if (!file.toLowerCase().endsWith('.md')) return null;
  return scopes(projectPath, home).find(({ root }) => file !== root && isInside(file, root)) ?? null;
}

// The file an image in a doc names, relative to the doc's folder, when it is one the viewer carries:
// inside `imageRoot`, of a type the renderer shows, not an address on the web, a name that decodes.
function imageFile(source: string, file: string, imageRoot: string): { image: string; mediaType: ImageType } | null {
  const mediaType = IMAGE_TYPES[path.extname(source).toLowerCase()];
  if (mediaType === undefined || /^[a-z]+:/i.test(source)) return null;
  let name: string;
  try {
    name = decodeURI(source);
  } catch {
    return null;
  }
  const image = path.resolve(path.dirname(file), name);
  return isInside(image, imageRoot) ? { image, mediaType } : null;
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
export function imageUrls(text: string, file: string, imageRoot: string, images: ReadonlyMap<string, Buffer>): Record<string, string> {
  return Object.fromEntries(imageSources(text).flatMap((source) => {
    const found = imageFile(source, file, imageRoot);
    const bytes = found === null ? undefined : images.get(found.image);
    if (found === null || bytes === undefined) return [];
    return [[source, imageDataUrl({ mediaType: found.mediaType, data: bytes.toString('base64') })]];
  }));
}

export async function readDoc(projectPath: string, file: string, home: string): Promise<DocReply> {
  const scope = docScope(projectPath, file, home);
  if (scope === null) {
    return { refused: isManagerPath(projectPath) ? 'Only a markdown file under ~/.dashboard or ~/.claude opens here' : 'Only a file under the project\'s docs/ folder opens here' };
  }
  const text = await readFile(file, 'utf8');
  const wanted = imageSources(text).flatMap((source) => imageFile(source, file, scope.images)?.image ?? []);
  const read = await Promise.all([...new Set(wanted)].map(async (image) => [image, await readFile(image).catch(() => null)] as const));
  const images = new Map(read.flatMap(([image, bytes]) => (bytes === null ? [] : [[image, bytes] as const])));
  return { text, images: imageUrls(text, file, scope.images, images) };
}
