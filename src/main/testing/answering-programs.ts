import type { runProgram } from '../app/git';

// A runProgram whose every answer is given up front, by the start of the command line it answers
// (`git remote get-url origin`, `glab api`); the longest start that matches wins, so `git remote`
// and `git remote get-url` can both be given. One not given is the program failing.
export function answeringPrograms(answers: Record<string, string>): typeof runProgram {
  const starts = Object.keys(answers).sort((one, other) => other.length - one.length);
  return async (program, programArguments) => {
    const line = `${program} ${programArguments.join(' ')}`;
    const start = starts.find((each) => line.startsWith(each));
    if (start === undefined) throw new Error(`${program} failed`);
    return answers[start];
  };
}

// The git answers that make a folder's forge (forge.ts) the one its remote's URL names.
export const remoteAt = (url: string): Record<string, string> => ({ 'git remote': 'origin', 'git remote get-url origin': url });
