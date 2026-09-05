// A page shows one of these at a time. Terminals is what a project opens as.
export type Mode = 'terminals' | 'nvim' | 'board';

// Ctrl+T, Ctrl+N, Ctrl+B. Lowercase keys: an uppercase letter here is Caps Lock, which does not
// set shiftKey, so the lookup normalises rather than listing both spellings.
export const MODE_KEYS: Record<string, Mode> = { t: 'terminals', n: 'nvim', b: 'board' };
