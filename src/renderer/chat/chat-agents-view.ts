import { agentConversation, agentRows, type FinishedTask } from '../../shared/chat/chat-agents';
import type { ChatTask, ChatTasks } from '../../shared/chat/chat-tasks';
import type { ChatEntry, Transcript } from '../../shared/chat/chat-transcript';
import { clampIndex } from '../../shared/app/clamp-index';
import { foldOf, redrawEntries, type DrawnEntry } from './chat-entries';
import { screenClick } from './chat-screen-click';
import type { ChatViewOptions } from './chat-view';
import { searchOverlay, viewerOverlay } from '../app/overlay';
import { isModified } from '../keys/shortcuts';

// The agents key's list of what ran this conversation, running first, then finished, and one agent's
// whole conversation over the screen, drawn like the main one and kept up while it runs. Up and Down
// walk its entries, Enter unfolds the one picked, and Escape goes back to the list, whose own Escape
// gives the keyboard back to the box. A click on a strip row opens its agent the same way; a workflow's
// opens its phases.
export type AgentsView = {
  show(): void;
  open(task: ChatTask): void;
  // The transcript changed: the open list or conversation follows it.
  update(): void;
};

type Say = Pick<ChatViewOptions, 'bridge' | 'onNotice' | 'goToPane'> & { openPdf(tile: HTMLElement): void; openWorkflow(task: ChatTask): void };

export function createAgentsView(transcript: () => Transcript, say: Say, back: () => void): AgentsView {
  let listChanged: (() => void) | null = null;
  let drawConversation: (() => void) | null = null;
  let listedTasks: ChatTasks | null = null;
  let listedFinished: FinishedTask[] | null = null;

  function show(): void {
    const { tasks, finished } = transcript();
    if (tasks.length === 0 && finished.length === 0) {
      say.onNotice('No agent, workflow or background command has run in this conversation since the screen opened.');
      return back();
    }
    void searchOverlay({
      name: 'chat-agents', placeholder: 'Search agents', rows: (query) => {
        const now = transcript();
        return agentRows(now.tasks, now.finished, query);
      },
      empty: 'No agent matches.', glyph: () => 'claude',
      watch: (changed) => {
        listChanged = changed;
        return () => { listChanged = null; };
      },
    }).then((task) => (task ? open(task) : back()));
  }

  function open(task: ChatTask | FinishedTask): void {
    // A workflow has no conversation; its phases open instead (chat-workflow-view.ts).
    if (task.workflow) return say.openWorkflow(task);
    const target = agentConversation(task, transcript().agents);
    if (target.kind === 'refused') {
      say.onNotice(target.reason);
      return back();
    }
    const { id } = target;
    const log = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'chat-agent-title';
    title.textContent = `${task.description || task.kind} · ${task.kind}`;
    log.append(title);
    let drawn: DrawnEntry[] = [];
    let drawnList: ChatEntry[] = [];
    let selected: number | null = null;

    function select(index: number): void {
      drawn[selected ?? -1]?.element.classList.remove('selected');
      selected = clampIndex(index, drawn.length - 1);
      drawn[selected]?.element.classList.add('selected');
      drawn[selected]?.element.scrollIntoView({ block: 'nearest' });
    }

    // Drawn as the main log is, filled at once: an agent's conversation is short beside the main one.
    function draw(): void {
      const list = transcript().agents[id] ?? [];
      if (list === drawnList) return;
      const box = log.parentElement;
      const stick = !box || box.scrollHeight - box.scrollTop - box.clientHeight < 40;
      drawnList = list;
      redrawEntries(drawn, list, selected, (element) => log.append(element), (fresh) => fresh.fill());
      if (stick && box) box.scrollTop = box.scrollHeight;
    }

    // A click selects its entry and does what it does in the main log. A pane link puts the
    // conversation away without going back to the list: the pane cannot be reached under a dialog.
    let leaving = false;
    log.addEventListener('click', (event) => {
      const clicked = event.target instanceof Element ? event.target : null;
      const index = drawn.findIndex((entry) => entry.element.contains(clicked));
      if (index !== -1) select(index);
      screenClick(event, {
        openPdf: say.openPdf,
        openExternal: (url) => say.bridge.openExternal(url),
        goToPane: (pane) => {
          leaving = true;
          close();
          say.goToPane(pane);
        },
      });
    });

    drawConversation = draw;
    const close = viewerOverlay('chat-agent', log, {
      closed: () => {
        drawConversation = null;
        drawn = [];
        if (!leaving) show();
      },
      enter: () => {
        const current = drawn[selected ?? -1];
        const fold = current ? foldOf(current.element) : null;
        if (fold) fold.open = !fold.open;
      },
      keys: (event) => {
        if (isModified(event) || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
        event.preventDefault();
        if (event.key === 'ArrowUp') select(selected === null ? drawn.length - 1 : selected - 1);
        else select(selected === null ? 0 : selected + 1);
      },
    });
    draw();
    if (log.parentElement) log.parentElement.scrollTop = log.parentElement.scrollHeight;
  }

  return {
    show,
    open,
    update() {
      drawConversation?.();
      const { tasks, finished } = transcript();
      if (listedTasks === tasks && listedFinished === finished) return;
      listedTasks = tasks;
      listedFinished = finished;
      listChanged?.();
    },
  };
}
