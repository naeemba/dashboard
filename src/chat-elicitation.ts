import type { ElicitationRequest, ElicitationResult, PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import type { PermissionAsk } from './chat-permission';
import { isRecord } from './is-record';

// An MCP server asking for something: a form to fill in, or a link to open (a sign-in). It reaches the
// pane as a permission ask under this tool name, with the request as its input, so it is held, shown
// on every screen and given up on like any other ask. The answer comes back as a permission result,
// a yes carrying what was filled in, and main turns it into the server's answer.
export const ELICITATION = 'McpElicitation';

export function elicitationAsk(request: ElicitationRequest): Omit<PermissionAsk, 'id'> {
  return { toolName: ELICITATION, input: { ...request }, title: elicitationTitle(request), defaultToNo: false, suppressAlwaysAllowRule: true };
}

export function elicitationTitle(request: ElicitationRequest): string {
  return `${request.title ?? request.displayName ?? request.serverName}: ${request.message}`;
}

// A link is accepted with nothing filled in; a no is a decline, the server's to act on.
export function elicitationResult(request: ElicitationRequest, result: PermissionResult): ElicitationResult {
  if (result.behavior === 'deny') return { action: 'decline' };
  return request.mode === 'url' ? { action: 'accept' } : { action: 'accept', content: (result.updatedInput ?? {}) as ElicitationResult['content'] };
}

// One property of the form's schema. MCP keeps forms flat: text, numbers, a yes or no, and a pick
// from a list. ponytail: a multi-select (an array of choices) is asked as text; walk it like
// AskUserQuestion's multi-select if a server needs one.
export type Field = {
  key: string;
  label: string;
  description: string;
  kind: 'text' | 'number' | 'integer' | 'boolean' | 'choice';
  options: { value: string; label: string }[];
  required: boolean;
  initial: string;
};

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
    const kind: Field['kind'] = options.length > 0 ? 'choice'
      : type === 'boolean' || type === 'number' || type === 'integer' ? type : 'text';
    return [{
      key,
      label: String(property.title ?? key),
      description: String(property.description ?? ''),
      kind,
      options,
      required: required.includes(key),
      initial: property.default === undefined ? '' : String(property.default),
    }];
  });
}

// What a typed answer puts in the form, or why it cannot: `skip` leaves an optional field out, and
// `again` keeps the box open on a required field left empty or a number that is not one.
export function typedValue(field: Field, typed: string): { value: string | number } | 'skip' | 'again' {
  if (!typed) return field.required ? 'again' : 'skip';
  if (field.kind === 'text') return { value: typed };
  const number = Number(typed);
  if (!Number.isFinite(number) || (field.kind === 'integer' && !Number.isInteger(number))) return 'again';
  return { value: number };
}
