import { taskDetail, usageParts, type ChatTask } from '../../shared/chat/chat-tasks';
import { agentCount, heldWorkflowRow, panelUpdate, phaseMark, workflowRows, type PhaseMark, type WorkflowAgentState } from '../../shared/chat/chat-workflow';
import { clampIndex } from '../../shared/app/clamp-index';
import type { Transcript } from '../../shared/chat/chat-transcript';
import { piece } from './chat-foot-view';
import { viewerOverlay } from '../app/overlay';
import { isModified } from '../keys/shortcuts';

// One running workflow over the screen, kept up while it runs: its phases with how far each got,
// and the agents of the phase picked, each with its model, tokens and time. Up and Down walk the
// phases and, while it runs, a last row that stops it on Enter; a click on a row picks it and does
// what Enter does there. Escape goes back where it was opened from: the agents key's list when it
// was opened from there or from the workflow's strip row, the box from the workflow key.
export type WorkflowView = {
  open(task: ChatTask, closed?: () => void): void;
  // The transcript changed: the open panel follows it.
  update(): void;
};

const PHASE_GLYPH: Record<PhaseMark, string> = { done: '✓', running: '●', waiting: '○' };
const AGENT_GLYPH: Record<WorkflowAgentState, string> = { done: '✓', failed: '✗', running: '●', queued: '○' };

export function createWorkflowView(transcript: () => Transcript, stop: (task: ChatTask) => void, back: () => void): WorkflowView {
  let redraw: (() => void) | null = null;

  function open(opened: ChatTask, closed = back): void {
    const sheet = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'chat-agent-title';
    const phases = document.createElement('div');
    const agents = document.createElement('div');
    agents.className = 'chat-workflow-agents';
    sheet.append(title, phases, agents);
    // The workflow as last streamed; it stays drawn once it has left the strip, without the stop row.
    let task = opened;
    let live = transcript().tasks.some((each) => each.id === opened.id);
    let selected = 0;

    const rowKeys = () => workflowRows(task.workflow, live);

    function draw(): void {
      const list = task.workflow?.phases ?? [];
      title.textContent = [task.description || task.kind, taskDetail(task), ...(live ? [] : ['ended'])].join(' · ');
      phases.replaceChildren(...list.map((phase, index) => {
        const { done, total } = agentCount([phase]);
        return row('chat-workflow-phase', `${PHASE_GLYPH[phaseMark(phase)]} ${phase.title}${total > 0 ? ` ${done}/${total}` : ''}`, index);
      }));
      if (list.length === 0) phases.append(row('chat-workflow-agent', 'No phase has started yet.'));
      if (live) phases.append(row('chat-workflow-phase', 'Stop the workflow', list.length));
      agents.replaceChildren(...(list[selected]?.agents ?? []).map((agent) => row('chat-workflow-agent',
        [`${AGENT_GLYPH[agent.state]} ${agent.label}`, agent.model, ...usageParts(agent)].filter(Boolean).join(' · '))));
    }

    function row(className: string, text: string, index?: number): HTMLElement {
      const element = piece(className, text);
      if (index === undefined) return element;
      element.dataset.row = String(index);
      element.classList.toggle('selected', index === selected);
      return element;
    }

    function select(index: number): void {
      selected = clampIndex(index, rowKeys().length - 1);
      draw();
      phases.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
    }

    function enter(): void {
      if (rowKeys()[selected] === 'stop') stop(task);
    }

    phases.addEventListener('click', (event) => {
      const clicked = (event.target as Element).closest<HTMLElement>('[data-row]');
      if (!clicked) return;
      select(Number(clicked.dataset.row));
      enter();
    });

    redraw = () => {
      const next = panelUpdate({ task, live }, transcript().tasks.find((each) => each.id === task.id));
      if (!next) return;
      const before = rowKeys();
      ({ task, live } = next);
      selected = heldWorkflowRow(before, rowKeys(), selected);
      draw();
    };
    viewerOverlay('chat-agent', sheet, {
      closed: () => {
        redraw = null;
        closed();
      },
      enter,
      keys: (event) => {
        if (isModified(event) || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
        event.preventDefault();
        select(selected + (event.key === 'ArrowUp' ? -1 : 1));
      },
    });
    draw();
  }

  return { open, update: () => redraw?.() };
}
