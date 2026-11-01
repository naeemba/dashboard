import type { PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import { toolBody } from './chat-entries';
import { declined, permissionChoices, permissionTitle, questionAnswer, questionsOf } from './chat-permission';
import { DECLINED, ELICITATION, fieldAbout, fieldChoices, fieldsOf, takes, typedValue, type PermissionAsk } from '../../shared/chat/chat-elicitation';
import { isOpenableLink } from '../../shared/panes/links';
import { clampIndex } from '../../shared/app/clamp-index';
import { isModified } from '../keys/shortcuts';

// The box over the prompt that holds what Claude is waiting on: a tool call to allow or decline, or
// AskUserQuestion's questions, or an MCP server's form, one at a time. Rows the arrows walk and Enter answers; what each row
// answers with is chat-permission.ts's. Escape is not read here: it is the screen's interrupt, which
// gives up on whatever is asked as it stops the turn.

export type AskPanel = {
  element: HTMLElement;
  show(ask: PermissionAsk | null): void;
  focus(): void;
};

type Row = { element: HTMLElement; act(): void; input?: HTMLInputElement };

const paragraph = (text: string) => Object.assign(document.createElement('p'), { textContent: text });

export function createAskPanel(onAnswer: (id: string, result: PermissionResult) => void, openLink: (url: string) => void): AskPanel {
  const element = document.createElement('div');
  element.className = 'chat-ask';
  element.tabIndex = -1;
  element.hidden = true;
  let rows: Row[] = [];
  let selected = 0;

  function select(index: number): void {
    selected = clampIndex(index, rows.length - 1);
    rows.forEach((row, at) => row.element.classList.toggle('selected', at === selected));
    rows[selected]?.element.scrollIntoView({ block: 'nearest' });
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

  // A row with a box to type into, which the arrows land on and Enter answers from.
  function typedRow(label: string, placeholder: string, act: (typed: string) => void, initial = ''): Row {
    const input = document.createElement('input');
    input.className = 'chat-ask-other';
    input.placeholder = placeholder;
    input.value = initial;
    input.dir = 'auto';
    const made = row(label, '', () => act(input.value.trim()));
    made.element.append(input);
    return { ...made, input };
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
    const about = ask.description ? [paragraph(ask.description)] : [];
    draw(permissionTitle(ask), [...about, ...toolBody(ask.toolName, ask.input, null)], choices.map((choice) => {
      if ('result' in choice) return row(choice.label, '', () => onAnswer(ask.id, choice.result));
      return typedRow(choice.label, 'Type it and press Enter', (typed) => onAnswer(ask.id, declined(typed)));
    }), start);
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
      next.push(typedRow('Other', 'Something else — type it and press Enter', (typed) => {
        if (!typed) return;
        picked[at] = multiSelect ? [...picked[at], typed] : [typed];
        advance(at);
      }));
      if (multiSelect) next.push(row('Done', '', () => advance(at)));
      draw(`${header ? `${header} · ` : ''}${text}`, [], next, 0);
    }
    if (asked.length === 0) onAnswer(ask.id, questionAnswer(ask.input, []));
    else question(0);
  }

  // A link is opened here and accepted; a form is asked a field at a time, with the rows
  // chat-elicitation.ts says, and accepted after the last. Decline is the last row of every step,
  // made fresh each time, since `draw` adds a click listener to every row it is handed.
  function elicitation(ask: PermissionAsk): void {
    const title = ask.title ?? '';
    const about = ask.description ? [paragraph(ask.description)] : [];
    const decline = () => row('Decline', '', () => onAnswer(ask.id, DECLINED));
    const accept = (updatedInput: Record<string, unknown>) => onAnswer(ask.id, { behavior: 'allow', updatedInput });
    if (ask.input.mode === 'url') {
      const url = String(ask.input.url ?? '');
      if (!isOpenableLink(url)) {
        draw(title, [...about, paragraph(url), paragraph('This link cannot be opened from here.')], [decline()], 0);
        return;
      }
      draw(title, [...about, paragraph(url)], [row('Open the link', '', () => {
        openLink(url);
        accept({});
      }), decline()], 0);
      return;
    }
    const fields = fieldsOf(ask.input.requestedSchema);
    const content: Record<string, unknown> = {};
    const advance = (at: number) => (at + 1 < fields.length ? field(at + 1) : accept(content));
    function field(at: number, refused: string | null = null): void {
      const asked = fields[at];
      const store = (value: unknown) => {
        content[asked.key] = value;
        advance(at);
      };
      const { choices, start } = fieldChoices(asked);
      const next = choices.map((choice): Row => {
        if ('decline' in choice) return decline();
        if ('skip' in choice) return row(choice.label, '', () => advance(at));
        if ('value' in choice) return row(choice.label, '', () => store(choice.value));
        return typedRow(choice.label, choice.typed, (typed) => {
          const value = typedValue(asked, typed);
          if (value === 'skip') advance(at);
          else if (value === 'again') field(at, typed);
          else store(value.value);
        }, refused ?? asked.initial);
      });
      const notice = refused === null ? [] : [paragraph(`${refused ? `"${refused}" is not an answer here` : 'This one needs an answer'}. ${takes(asked)}.`)];
      draw(title, [...about, paragraph(fieldAbout(asked)), ...notice], next, start);
    }
    if (fields.length === 0) draw(title, about, [row('Accept', '', () => accept({})), decline()], 0);
    else field(0);
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
      else if (ask.toolName === ELICITATION) elicitation(ask);
      else permission(ask);
    },
    focus: () => select(selected),
  };
}
