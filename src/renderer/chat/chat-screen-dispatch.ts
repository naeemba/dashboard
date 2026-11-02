import type { DashboardBridge, ChatPreferences } from '../../shared/app/bridge';
import { askAside } from './chat-btw-view';
import { EFFORT_LEVELS, effortRows, namedEffort, namedFast, pickedModel, planSends, type ChosenEffort, type ScreenCommand } from '../../shared/chat/chat-commands';
import { exportConversation } from './chat-export-view';
import { manageMcp } from './chat-mcp-view';
import { rewind } from './chat-rewind-view';
import { branch, chooseModel, copyReply, renameConversation, resume, showEdits } from './chat-screen-commands';
import { working, type Transcript } from '../../shared/chat/chat-transcript';
import type { ChatViewOptions } from './chat-view';
import { searchOverlay } from '../app/overlay';

// Where `send` in chat-view.ts hands a command typed into the box that is one of the screen's own
// (screenCommand): each runs here, against what the view tells it of itself, instead of going to the
// session.

export type CommandScreen = {
  bridge: DashboardBridge;
  slot: number;
  options: ChatViewOptions;
  prompt: HTMLTextAreaElement;
  transcript(): Transcript;
  askCount(): number;
  model(): string | null;
  effort(): ChosenEffort;
  fast(): boolean;
  imageCount(): number;
  configure(change: ChatPreferences): void;
  focus(): void;
  showContext(): void;
};

// The text `send` goes on to send to the session: what follows /plan, when there is something to send.
// Null when the command was all of it.
export function runScreenCommand(command: ScreenCommand, screen: CommandScreen): string | null {
  const { bridge, slot, options, focus } = screen;
  switch (command.kind) {
    case 'resume': showResume(screen); break;
    case 'context': screen.showContext(); break;
    case 'diff': showEdits(screen.transcript().entries, options); break;
    case 'rewind': showRewind(screen); break;
    case 'mcp': void manageMcp(bridge, slot, options).then(focus); break;
    case 'model': showModels(screen, command.rest); break;
    case 'branch': showBranch(screen, command.rest); break;
    case 'effort': showEfforts(screen, command.rest); break;
    case 'copy': void copyReply(screen.transcript().entries, command.rest, options); break;
    case 'fast': {
      const named = namedFast(command.rest, screen.fast());
      if (named === undefined) options.onNotice(`Fast mode has no ${command.rest}. Try on or off.`);
      else screen.configure({ fast: named });
      break;
    }
    case 'export': void exportConversation(bridge, slot, options, screen.transcript().entries, command.rest).then(focus); break;
    case 'rename': renameConversation(bridge, slot, command.rest, options); break;
    case 'btw': showAside(screen, command.rest); break;
    case 'plan':
      screen.configure({ permissionMode: 'plan' });
      return planSends(command.rest, screen.imageCount()) ? command.rest : null;
  }
  return null;
}

// The screen's own commands, refused under a running turn but /model: a conversation changed then
// would end wherever the turn had got to. A conversation put back by /rewind holds its prompt in the
// box again, ready to edit and send, unless something was typed there meanwhile.
function refusedWhileWorking(screen: CommandScreen, then: string): boolean {
  const busy = working(screen.transcript(), screen.askCount());
  if (busy) screen.options.onNotice(`Claude is still working. Escape stops it; then ${then}.`);
  return busy;
}

function showResume(screen: CommandScreen): void {
  if (!refusedWhileWorking(screen, 'pick the conversation')) void resume(screen.bridge, screen.slot, screen.options).then(screen.focus);
}

function showBranch(screen: CommandScreen, title: string): void {
  if (!refusedWhileWorking(screen, 'branch')) void branch(screen.bridge, screen.slot, title, screen.options).then(screen.focus);
}

function showRewind(screen: CommandScreen): void {
  if (refusedWhileWorking(screen, 'rewind')) return;
  void rewind(screen.bridge, screen.slot, screen.options).then((text) => {
    if (text !== undefined && !screen.prompt.value.trim()) screen.prompt.value = text;
    screen.focus();
  });
}

// Asked beside a running turn too: the answer comes from the conversation so far and stays out of it.
function showAside(screen: CommandScreen, question: string): void {
  if (!question) return screen.options.onNotice('/btw needs a question after it.');
  void askAside(screen.bridge, screen.slot, question, screen.options).then(screen.focus);
}

function showModels(screen: CommandScreen, name: string): void {
  void chooseModel(screen.bridge, screen.slot, name, screen.model() ?? screen.transcript().model, screen.options).then((picked) => {
    if (picked !== undefined) screen.configure({ model: pickedModel(picked) });
    screen.focus();
  });
}

// The effort levels in a search sheet, as Claude Code's /effort offers them, or straight to the one
// named after the command; the next turn runs at it, on every screen.
function showEfforts(screen: CommandScreen, name: string): void {
  if (name) {
    const named = namedEffort(name);
    if (named === undefined) screen.options.onNotice(`Claude has no effort ${name}. Try auto, ${EFFORT_LEVELS.join(', ')}.`);
    else screen.configure({ effort: named });
    return;
  }
  void searchOverlay({
    name: 'chat-effort', placeholder: 'Search effort levels', rows: (query) => effortRows(screen.effort(), query),
    empty: 'No level matches.', glyph: () => 'claude',
  }).then((picked) => {
    if (picked !== undefined) screen.configure({ effort: picked });
    screen.focus();
  });
}
