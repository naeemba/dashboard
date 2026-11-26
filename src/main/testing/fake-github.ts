import type { ProgramAnswer } from '../command/gh-answer';

// A gh that answers each command's first two words from the table, in order when a row has several,
// and notes every command asked and every wait, for the `pr` verbs' tests.
export function fakeGitHub(answers: Record<string, ProgramAnswer[]>) {
  const asked: string[] = [];
  const waited: number[] = [];
  return {
    asked,
    waited,
    ports: {
      gh: async (words: string[]) => {
        asked.push(words.join(' '));
        return answers[words.slice(0, 2).join(' ')]?.shift() ?? { ok: false, output: 'asked too often' };
      },
      wait: async (milliseconds: number) => { waited.push(milliseconds); },
    },
  };
}
