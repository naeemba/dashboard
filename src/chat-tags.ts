// The tags a saved session writes around what Claude Code put in a message — a typed command, a `!`
// command's output, a task notification — read back as text.

// What a saved session wrote between `<tag>` and `</tag>`, or undefined when the tag is not there. An
// opening tag may carry attributes, as `<agent-message from="...">` does.
export function tagged(text: string, tag: string): string | undefined {
  return new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(text)?.[1];
}

const ENTITIES: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#39;': "'" };

// Text a saved session wrote inside a tag, where &, <, >, " and ' are escaped, as it was before.
export function unescaped(text: string): string {
  return text.replace(/&(?:lt|gt|amp|quot|#39);/g, (entity) => ENTITIES[entity]);
}
