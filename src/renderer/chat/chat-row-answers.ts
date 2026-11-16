import type { PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import { permissionChoices, permissionTitle, questionAnswer, questionsOf, type Question } from './chat-permission';
import { ELICITATION, type PermissionAsk } from '../../shared/chat/chat-elicitation';

// What a Claude screen's question looks like from somewhere else — the manager's row for a worker
// drawn as a screen — and which of its answers a digit there picks. A screen has no terminal to type a
// key into: its question is an ask box, and the pane's shell under it is not what is asking.

// `answer` is built only for the digit pressed: the row redraws on every tick while it waits.
type RowChoice = { label: string; answer(): PermissionResult };

// AskUserQuestion's one question, or undefined when it asks several or is another tool.
function loneQuestion(ask: PermissionAsk): Question | undefined {
  const asked = ask.toolName === 'AskUserQuestion' ? questionsOf(ask.input) : [];
  return asked.length === 1 ? asked[0] : undefined;
}

// The answers a single key can give, numbered from 1 in the order the ask box lists them: a tool
// call's rows that need nothing typed, or the options of a lone single-pick question. A form, several
// questions, a multi-pick or a reason to type are answered on the screen itself, so they offer none.
function rowChoices(ask: PermissionAsk): RowChoice[] {
  if (ask.toolName === ELICITATION) return [];
  if (ask.toolName === 'AskUserQuestion') {
    const asked = loneQuestion(ask);
    if (!asked || asked.multiSelect) return [];
    return asked.options.map(({ label }) => ({ label, answer: () => questionAnswer(ask.input, [[label]]) }));
  }
  return permissionChoices(ask).choices.flatMap((choice) => ('result' in choice ? [{ label: choice.label, answer: () => choice.result }] : []));
}

// The sentence a question is known by: a lone question's own text, else the ask box's title.
export function rowTitle(ask: PermissionAsk): string {
  return loneQuestion(ask)?.question ?? permissionTitle(ask);
}

// What the row prints under the pane: the question, then each answer with the digit that gives it.
export function rowLines(ask: PermissionAsk): string[] {
  return [rowTitle(ask), ...rowChoices(ask).map((choice, index) => `${index + 1}. ${choice.label}`)];
}

// The answer a key gives, or null for a key that is not one of the digits offered.
export function rowAnswer(ask: PermissionAsk, key: string): PermissionResult | null {
  const index = /^[1-9]$/.test(key) ? Number(key) - 1 : -1;
  return rowChoices(ask)[index]?.answer() ?? null;
}
