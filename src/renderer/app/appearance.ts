import { isSeeThrough, type Settings } from '../../shared/settings/settings';

// Every colour as a CSS custom property, which index.css styles the chrome from, and the window's
// opacity beside them. See-through, the root alone paints the background at that opacity and every
// layer that repaints the same colour paints nothing, so the desktop shows through once, not through
// a stack of layers each thickening it (`see-through` in index.css).
export function publishAppearance(settings: Settings): void {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(settings.theme)) root.style.setProperty(`--${name}`, value);
  root.style.setProperty('--window-opacity', String(settings.opacity));
  root.classList.toggle('see-through', isSeeThrough(settings));
}
