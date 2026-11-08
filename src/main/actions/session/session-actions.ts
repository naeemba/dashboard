import type { RewindFilesResult } from '@anthropic-ai/claude-agent-sdk';
import type { ChatPreferences, Refused } from '../../../shared/app/bridge';
import type { RewindChoice, RewindPoint } from '../../../shared/chat/chat-rewind';
import type { DrawerReply } from '../../../shared/drawer/drawer';
import type { Channels } from '../../app/channels';
import type { SessionIndexStore } from '../../workers/session-index-store';
import { bind, isRefused } from '../action';
import { sessionBranch, type SessionBranchPorts } from './branch';
import { sessionConfigure, type SessionConfigurePorts } from './configure';
import { sessionRename, type SessionRenamePorts } from './rename';
import { sessionReset } from './reset';
import { sessionResume, type SessionResumePorts } from './resume';
import { sessionRewind, type SessionRewindPorts } from './rewind';
import { sessionStart, type SessionStartPorts } from './start';

// Main's wiring for the session actions, and the screen's doors to them, out of main.ts, which is over
// its 600-line ceiling. Every decision is in the actions' own files; what each asks of the page's
// session is chat-sessions.ts's `actionPorts`.

export type ChatActionPorts = SessionResumePorts & SessionBranchPorts & SessionRewindPorts & SessionConfigurePorts
  & Pick<SessionRenamePorts, 'onScreen'> & Pick<SessionStartPorts, 'start'>;

export type SessionActionsMain = {
  chat: ChatActionPorts;
  sessions: Pick<SessionIndexStore, 'row' | 'rename'>;
} & Omit<SessionStartPorts, 'start'>;

export function sessionActions({ chat, sessions, ...main }: SessionActionsMain) {
  const start = bind(sessionStart, { ...main, start: chat.start });
  return {
    start,
    reset: bind(sessionReset, chat),
    resume: bind(sessionResume, chat),
    branch: bind(sessionBranch, chat),
    rewind: bind(sessionRewind, chat),
    configure: bind(sessionConfigure, chat),
    rename: bind(sessionRename, {
      onScreen: chat.onScreen,
      projectPath: chat.projectPath,
      directoryOf: (sessionId) => sessions.row(sessionId)?.directory,
      relabel: sessions.rename,
      async retitle(sessionId, title, folder) {
        const { renameSession } = await import('@anthropic-ai/claude-agent-sdk');
        await renameSession(sessionId, title, { dir: folder });
      },
    }),
    // project.open's `startMain`: the command's open answers once main can be reached.
    async startedMain(slot: number): Promise<string> {
      const started = await start.call({ slot, from: 'command' });
      if (isRefused(started)) throw new Error(started.refused);
      // Only a restart's start leaves the name null.
      return started.name ?? '';
    },
  };
}

export type SessionActions = ReturnType<typeof sessionActions>;

const refusedOrNull = (result: object): Refused | null => (isRefused(result) ? result : null);

// The Claude screen's and the drawer's doors, on the channels the bridge already names. Each answers
// the refusal as a value, as before: /rename its sentence, /rewind null, since its list of prompts has
// refused already.
export function registerSessionChannels(table: Channels, actions: SessionActions): void {
  table.handle('chat:reset', async (_screen, slot: number) => refusedOrNull(await actions.reset.call({ slot })));
  table.handle('chat:resume', async (_screen, slot: number, sessionId: string) => refusedOrNull(await actions.resume.call({ slot, sessionId })));
  table.handle('chat:branch', async (_screen, slot: number, title: string) => refusedOrNull(await actions.branch.call({ slot, title })));
  table.handle('chat:rewind', async (_screen, slot: number, point: RewindPoint, choice: RewindChoice): Promise<RewindFilesResult | null> => {
    const rewound = await actions.rewind.call({ slot, point, choice });
    return isRefused(rewound) ? null : rewound.restored;
  });
  table.handle('chat:configure', async (_screen, slot: number, change: ChatPreferences): Promise<void> => {
    await actions.configure.call({ slot, change });
  });
  table.handle('chat:rename', async (_screen, slot: number, title: string): Promise<string | null> => (
    refusedOrNull(await actions.rename.call({ slot, title }))?.refused ?? null
  ));
  // The drawer's F2. Its project is not needed: a conversation's id finds its row in any project.
  table.handle('sessions:rename', async (_screen, _projectPath: string, id: string, label: string): Promise<DrawerReply> => (
    refusedOrNull(await actions.rename.call({ id, label }))
  ));
}
