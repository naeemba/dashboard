import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { imageDataUrl, type ImageType } from '../../shared/chat/chat-transcript';
import type { DocEntry, DocReply } from '../../shared/drawer/drawer';
import { isManagerPath } from '../../shared/manager/manager';
import { isInside } from '../panes/shell-directory';

// The markdown files the drawer lists, and one of them read for its viewer: a project's docs/ folder,
// or on the manager's page its roots, the manager's folder and Claude's, which drawer-ipc.ts passes in
// as `roots` so where the manager's folder lives is said once, in manager-terminals.ts. A project with
// no docs/ lists none rather than failing.
//
// ~/.claude holds thousands of files (projects/, plugins/, caches), so a root is read a folder at a
// time, as each is opened, never walked. Each root is named by its folder's name and what is in it by
// its path from there: `.claude/rules/naming.md`.

const isMarkdown = (name: string): boolean => name.toLowerCase().endsWith('.md');
const rowName = (root: string, file: string): string => path.relative(path.dirname(root), file).split(path.sep).join('/');

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
    .filter(isMarkdown)
    .map((name) => name.split(path.sep).join('/'))
    .sort(docOrder)
    .map((name) => ({ path: path.join(root, name), name }));
}

// What a folder of one of the roots holds, the folder named as its rows are: its markdown files and its
// folders, which may hold none. A folder reached through a link counts as one (~/.claude's rules/ and
// commands/ are often links into a dotfiles repository); a broken link is dropped. A name outside the
// roots lists nothing.
async function managerFolder(roots: readonly string[], folder: string): Promise<DocEntry[]> {
  const root = roots.find((each) => folder === path.basename(each) || folder.startsWith(`${path.basename(each)}/`));
  if (root === undefined) return [];
  const directory = path.resolve(path.dirname(root), folder);
  if (!isInside(directory, root)) return [];
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const rows = await Promise.all(entries.map(async (entry): Promise<DocEntry[]> => {
    const file = path.join(directory, entry.name);
    const isFolder = entry.isSymbolicLink() ? await stat(file).then((found) => found.isDirectory(), () => null) : entry.isDirectory();
    if (isFolder === null) return [];
    if (isFolder) return [{ path: file, name: rowName(root, file), folder: true }];
    return isMarkdown(entry.name) ? [{ path: file, name: rowName(root, file) }] : [];
  }));
  return rows.flat();
}

// The docs the drawer lists. A project's are every file under docs/, read at once. The manager's are
// its roots and what is in each folder the tree has open, `open`, named as the rows name them.
export async function listDocs(projectPath: string, open: readonly string[], roots: readonly string[]): Promise<DocEntry[]> {
  if (!isManagerPath(projectPath)) return projectDocs(projectPath);
  const tops = roots.map((root): DocEntry => ({ path: root, name: path.basename(root), folder: true }));
  const inside = await Promise.all([...new Set(open)].map((folder) => managerFolder(roots, folder)));
  return [...tops, ...inside.flat().sort((one, other) => docOrder(one.name, other.name))];
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

function scopes(projectPath: string, roots: readonly string[]): DocScope[] {
  if (!isManagerPath(projectPath)) return [{ root: path.join(projectPath, 'docs'), images: projectPath }];
  return roots.map((root) => ({ root, images: root }));
}

// The scope a file is a doc of, the only files the viewer reads: markdown under the project's docs/,
// or under the manager's roots on its page. A path from anywhere else is refused, so the channel
// cannot be asked for ~/.ssh/id_rsa.
export function docScope(projectPath: string, file: string, roots: readonly string[]): DocScope | null {
  if (!isMarkdown(file)) return null;
  return scopes(projectPath, roots).find(({ root }) => file !== root && isInside(file, root)) ?? null;
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

export async function readDoc(projectPath: string, file: string, roots: readonly string[]): Promise<DocReply> {
  const scope = docScope(projectPath, file, roots);
  if (scope === null) {
    return { refused: isManagerPath(projectPath) ? 'Only a markdown file under ~/.dashboard or ~/.claude opens here' : 'Only a file under the project\'s docs/ folder opens here' };
  }
  const text = await readFile(file, 'utf8');
  const wanted = imageSources(text).flatMap((source) => imageFile(source, file, scope.images)?.image ?? []);
  const read = await Promise.all([...new Set(wanted)].map(async (image) => [image, await readFile(image).catch(() => null)] as const));
  const images = new Map(read.flatMap(([image, bytes]) => (bytes === null ? [] : [[image, bytes] as const])));
  return { text, images: imageUrls(text, file, scope.images, images) };
}
