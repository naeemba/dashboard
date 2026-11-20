// `browser read`: a page's main content as compact markdown, made here on this machine, so a page
// behind a login never goes to a reading service. The page hands back a light tree of its content
// (READ_SCRIPT, run in the page); turning it into markdown and cutting it to a token budget is here,
// where it is tested without a browser.

// A text, or an element: its tag, its children, and a link's address.
export type ReaderNode = string | [tag: string, children: ReaderNode[], href?: string];

export type ReaderPage = { title: string; url: string; tree: ReaderNode | null };

// Run in the page with the selector, or null for the page's main content: its <main> or <article>,
// else the body. What no reader wants is left out where the DOM can still tell it: scripts and
// styles, navigation, the page's own header and footer, forms and their controls, anything hidden.
// Plain JavaScript, not a compiled function, so the bundler can add nothing that the page lacks.
export const READ_SCRIPT = `(selector) => {
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'CANVAS', 'IFRAME', 'NAV', 'FOOTER', 'ASIDE',
    'FORM', 'BUTTON', 'SELECT', 'INPUT', 'TEXTAREA', 'DIALOG', 'OBJECT', 'EMBED', 'VIDEO', 'AUDIO', 'IMG', 'PICTURE', 'HEAD']);
  const ROLES = /^(navigation|banner|contentinfo|complementary|search|dialog|menu|menubar)$/;
  const root = selector ? document.querySelector(selector) : (document.querySelector('main, article, [role="main"]') || document.body);
  if (!root) return { title: document.title, url: location.href, tree: null };
  const walk = (node) => {
    if (node.nodeType === 3) return node.textContent;
    if (node.nodeType !== 1) return null;
    if (node !== root) {
      if (SKIP.has(node.tagName) || ROLES.test(node.getAttribute('role') || '')) return null;
      if (node.tagName === 'HEADER' && node.parentElement === document.body) return null;
      if (node.hidden || node.getAttribute('aria-hidden') === 'true') return null;
      if (node.checkVisibility && !node.checkVisibility()) return null;
    }
    const children = [];
    for (const child of node.childNodes) {
      const each = walk(child);
      if (each !== null && each !== '') children.push(each);
    }
    return node.tagName === 'A' && node.href ? [node.tagName.toLowerCase(), children, node.href] : [node.tagName.toLowerCase(), children];
  };
  return { title: document.title, url: location.href, tree: walk(root) };
}`;

// What `browser read` gives when not told: a long article, and a fraction of any context.
export const DEFAULT_READ_TOKENS = 4000;

// About four characters a token for English prose and markdown, the rule of thumb every reader uses.
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

const HEADINGS = /^h([1-6])$/;
const BLOCKS = new Set([
  'p', 'div', 'section', 'article', 'main', 'header', 'figure', 'figcaption', 'blockquote', 'dl', 'dt', 'dd', 'details',
  'summary', 'table', 'thead', 'tbody', 'tfoot', 'address', 'body',
]);

// A link as short as it can be and still be followed: on the page's own site, its path; a query
// string longer than a short one cut off, since a tracking id is noise to a reader.
export function shortLink(href: string, page: URL | null): string {
  const url = URL.parse(href);
  if (url === null) return href;
  const search = url.search.length > 40 ? '?…' : url.search;
  if (page !== null && url.origin === page.origin) {
    if (url.pathname === page.pathname && url.search === page.search && url.hash !== '') return url.hash;
    return `${url.pathname}${search}${url.hash}`;
  }
  return `${url.origin}${url.pathname}${search}${url.hash}`;
}

export const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim();

function textOf(node: ReaderNode): string {
  return typeof node === 'string' ? node : node[1].map(textOf).join('');
}

// A nested list is indented under its item by the item's own indent, so depth needs no counting.
function markdown(node: ReaderNode, page: URL | null): string {
  if (typeof node === 'string') return node.replace(/\s+/g, ' ');
  const [tag, children, href] = node;
  const inner = () => children.map((child) => markdown(child, page)).join('');
  const wrapped = (mark: string) => {
    const text = oneLine(inner());
    return text === '' ? '' : `${mark}${text}${mark}`;
  };
  const heading = HEADINGS.exec(tag);
  if (heading !== null) {
    const text = oneLine(inner());
    return text === '' ? '' : `\n\n${'#'.repeat(Number(heading[1]))} ${text}\n\n`;
  }
  switch (tag) {
    case 'br': return '\n';
    case 'hr': return '\n\n---\n\n';
    case 'pre': return `\n\n\`\`\`\n${textOf(node).replace(/^\n+|\s+$/g, '')}\n\`\`\`\n\n`;
    case 'code': return wrapped('`');
    case 'strong': case 'b': return wrapped('**');
    case 'em': case 'i': return wrapped('_');
    case 'a': {
      const text = oneLine(inner());
      if (text === '' || href === undefined || /^javascript:/i.test(href)) return text;
      return `[${text}](${shortLink(href, page)})`;
    }
    case 'ul': case 'ol': {
      const items = children.filter((child) => typeof child !== 'string' && child[0] === 'li');
      const lines = items.map((item, place) => {
        const marker = tag === 'ol' ? `${place + 1}.` : '-';
        const body = markdown(['div', (item as [string, ReaderNode[]])[1]], page).trim().replace(/\n+/g, '\n  ');
        return `${marker} ${body}`;
      });
      return `\n\n${lines.join('\n')}\n\n`;
    }
    case 'li': return `\n- ${oneLine(inner())}\n`;
    case 'tr': {
      const cells = children.filter((child) => typeof child !== 'string').map((cell) => oneLine(markdown(cell, page)));
      return cells.some((cell) => cell !== '') ? `\n| ${cells.join(' | ')} |` : '';
    }
    default: return BLOCKS.has(tag) ? `\n\n${inner()}\n\n` : inner();
  }
}

// Lines trimmed, blank runs one blank line, code fences and list indents kept as they are.
function tidy(text: string): string {
  let fenced = false;
  const lines = text.split('\n').map((line) => {
    if (line.startsWith('```')) fenced = !fenced;
    if (fenced || line.startsWith('```')) return line.trimEnd();
    return /^ +(-|\d+\.) /.test(line) ? line.trimEnd() : line.trim();
  });
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export type Reading = { text: string; tokens: number; cut: boolean };

// The page as markdown under its title and address, cut at the last line that fits `maxTokens`.
export function readPage(page: ReaderPage, maxTokens: number): Reading {
  const base = URL.parse(page.url);
  const body = page.tree === null ? '' : tidy(markdown(page.tree, base));
  const whole = [`# ${oneLine(page.title) || page.url}`, page.url, '', body].join('\n').trimEnd();
  const tokens = estimateTokens(whole);
  if (tokens <= maxTokens) return { text: whole, tokens, cut: false };
  const room = whole.slice(0, maxTokens * 4);
  const end = room.lastIndexOf('\n');
  return { text: (end > 0 ? room.slice(0, end) : room).trimEnd(), tokens, cut: true };
}

// What `browser read` prints: the estimate first, so the agent knows what it spent and what it left.
export function readingText(id: number, reading: Reading, maxTokens: number): string {
  const estimate = reading.cut
    ? `tab ${id}: ~${maxTokens} of ~${reading.tokens} tokens; cut, so --max-tokens or --selector for the rest`
    : `tab ${id}: ~${reading.tokens} tokens`;
  return `${estimate}\n\n${reading.text}`;
}
