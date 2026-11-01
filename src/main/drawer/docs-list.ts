import { readFileSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { DocEntry, DocReply } from '../../shared/drawer/drawer';

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

// The image types the Claude screen's markdown renderer shows inline, by extension.
const IMAGE_TYPES: Record<string, string> = { '.png': 'png', '.jpg': 'jpeg', '.jpeg': 'jpeg', '.gif': 'gif', '.webp': 'webp' };

// Whether a file is one of the project's docs, the only files the viewer reads: a path from anywhere
// else is refused, so the channel cannot be asked for ~/.ssh/id_rsa.
export function isDoc(projectPath: string, file: string): boolean {
  const inside = path.relative(path.join(projectPath, 'docs'), file);
  return inside !== '' && !inside.startsWith('..') && !path.isAbsolute(inside) && inside.toLowerCase().endsWith('.md');
}

// A doc's images, carried inline. The markdown renderer shows only an image carried inline and never
// reads the disk (chat-markdown.ts says why), so a screenshot a doc points at is read here, from inside
// the project only, and written into the text. One outside the project, missing, or of another type is
// left as it was and prints as its alt text.
export function inlineImages(text: string, file: string, projectPath: string, read: (image: string) => Buffer | null): string {
  return text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (whole, alt: string, source: string) => {
    const type = IMAGE_TYPES[path.extname(source).toLowerCase()];
    if (type === undefined || /^[a-z]+:/i.test(source)) return whole;
    const image = path.resolve(path.dirname(file), decodeURI(source));
    if (path.relative(projectPath, image).startsWith('..')) return whole;
    const bytes = read(image);
    return bytes === null ? whole : `![${alt}](data:image/${type};base64,${bytes.toString('base64')})`;
  });
}

export async function readDoc(projectPath: string, file: string): Promise<DocReply> {
  if (!isDoc(projectPath, file)) return { refused: 'Only a file under the project\'s docs/ folder opens here' };
  const text = await readFile(file, 'utf8');
  return { text: inlineImages(text, file, projectPath, (image) => {
    try {
      return readFileSync(image);
    } catch {
      return null;
    }
  }) };
}
