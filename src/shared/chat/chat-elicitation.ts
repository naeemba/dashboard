import type { ElicitationRequest, ElicitationResult, PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import type { PermissionAsk } from '../../renderer/chat/chat-permission';
import { isRecord } from '../app/is-record';

// An MCP server asking for something: a form to fill in, or a link to open (a sign-in). It reaches the
// pane as a permission ask under this tool name, with the request as its input, so it is held, shown
// on every screen and given up on like any other ask. The answer comes back as a permission result,
// a yes carrying what was filled in, and main turns it into the server's answer.
export const ELICITATION = 'McpElicitation';

export function elicitationAsk(request: ElicitationRequest): Omit<PermissionAsk, 'id'> {
  return {
    toolName: ELICITATION, input: { ...request }, title: elicitationTitle(request), description: request.description,
    defaultToNo: false, suppressAlwaysAllowRule: true,
  };
}

export function elicitationTitle(request: ElicitationRequest): string {
  return `${request.title ?? request.displayName ?? request.serverName}: ${request.message}`;
}

// What the Decline row answers with. Any other no is the ask given up on (Escape stopping the turn,
// the session ending), which MCP calls a cancel: the user made no choice, so the server must not
// record a refusal.
const DECLINE_MESSAGE = 'The user declined the request.';
export const DECLINED: PermissionResult = { behavior: 'deny', message: DECLINE_MESSAGE };

// A link is accepted with nothing filled in; a no is a decline or a cancel, the server's to act on.
export function elicitationResult(request: ElicitationRequest, result: PermissionResult): ElicitationResult {
  if (result.behavior === 'deny') return { action: result.message === DECLINE_MESSAGE ? 'decline' : 'cancel' };
  return request.mode === 'url' ? { action: 'accept' } : { action: 'accept', content: (result.updatedInput ?? {}) as ElicitationResult['content'] };
}

// One property of the form's schema. MCP keeps forms flat: text, numbers, a yes or no, and a pick
// from a list. The server checks the answer against the same schema and fails the tool call on a
// mismatch, so what cannot be answered here is not offered. ponytail: a multi-select (an array of
// choices) is `list`, which can only be skipped or declined; walk it like AskUserQuestion's multi-select if a
// server needs one. `format` (email, uri, date) is not checked, so a bad one fails at the server.
export type Field = {
  key: string;
  label: string;
  description: string;
  kind: 'text' | 'number' | 'integer' | 'boolean' | 'choice' | 'list';
  options: { value: string; label: string }[];
  required: boolean;
  initial: string;
  limits: { minimum: number; maximum: number; minLength: number; maxLength: number };
};

const numberOr = (value: unknown, otherwise: number) => (typeof value === 'number' ? value : otherwise);

function optionsOf(property: Record<string, unknown>): Field['options'] {
  if (Array.isArray(property.enum)) {
    const names = Array.isArray(property.enumNames) ? property.enumNames : [];
    return property.enum.map((value, index) => ({ value: String(value), label: String(names[index] ?? value) }));
  }
  const listed = Array.isArray(property.oneOf) ? property.oneOf : Array.isArray(property.anyOf) ? property.anyOf : [];
  return listed.filter(isRecord).map((option) => ({ value: String(option.const ?? ''), label: String(option.title ?? option.const ?? '') }));
}

export function fieldsOf(schema: unknown): Field[] {
  if (!isRecord(schema) || !isRecord(schema.properties)) return [];
  const required = Array.isArray(schema.required) ? schema.required : [];
  return Object.entries(schema.properties).flatMap(([key, property]) => {
    if (!isRecord(property)) return [];
    const options = optionsOf(property);
    const type = property.type;
    const kind: Field['kind'] = type === 'array' ? 'list' : options.length > 0 ? 'choice'
      : type === 'boolean' || type === 'number' || type === 'integer' ? type : 'text';
    return [{
      key,
      label: String(property.title ?? key),
      description: String(property.description ?? ''),
      kind,
      options,
      required: required.includes(key),
      initial: property.default === undefined ? '' : String(property.default),
      limits: {
        minimum: numberOr(property.minimum, -Infinity),
        maximum: numberOr(property.maximum, Infinity),
        minLength: numberOr(property.minLength, 0),
        maxLength: numberOr(property.maxLength, Infinity),
      },
    }];
  });
}

// The rows a field is asked with, and the one the box opens on. A yes or no and a pick are rows,
// opened on the server's default; Skip only where the field may be left out, since a required key
// missing fails at the server; a list cannot be answered here, only skipped where it is optional.
// Decline is always the last row.
export type FieldChoice = { label: string; value: unknown } | { label: string; typed: string } | { label: string; skip: true } | { label: string; decline: true };

export function fieldChoices(field: Field): { choices: FieldChoice[]; start: number } {
  const decline: FieldChoice = { label: 'Decline', decline: true };
  const skip: FieldChoice[] = field.required ? [] : [{ label: 'Skip', skip: true }];
  if (field.kind === 'list') return { choices: [...skip, decline], start: 0 };
  if (field.kind === 'text' || field.kind === 'number' || field.kind === 'integer') {
    const typed = `${takes(field)}${field.required ? '' : ', or leave it empty'}, then Enter`;
    return { choices: [{ label: field.label, typed }, decline], start: 0 };
  }
  const picks: FieldChoice[] = field.kind === 'boolean'
    ? [{ label: 'Yes', value: true }, { label: 'No', value: false }]
    : field.options.map((option) => ({ label: option.label, value: option.value }));
  const start = Math.max(0, picks.findIndex((pick) => 'value' in pick && String(pick.value) === field.initial));
  return { choices: [...picks, ...skip, decline], start };
}

// The line over a field's rows: its name, whether it may be left out, and what it is for.
export function fieldAbout(field: Field): string {
  const about = `${field.label}${field.required ? '' : ' (optional)'}${field.description ? ` — ${field.description}` : ''}`;
  if (field.kind !== 'list') return about;
  return `${about}. A pick of several cannot be answered from here${field.required ? '' : '; skip it to leave it out'}.`;
}

function range(low: number, high: number, unit: string): string {
  if (Number.isFinite(low) && Number.isFinite(high)) return ` of ${low} to ${high}${unit}`;
  if (Number.isFinite(low)) return ` of at least ${low}${unit}`;
  if (Number.isFinite(high)) return ` of at most ${high}${unit}`;
  return '';
}

// What a typed field takes, said in the box before anything is typed.
export function takes(field: Field): string {
  const { minimum, maximum, minLength, maxLength } = field.limits;
  if (field.kind === 'text') return `Text${range(minLength > 0 ? minLength : -Infinity, maxLength, ' characters')}`;
  return `${field.kind === 'integer' ? 'A whole number' : 'A number'}${range(minimum, maximum, '')}`;
}

// What a typed answer puts in the form, or why it cannot: `skip` leaves an optional field out, and
// `again` keeps the box open on a required field left empty or an answer outside what the field takes.
export function typedValue(field: Field, typed: string): { value: string | number } | 'skip' | 'again' {
  if (!typed) return field.required ? 'again' : 'skip';
  const { minimum, maximum, minLength, maxLength } = field.limits;
  if (field.kind === 'text') return typed.length < minLength || typed.length > maxLength ? 'again' : { value: typed };
  const number = Number(typed);
  if (!Number.isFinite(number) || (field.kind === 'integer' && !Number.isInteger(number))) return 'again';
  return number < minimum || number > maximum ? 'again' : { value: number };
}
