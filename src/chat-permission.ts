import type { PermissionResult, PermissionUpdate } from '@anthropic-ai/claude-agent-sdk';
import { isRecord } from './is-record';
import { toolSummary } from './chat-tools';

// A tool call the session wants a yes or no on, as main hands it to the chat pane. Everything the
// SDK's canUseTool is told that the pane draws or answers with; the id is main's, so the answer finds
// the call that is waiting for it.
export type PermissionAsk = {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  title?: string;
  description?: string;
  suggestions?: PermissionUpdate[];
  defaultToNo: boolean;
  suppressAlwaysAllowRule: boolean;
};

export type PermissionChoice = { label: string; result: PermissionResult };

const DENIED = 'The user said no to this tool call.';

// The rows the dialog offers and the one it opens on. "Always" is offered only when the session sent
// rules to add and did not say adding them would grant more than this one call. A session that asks
// to default to no opens on No, so a stray Enter declines rather than approves.
export function permissionChoices(ask: PermissionAsk): { choices: PermissionChoice[]; start: number } {
  const choices: PermissionChoice[] = [{ label: 'Yes', result: { behavior: 'allow', updatedInput: ask.input } }];
  if (ask.suggestions?.length && !ask.suppressAlwaysAllowRule) {
    choices.push({
      label: 'Yes, and do not ask again for this',
      result: { behavior: 'allow', updatedInput: ask.input, updatedPermissions: ask.suggestions },
    });
  }
  choices.push({ label: 'No', result: { behavior: 'deny', message: DENIED } });
  return { choices, start: ask.defaultToNo ? choices.length - 1 : 0 };
}

// The sentence over the rows. The session's own when it sent one, else the tool and what it is
// about to touch.
export function permissionTitle(ask: PermissionAsk): string {
  if (ask.title) return ask.title;
  const about = toolSummary(ask.toolName, ask.input);
  return about ? `${ask.toolName}: ${about}` : ask.toolName;
}

// AskUserQuestion, which reaches the pane as a permission ask like any other tool. Its answer is the
// call allowed with the answers written into its input, question text to the label picked; several
// labels of a multi-select are joined with a comma, which is how the tool reads them.
export type Question = {
  question: string;
  header: string;
  multiSelect: boolean;
  options: { label: string; description: string }[];
};

export function questionsOf(input: Record<string, unknown>): Question[] {
  if (!Array.isArray(input.questions)) return [];
  return input.questions.filter(isRecord).map((entry) => ({
    question: String(entry.question ?? ''),
    header: String(entry.header ?? ''),
    multiSelect: entry.multiSelect === true,
    options: (Array.isArray(entry.options) ? entry.options.filter(isRecord) : []).map((option) => ({
      label: String(option.label ?? ''),
      description: String(option.description ?? ''),
    })),
  }));
}

// `picked` is one list of answers per question: labels, or what was typed into Other.
export function questionAnswer(input: Record<string, unknown>, picked: string[][]): PermissionResult {
  const answers = Object.fromEntries(questionsOf(input).map((question, index) => [
    question.question, (picked[index] ?? []).join(', '),
  ]));
  return { behavior: 'allow', updatedInput: { ...input, answers } };
}
