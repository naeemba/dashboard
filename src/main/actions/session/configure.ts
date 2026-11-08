import type { Query } from '@anthropic-ai/claude-agent-sdk';
import { isRecord } from '../../../shared/app/is-record';
import type { ChatPreferences } from '../../../shared/app/bridge';
import { flagSettingsOf } from '../../chat/chat-sessions';
import { action } from '../action';
import { isSlot } from '../pane/pane-input';

// A model, permission mode, effort or fast mode picked on the Claude screen. The choice is kept for the
// page, so a session started later starts on it, and the running session, if there is one, is moved
// onto it now. A session that is not running is not started for it.

export type SessionConfigurePorts = {
  // The choice kept for the page, and every screen showing it told.
  choose(slot: number, change: ChatPreferences): void;
  // The page's session, if one is running or starting.
  session(slot: number): Promise<Pick<Query, 'setModel' | 'setPermissionMode' | 'applyFlagSettings'>> | undefined;
};

export const sessionConfigure = action<SessionConfigurePorts, { slot: number; change: ChatPreferences }, { output: string }>('session.configure', {
  words: [],
  input: ({ slot, change }) => (
    isSlot(slot) && isRecord(change) ? { slot, change: change as ChatPreferences } : { refused: 'the choice was not one the app could read' }
  ),
  async run(ports, { slot, change }) {
    ports.choose(slot, change);
    const session = await ports.session(slot);
    if (!session) return { output: 'kept for the next start' };
    if ('model' in change) await session.setModel(change.model ?? undefined);
    if (change.permissionMode) await session.setPermissionMode(change.permissionMode);
    // The session's flag layer, as /effort and /fast set it.
    const flags = flagSettingsOf(change);
    if (Object.keys(flags).length > 0) await session.applyFlagSettings(flags);
    return { output: 'the session is on it' };
  },
});
