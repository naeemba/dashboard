import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { answerLine, callTool, type CommandRun } from './mcp-server';
import { toolArguments } from './mcp-tools';

// The whole of `dashboard mcp` outside mcp-server.ts: stdin read a line at a time, each answer written
// to stdout as one line, and each tool call run as this same command file with the tool's words. A
// child rather than the program in this process, whose stdout is the protocol's and whose programs
// write to it and set the exit code; the child inherits this server's environment, which is the
// session's, so it knows its pane the way the command in that session's Bash does.
const runCommand: CommandRun = (commandArguments) => new Promise((resolve) => {
  const child = spawn(process.execPath, [process.argv[1], ...commandArguments], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.setEncoding('utf8').on('data', (text: string) => { output += text; });
  child.stderr.setEncoding('utf8').on('data', (text: string) => { output += text; });
  child.on('error', (error) => resolve({ code: 1, output: `${output}${error.message}` }));
  child.on('close', (code) => resolve({ code: code ?? 1, output }));
});

export function serveMcp(): Promise<number> {
  const lines = createInterface({ input: process.stdin });
  const pending = new Set<Promise<void>>();
  lines.on('line', (line) => {
    // Calls answer in the order they finish, as JSON-RPC lets them: a ship waiting on an install
    // does not hold up a board read.
    const answered = answerLine(line, __BUILD_VERSION__, (chosen, input) =>
      callTool(chosen, toolArguments(chosen, input), runCommand, async (file) => (await readFile(file)).toString('base64')))
      .then((answer) => { if (answer !== null) process.stdout.write(`${JSON.stringify(answer)}\n`); })
      .finally(() => pending.delete(answered));
    pending.add(answered);
  });
  return new Promise((resolve) => lines.on('close', () => { void Promise.all(pending).then(() => resolve(0)); }));
}
