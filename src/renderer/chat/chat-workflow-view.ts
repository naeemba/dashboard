import { stopTarget, taskDetail, usageParts, type ChatTask } from '../../shared/chat/chat-tasks';
import { agentCount, phaseMark, type PhaseMark, type WorkflowAgentState } from '../../shared/chat/chat-workflow';
import { clampIndex } from '../../shared/app/clamp-index';
import { failureText } from '../../shared/errors/failure';
import type { Transcript } from '../../shared/chat/chat-transcript';
import { piece } from './chat-foot-view';
import type { ChatViewOptions } from './chat-view';
import { viewerOverlay } from '../app/overlay';
import { isModified } from '../keys/shortcuts';

// One running workflow over the screen, kept up while it runs: its phases with how far each got,
// and the agents of the phase picked, each with its model, tokens and time. Up and Down walk the
// phases and, while it runs, a last row that stops it on Enter; a click on a row picks it and does
// what Enter does there. Escape gives the keyboard back to the box. The workflow key opens it, as a
// click on the workflow's strip row does.
export type WorkflowView = {
  open(task: ChatTask): void;
  // The transcript changed: the open panel follows it.
  update(): void;
};

type Say = Pick<ChatViewOptions, 'bridge' | 'onNotice' | 'onError'>;

const PHASE_GLYPH: Record<PhaseMark, string> = { done: '✓', running: '●', waiting: '○' };
const AGENT_GLYPH: Record<WorkflowAgentState, string> = { done: '✓', failed: '✗', running: '●', queued: '○' };

export function createWorkflowView(transcript: () => Transcript, slot: number, say: Say, back: () => void): WorkflowView {
  let redraw: (() => void) | null = null;

  function open(opened: ChatTask): void {
    const sheet = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'chat-agent-title';
    const phases = document.createElement('div');
    const agents = document.createElement('div');
    agents.className = 'chat-workflow-agents';
    sheet.append(title, phases, agents);
    // The workflow as last streamed; it stays drawn once it has left the strip, without the stop row.
    let task = opened;
    let live = true;
    let selected = 0;

    const rowCount = (): number => (task.workflow?.phases.length ?? 0) + (live ? 1 : 0);

    function draw(): void {
      const list = task.workflow?.phases ?? [];
      selected = clampIndex(selected, rowCount() - 1);
      title.textContent = [task.description || task.kind, taskDetail(task), ...(live ? [] : ['ended'])].join(' · ');
      const rows = list.map((phase) => {
        const { done, total } = agentCount([phase]);
        return `${PHASE_GLYPH[phaseMark(phase)]} ${phase.title}${total > 0 ? ` ${done}/${total}` : ''}`;
      });
      phases.replaceChildren(...rows.map((text, index) => row('chat-workflow-phase', text, index)));
      if (list.length === 0) phases.append(row('chat-workflow-agent', 'No phase has started yet.'));
      if (live) phases.append(row('chat-workflow-phase chat-workflow-stop', 'Stop the workflow', list.length));
      agents.replaceChildren(...(list[selected]?.agents ?? []).map((agent) => row('chat-workflow-agent',
        [`${AGENT_GLYPH[agent.state]} ${agent.label}`, agent.model, ...usageParts(agent)].filter(Boolean).join(' · '))));
      phases.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
    }

    function row(className: string, text: string, index?: number): HTMLElement {
      const element = piece(className, text);
      if (index === undefined) return element;
      element.dataset.row = String(index);
      element.classList.toggle('selected', index === selected);
      return element;
    }

    function enter(): void {
      if (!live || selected !== rowCount() - 1) return;
      const target = stopTarget(task);
      if (target.kind === 'refused') return say.onNotice(target.reason);
      say.bridge.chatStopTask(slot, target.taskId).catch((error: unknown) => say.onError(`Workflow not stopped: ${failureText(error)}`));
    }

    phases.addEventListener('click', (event) => {
      const clicked = (event.target as Element).closest<HTMLElement>('[data-row]');
      if (!clicked) return;
      selected = Number(clicked.dataset.row);
      draw();
      enter();
    });

    redraw = () => {
      const now = transcript().tasks.find((each) => each.id === task.id);
      if (now === task || (!now && !live)) return;
      if (now) task = now;
      else live = false;
      draw();
    };
    viewerOverlay('chat-agent', sheet, {
      closed: () => {
        redraw = null;
        back();
      },
      enter,
      keys: (event) => {
        if (isModified(event) || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
        event.preventDefault();
        selected = clampIndex(selected + (event.key === 'ArrowUp' ? -1 : 1), rowCount() - 1);
        draw();
      },
    });
    draw();
  }

  return { open, update: () => redraw?.() };
}
