// Which of a thrown error's two faces the terminal gets. Every fs failure carries an errno `code`, and
// those are the ones a sentence answers: nothing about `EACCES: permission denied, open
// '.dashboard/board.json'` gets clearer with a stack. Anything without a code is a bug in the
// program, and a bug printed as one sentence leaves an agent `Cannot read properties of undefined
// (reading 'title')` and no file to open, so those keep their stack. A throw that is not an Error at all has neither, and
// falls back to whatever it prints as.
export function failureLine(error: unknown): string {
  const failure = error as NodeJS.ErrnoException | null;
  return (failure?.code ? failure.message : failure?.stack) ?? String(error);
}
