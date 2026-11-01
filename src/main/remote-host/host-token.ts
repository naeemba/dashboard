import { randomBytes } from 'node:crypto';
import type { Settings } from '../../shared/settings/settings';

// The token a screen must show to join. Made the first time the host settings are read with none, and
// kept from then on, so the one pasted into the mac stays good. `random` is handed in so the rule is
// tested without crypto.
export function ensureHostToken(settings: Settings, random: () => string): { settings: Settings; generated: boolean } {
  if (settings.host.token !== '') return { settings, generated: false };
  return { settings: { ...settings, host: { ...settings.host, token: random() } }, generated: true };
}

// Main's one line: make the token if there is none and hand `write` the settings that hold it.
export function keepHostToken(settings: Settings, write: (settings: Settings) => void): Settings {
  const { settings: kept, generated } = ensureHostToken(settings, () => randomBytes(32).toString('base64url'));
  if (generated) write(kept);
  return kept;
}
