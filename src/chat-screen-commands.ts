import type { DashboardBridge } from './bridge';
import { copyTarget, modelRows, namedModel, resumeRows } from './chat-commands';
import { editsHeading, sessionEdits } from './chat-diff';
import { diffBlock } from './chat-entries';
import type { ChatEntry } from './chat-transcript';
import type { ChatViewOptions } from './chat-view';
import { failureText } from './failure';
import { searchOverlay, viewerOverlay } from './overlay';

// The Claude screen's own commands that are a sheet or a call to main and nothing of the view's own,
// the way /rewind is in chat-rewind-view.ts. Each one says what went wrong itself and resolves once it
// is done, for the view to put the keyboard back.

export type Say = Pick<ChatViewOptions, 'onError' | 'onNotice'>;

// /resume: the project's earlier conversations in a search sheet; the one picked is read back on every
// screen and carried on by the next prompt.
export async function resume(bridge: DashboardBridge, slot: number, say: Say): Promise<void> {
  try {
    const found = await bridge.chatSessions(slot);
    if (found.sessions.length === 0) return say.onNotice('This project has no earlier conversations.');
    const picked = await searchOverlay({
      name: 'chat-resume', placeholder: 'Search conversations', rows: (query) => resumeRows(found, query),
      empty: 'No conversation matches.', glyph: () => 'claude',
    });
    if (picked !== undefined && picked !== found.current) bridge.chatResume(slot, picked);
  } catch (error) {
    say.onError(`Earlier conversations not listed: ${failureText(error)}`);
  }
}

// /branch: the page carries on in a copy of the conversation, read back on every screen; the original
// stays in /resume.
export async function branch(bridge: DashboardBridge, slot: number, title: string, say: Say): Promise<void> {
  try {
    if (!(await bridge.chatBranch(slot, title))) say.onNotice('Nothing to branch yet: send a prompt first.');
  } catch (error) {
    say.onError(`Conversation not branched: ${failureText(error)}`);
  }
}

// /model: the session's models in a search sheet, as Claude Code's /model lists them with the current
// one marked, or straight to the one named after the command. Resolves with the model chosen, for the
// view to switch to, and undefined when none was.
export async function chooseModel(bridge: DashboardBridge, slot: number, name: string, current: string | null, say: Say): Promise<string | undefined> {
  try {
    const models = await bridge.chatModels(slot);
    if (!name) {
      return await searchOverlay({
        name: 'chat-model', placeholder: 'Search models', rows: (query) => modelRows(models, current, query),
        empty: 'No model matches.', glyph: () => 'claude',
      });
    }
    const named = namedModel(models, name);
    if (!named) say.onNotice(`Claude has no model named ${name}. /model lists the ones it has.`);
    return named ?? undefined;
  } catch (error) {
    say.onError(`Models not listed: ${failureText(error)}`);
    return undefined;
  }
}

// /copy [N]: Claude's reply that many back, 1 the last, on the clipboard as the markdown it wrote.
export async function copyReply(entries: ChatEntry[], rest: string, say: Say): Promise<void> {
  const target = copyTarget(entries, rest);
  if ('refused' in target) return say.onNotice(target.refused);
  try {
    await navigator.clipboard.writeText(target.text);
    say.onNotice(target.notice);
  } catch (error) {
    say.onError(`Reply not copied: ${failureText(error)}`);
  }
}

// /diff: every file Claude changed in the conversation, each under a line naming it, on a sheet to read.
export function showEdits(entries: ChatEntry[], say: Say): void {
  const files = sessionEdits(entries);
  if (files.length === 0) return say.onNotice('Claude has not changed a file in this conversation.');
  const review = document.createElement('div');
  review.append(...files.flatMap((file) => {
    const heading = document.createElement('div');
    heading.className = 'chat-diff-file';
    heading.textContent = editsHeading(file);
    return [heading, diffBlock(file.lines)];
  }));
  viewerOverlay('diff-viewer', review);
}
