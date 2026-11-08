import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk';
import { markedRows, type SearchRow } from '../app/fuzzy';

// The model, the mode and the effort on the Claude screen's foot, each a sheet a click on it opens
// (chat-screen-dispatch.ts), and the lists the keys walk.

// What the model key walks and the model sheet lists. Null is whatever the session's own settings choose.
export const MODELS: (string | null)[] = [null, 'opus', 'sonnet', 'haiku'];
// What the edits key walks and the mode sheet lists, in the Claude Code terminal's order. Auto is on it
// because main starts in it, and a walk that could not come back would leave main asking before every
// edit and dispatch. A mode that is not here, skipping permissions, is shown, and the key walks on from
// the top.
export const MODES: PermissionMode[] = ['default', 'acceptEdits', 'plan', 'auto'];
export const MODE_LABELS: Record<PermissionMode, string> = {
  default: 'asking before edits', acceptEdits: 'accepting edits', plan: 'planning',
  auto: 'auto mode', bypassPermissions: 'skipping permissions', dontAsk: 'refusing what is not allowed',
};

// The foot's pieces a click opens a sheet from (chat-foot-view.ts draws them with these classes), and
// which sheet each opens.
export const FOOT_MODEL = 'chat-foot-model';
export const FOOT_MODE = 'chat-foot-mode';
export const FOOT_EFFORT = 'chat-foot-effort';
const FOOT_SETTINGS = { [FOOT_MODEL]: 'model', [FOOT_MODE]: 'mode', [FOOT_EFFORT]: 'effort' } as const;
export type FootSetting = typeof FOOT_SETTINGS[keyof typeof FOOT_SETTINGS];

export function footSetting(classNames: Iterable<string>): FootSetting | null {
  for (const name of classNames) if (name in FOOT_SETTINGS) return FOOT_SETTINGS[name as keyof typeof FOOT_SETTINGS];
  return null;
}

export function footModelRows(current: string | null, query: string): SearchRow<string | null>[] {
  return markedRows(MODELS, current, (model) => model ?? 'default', query);
}

export function footModeRows(current: PermissionMode, query: string): SearchRow<PermissionMode>[] {
  return markedRows(MODES, current, (mode) => MODE_LABELS[mode], query);
}
