import type { PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import { toolBody } from './chat-entries';
import { permissionChoices, permissionTitle, questionAnswer, questionsOf, type PermissionAsk } from './chat-permission';
import { clampIndex } from './clamp-index';
import { isModified } from './shortcuts';

// The box over the prompt that holds what Claude is waiting on: a tool call to allow or decline, or
// AskUserQuestion's questions, one at a time. Rows the arrows walk and Enter answers; what each row
// answers with is chat-permission.ts's. Escape is not read here: it is the screen's interrupt, which
// declines whatever is asked as it stops the turn.

export type AskPanel = {
  element: HTMLElement;
  show(ask: PermissionAsk | null): void;
  focus(): void;
};

type Row = { element: HTMLElement; act(): void; input?: HTMLInputElement };

export function createAskPanel(onAnswer: (id: string, result: PermissionResult) => void): AskPanel {
  const element = document.createElement('div');
  element.className = 'chat-ask';
  element.tabIndex = -1;
  element.hidden = true;
  let rows: Row[] = [];
  let selected = 0;

  function select(index: number): void {
    selected = clampIndex(index, rows.length - 1);
    rows.forEach((row, at) => row.element.classList.toggle('selected', at === selected));
    const input = rows[selected]?.input;
    if (input) input.focus();
    else element.focus();
  }

  function row(label: string, detail: string, act: () => void): Row {
    const line = document.createElement('div');
    line.className = 'chat-ask-row';
    const name = document.createElement('b');
    name.textContent = label;
    line.append(name);
    if (detail) {
      const more = document.createElement('span');
      more.textContent = detail;
      line.append(more);
    }
    return { element: line, act };
  }

  function draw(title: string, detail: HTMLElement[], next: Row[], start: number): void {
    const heading = document.createElement('div');
    heading.className = 'chat-ask-title';
    heading.textContent = title;
    rows = next;
    rows.forEach((each, index) => each.element.addEventListener('click', () => {
      select(index);
      if (!each.input) each.act();
    }));
    element.replaceChildren(heading, ...detail, ...rows.map((each) => each.element));
    select(start);
  }

  function permission(ask: PermissionAsk): void {
    const { choices, start } = permissionChoices(ask);
    const about = ask.description ? [Object.assign(document.createElement('p'), { textContent: ask.description })] : [];
    draw(permissionTitle(ask), [...about, ...toolBody(ask.toolName, ask.input, null)],
      choices.map((choice) => row(choice.label, '', () => onAnswer(ask.id, choice.result))), start);
  }

  function questions(ask: PermissionAsk): void {
    const asked = questionsOf(ask.input);
    const picked: string[][] = asked.map(() => []);
    const advance = (at: number) => (at + 1 < asked.length ? question(at + 1) : onAnswer(ask.id, questionAnswer(ask.input, picked)));
    function question(at: number): void {
      const { question: text, header, multiSelect, options } = asked[at];
      const next: Row[] = options.map((option) => row(
        `${multiSelect ? (picked[at].includes(option.label) ? '[x] ' : '[ ] ') : ''}${option.label}`,
        option.description,
        () => {
          if (!multiSelect) {
            picked[at] = [option.label];
            return advance(at);
          }
          picked[at] = picked[at].includes(option.label) ? picked[at].filter((label) => label !== option.label) : [...picked[at], option.label];
          const keep = selected;
          question(at);
          select(keep);
        },
      ));
      const other = document.createElement('input');
      other.className = 'chat-ask-other';
      other.placeholder = 'Something else — type it and press Enter';
      other.dir = 'auto';
      const otherRow = row('Other', '', () => {
        if (!other.value.trim()) return;
        picked[at] = multiSelect ? [...picked[at], other.value.trim()] : [other.value.trim()];
        advance(at);
      });
      otherRow.element.append(other);
      next.push({ ...otherRow, input: other });
      if (multiSelect) next.push(row('Done', '', () => advance(at)));
      draw(`${header ? `${header} · ` : ''}${text}`, [], next, 0);
    }
    if (asked.length === 0) onAnswer(ask.id, questionAnswer(ask.input, []));
    else question(0);
  }

  element.addEventListener('keydown', (event) => {
    if (isModified(event)) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      select(selected + (event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      rows[selected]?.act();
    }
  });

  return {
    element,
    show(ask) {
      element.hidden = ask === null;
      if (ask === null) element.replaceChildren();
      else if (ask.toolName === 'AskUserQuestion') questions(ask);
      else permission(ask);
    },
    focus: () => select(selected),
  };
}
