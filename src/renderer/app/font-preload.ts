import type { Settings } from '../../shared/settings/settings';

// Both weights of the terminal font, loaded before the first pane opens: xterm measures its cells then,
// and a weight that arrives later misaligns the glyphs. A font name the browser cannot parse — anything
// typed into the settings screen, which does not check — rejects instead of resolving; xterm falls back
// to Menlo on its own, so losing the preload costs only that fallback, not the whole session.
export async function preloadFont(font: Settings['font']): Promise<void> {
  try {
    await Promise.all([
      document.fonts.load(`${font.size}px "${font.name}"`),
      document.fonts.load(`bold ${font.size}px "${font.name}"`),
    ]);
  } catch {
    // Fallen through to whatever xterm renders instead.
  }
}
