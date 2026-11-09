import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { channelOf } from '../actions/action';
import { sourceFiles } from '../testing/source-files';

// app-rule-1: the thing, a colon, what you do to it, each lower-case words joined by hyphens:
// `board:read`, `chat-side-question:ask`. Whether the verb is a verb is still the reader's.
function isChannelName(name: string): boolean {
  return /^[a-z]+(-[a-z]+)*:[a-z]+(-[a-z]+)*$/.test(name);
}

// Every channel named anywhere: each one preload.ts invokes, sends or listens on (main's pushes
// included), each literal main handles on any receiver or its table listens on, and each action's,
// with or without type arguments, which channelOf makes at registration.
function channelNames(): string[] {
  const main = sourceFiles('src/main').map((file) => readFileSync(file, 'utf8')).join('\n');
  const preload = readFileSync('src/preload/preload.ts', 'utf8');
  return [
    ...[...preload.matchAll(/\bipcRenderer\.\w+\('([^']+)'/g)].map((match) => match[1]),
    ...[...main.matchAll(/\.handle\('([^']+)'|\btable\.on\('([^']+)'/g)].map((match) => match[1] ?? match[2]),
    ...[...main.matchAll(/\baction(?:<[^(]*>)?\('([^']+)'/g)].map((match) => channelOf(match[1])),
  ];
}

describe('channel names', () => {
  const names = channelNames();

  it('finds the channels main registers, pushes and binds to actions', () => {
    expect(names).toEqual(expect.arrayContaining(['board:read', 'pty:input', 'pty:data', 'card:move', 'processes:install-slices']));
  });

  it('names every channel <noun>:<verb>', () => {
    expect(names.filter((name) => !isChannelName(name))).toEqual([]);
  });

  it.each(['readBoard', 'board', 'board:', ':read', 'Board:read', 'board:read:all', 'board_read:x', 'card.move'])('refuses %s', (name) => {
    expect(isChannelName(name)).toBe(false);
  });
});
