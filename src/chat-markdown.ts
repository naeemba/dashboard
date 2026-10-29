import hljs from 'highlight.js/lib/common';
import { Marked, type Tokens } from 'marked';

// What Claude writes, as HTML the chat pane can put on screen. Everything that arrives here is text a
// model produced from files, web pages and tool output nobody has read, so the HTML it is allowed to
// carry is decided here and nowhere else: raw HTML in the text is shown as text, a link keeps only an
// address that opens in the browser, and an image only one that cannot reach the disk.
//
// What getting it wrong looks like: a README Claude quotes holds `<img src=x onerror=...>`, and the
// script runs inside the window that owns every shell.

const LINK_PROTOCOLS = ['http:', 'https:', 'mailto:'];

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

// Only an absolute address with a protocol on the list. A relative one names a file in the project,
// and the window would read it as a path inside the app's own bundle.
export function safeLink(href: string): string | null {
  try {
    return LINK_PROTOCOLS.includes(new URL(href).protocol) ? href : null;
  } catch {
    return null;
  }
}

// An image from the web or one carried inline. `file:` is what is left out: an image tag pointed at
// the disk is a way to ask the window whether a file exists.
export function safeImage(href: string): string | null {
  if (/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(href)) return href;
  return href.startsWith('https://') && safeLink(href) ? href : null;
}

export function highlightCode(code: string, language: string | undefined): string {
  const known = language && hljs.getLanguage(language) ? language : null;
  // ponytail: no guessing at an unlabelled block — highlightAuto runs every grammar over it, which
  // costs more than a long answer is worth. Add it when unlabelled blocks turn out to be common.
  return known ? hljs.highlight(code, { language: known }).value : escapeHtml(code);
}

const marked = new Marked({
  gfm: true,
  renderer: {
    html: ({ text }: Tokens.HTML | Tokens.Tag) => escapeHtml(text),
    code: ({ text, lang }: Tokens.Code) => {
      const language = lang?.split(/\s/)[0];
      return `<pre class="chat-code"><code class="hljs">${highlightCode(text, language)}</code></pre>`;
    },
    link({ href, title, tokens }: Tokens.Link) {
      const inner = this.parser.parseInline(tokens);
      const safe = safeLink(href);
      if (!safe) return inner;
      return `<a href="${escapeHtml(safe)}"${title ? ` title="${escapeHtml(title)}"` : ''}>${inner}</a>`;
    },
    image({ href, text }: Tokens.Image) {
      const safe = safeImage(href);
      return safe ? `<img src="${escapeHtml(safe)}" alt="${escapeHtml(text)}">` : escapeHtml(text);
    },
  },
});

export function renderMarkdown(text: string): string {
  return marked.parse(text, { async: false });
}
