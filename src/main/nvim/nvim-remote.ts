import { execFile } from 'node:child_process';
import { rmSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { connect } from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';
import { locateCommand, taskArguments } from '../../shared/panes/shell';
import type { Handover } from '../../shared/app/bridge';

const runCommand = promisify(execFile);

// Reaching a running nvim: where it listens, where the scrollback and prompt files go, and how one is
// handed to the other. Main keeps the channel and hands over the temp folder; every decision is here. The
// pieces below are exported for the test beside this file as much as for main — the rules with a branch in
// them are the last line, the pid in a name and the vimscript quoting, and none of those is pinned by
// anything else.

// Where nvim is, found once and remembered. The PATH problem every spawn in this app has — one
// launched from the Dock inherits almost none of one — but this runs on a keypress rather than on a
// pane spawn, and the login shell that solves it costs about three quarters of a second. Paying that
// on every press is the difference between a key that opens a tab and a key you wait for.
//
// Remembered for the life of the app, so nvim moving house wants a restart. That is the same deal the
// editor pane already has: it resolves nvim through the shell when the pane spawns and holds it for as
// long as the pane lives.
let nvimPath: string | null = null;

async function findNvim(shellCommand: string): Promise<string | null> {
  if (nvimPath !== null) return nvimPath;
  try {
    const command = locateCommand(shellCommand, 'nvim');
    const { stdout } = await runCommand(shellCommand, taskArguments(shellCommand, command));
    nvimPath = nvimFromOutput(stdout);
  } catch {
    nvimPath = null;
  }
  return nvimPath;
}

// The path nvim printed, out of whatever else the shell said on its way there. A login shell with
// something chatty in its rc files prints that first, so the last line is the answer and an empty
// answer means nvim is not on the PATH at all.
export function nvimFromOutput(stdout: string): string | null {
  const found = stdout.trim().split('\n').pop() ?? '';
  return found === '' ? null : found;
}

// Where a project's editor listens. Named for the process as well as the slot: `app.getPath('temp')` is
// the same folder for every copy of the app, and building into `out/` and running that beside the
// installed app is the normal way to test a change here. Without the pid, spawning the dev build's
// editor unlinks the installed app's live socket, and Ctrl+` in one app lands in the other app's nvim.
// Nothing needs the name to survive a restart: the socket is removed before every spawn anyway.
//
// On Windows the same address has to be a named pipe — nvim's `--listen` takes a Unix domain socket
// path everywhere else, and Windows has no such thing. A pipe is not a file, which is why the wait
// below connects to the address instead of looking for it on disk.
export function editorSocket(temporaryDirectory: string, slot: number): string {
  const name = `dashboard-nvim-${process.pid}-${slot}`;
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\${name}`
    : path.join(temporaryDirectory, `${name}.sock`);
}

// nvim refuses to listen on a socket path that is already there, so one left behind by a crash or a
// kill -9 has to go before the pane spawns. A named pipe has nothing on disk to remove.
export function removeSocket(socket: string): void {
  if (process.platform !== 'win32') rmSync(socket, { force: true });
}

// One file per pane, not one per project. Five panes sharing a filename is nvim reloading the same
// buffer into the same tab: open the agent pane's transcript, press the key on the shell beside it,
// and the transcript is gone — when reading the two side by side is the first thing you want. The pid
// is here for the same reason it is on the socket.
export function scrollbackFile(temporaryDirectory: string, slot: number, index: number): string {
  return path.join(temporaryDirectory, `dashboard-scrollback-${process.pid}-${slot}-${index}.txt`);
}

// The wait is for a cold start. The key works from terminals mode, where the editor may never have been
// opened, so the renderer starts nvim and this waits for it to answer — about a second, nearly all of it
// the login shell's own startup.
//
// Connected to rather than looked for. `existsSync` cannot see a Windows named pipe at all, and on a
// socket file it answers yes for a stale one an old nvim left behind, which is fifteen seconds saved to
// spend on a connection refused instead.
// ponytail: polls every 50ms for up to 15s, which is the shell's startup with room to spare. If a
// slower machine ever times out, the fix is a longer wait, not a faster poll.
const SOCKET_POLL_MS = 50;
const SOCKET_WAIT_MS = 15000;

function canConnect(socket: string): Promise<boolean> {
  return new Promise((resolve) => {
    const connection = connect(socket)
      .on('connect', () => {
        connection.end();
        resolve(true);
      })
      .on('error', () => resolve(false));
  });
}

async function waitForSocket(socket: string): Promise<boolean> {
  for (let waited = 0; waited < SOCKET_WAIT_MS; waited += SOCKET_POLL_MS) {
    if (await canConnect(socket)) return true;
    await new Promise((resolve) => setTimeout(resolve, SOCKET_POLL_MS));
  }
  return canConnect(socket);
}

// Forget the file before opening it again. `--remote-tab` is `:tab drop`, and dropping a path nvim
// already holds reuses that window rather than opening a second tab — which is `:edit`, the one thing
// `--remote-tab` was picked to avoid. Delete a few lines out of the scrollback (the help blurb invites
// exactly that), press the key again, and nvim answers E37: no write since last change. Wiping the
// buffer first means the key cannot fail on account of what you did to the copy it gave you.
//
// `silent!` because the usual case is a buffer that was never loaded. The path goes inside a vimscript
// string, so a quote in it is doubled, and through fnameescape, so a space in it is still one argument.
export function wipeArguments(socket: string, file: string): string[] {
  const quoted = file.replaceAll("'", "''");
  return ['--server', socket, '--remote-expr', `execute('silent! bwipeout! ' .. fnameescape('${quoted}'))`];
}

// `--remote-tab` rather than `--remote`, so the scrollback arrives beside whatever you were editing
// instead of over it. The wipe above has just closed the window this file was in, so `:tab drop` never
// finds one to reuse: pressing the key twice on the same pane rebuilds the tab rather than returning to
// it, and the rebuilt one lands after the tab you are on. Still one tab per pane, never a stack.
export function tabArguments(socket: string, file: string): string[] {
  return ['--server', socket, '--remote-tab', file];
}

// A path clicked in a pane, opened where you are rather than in a tab of its own: `:drop` is `:edit`
// for a file no window shows, a jump to the window that already shows it otherwise, and a split
// rather than E37 when the buffer you are in has unsaved changes. The cursor then goes to the line the
// pane named and is centred there. Quoted the way wipeArguments quotes, for the same reasons.
export function openFileArguments(socket: string, file: string, line?: number, column?: number): string[] {
  const quoted = file.replaceAll("'", "''");
  const commands = [`'drop ' .. fnameescape('${quoted}')`];
  if (line !== undefined) commands.push(`'call cursor(${line}, ${column ?? 1})'`, `'normal! zz'`);
  return ['--server', socket, '--remote-expr', `execute([${commands.join(', ')}])`];
}

// Every scrollback and prompt file this run has written, so quitting takes them with it. A pane's
// scrollback is whatever was on your screen — an agent's transcript, a .env someone catted — and the removal on the
// write path below only runs the next time you press the key on that pane, which may be never.
const written = new Set<string>();

export function dropWrittenFiles(): void {
  for (const file of written) rmSync(file, { force: true });
  written.clear();
}

// Owner-only, and never written into a file that is already there. The temp folder is shared, and
// the default mode would leave a transcript readable by every account on the machine. The
// remove-then-`wx` pair is the other half: without it, a file planted at this path by someone else
// is a file this writes your text into, mode and all.
async function writeOwnFile(file: string, text: string): Promise<void> {
  rmSync(file, { force: true });
  await writeFile(file, text, { mode: 0o600, flag: 'wx' });
  written.add(file);
}

// Ctrl+G on the Claude screen: the prompt box as a file the page's nvim edits, read back when you
// return. One name per slot, like scrollbackFile: openPrompt wipes the buffer before the tab opens, so
// nvim never holds an older copy to bring back over the text just written.
function promptFile(temporaryDirectory: string, slot: number): string {
  return path.join(temporaryDirectory, `dashboard-prompt-${process.pid}-${slot}.md`);
}

// Per slot, the file in nvim and the text the box last took from it.
const prompts = new Map<number, { file: string; text: string }>();

export async function writePrompt(temporaryDirectory: string, slot: number, text: string): Promise<string> {
  const file = promptFile(temporaryDirectory, slot);
  await writeOwnFile(file, text);
  prompts.set(slot, { file, text });
  return file;
}

// What was saved since the box last took the file, or null when nothing new was.
export async function readPrompt(slot: number): Promise<string | null> {
  const prompt = prompts.get(slot);
  if (!prompt) return null;
  let contents: string;
  try {
    contents = await readFile(prompt.file, 'utf8');
  } catch {
    return null;
  }
  const text = savedPrompt(contents, prompt.text);
  if (text !== null) prompt.text = text;
  return text;
}

// nvim ends a file it writes with a newline the box never had. Without dropping it, every return to
// the screen would read a change and put the last saved text back over what you typed since.
export function savedPrompt(contents: string, seen: string): string | null {
  // nvim on Windows reads a file with no newline in it as `dos` and saves it with `\r\n`; those
  // carriage returns are not part of the prompt either.
  const text = contents.replace(/\r\n/g, '\n').replace(/\n$/, '');
  return text === seen ? null : text;
}

// Which nvim a hand-over goes to: the project's slot, the temp folder its socket lives in, and the shell
// that finds nvim on your PATH.
export type EditorTarget = { temporaryDirectory: string; shellCommand: string; slot: number };

// The hand-over the scrollback key, Ctrl+G's prompt and a path in a pane all go through: find nvim, get
// ready, wait for the editor to answer, run each set of arguments. `what` names the thing in every message. Answers
// ok-or-why-not rather than throwing, because every one of these has something to put in the status bar
// and nothing to put in the editor. `prepare` answers a message when it could not get ready.
async function handToEditor(
  editor: EditorTarget,
  what: string,
  prepare: () => Promise<string | null>,
  argumentLists: (socket: string) => string[][],
): Promise<Handover> {
  // Asked before the wait, not after. A machine with no nvim has an editor pane that exits on the spot
  // and a socket that is never coming, so without this the answer is fifteen seconds of nothing
  // followed by a message about a start that was never going to happen.
  const nvim = await findNvim(editor.shellCommand);
  if (nvim === null) return { ok: false, message: `nvim is not on your PATH, so there is nowhere to open ${what}` };
  const unready = await prepare();
  if (unready !== null) return { ok: false, message: unready };
  const socket = editorSocket(editor.temporaryDirectory, editor.slot);
  // Said rather than swallowed. Every other outcome puts a file in front of you; this one leaves the
  // editor showing whatever it was showing, and without a message that reads as the key doing nothing.
  if (!await waitForSocket(socket)) return { ok: false, message: `nvim did not start, so there was nowhere to open ${what}` };
  try {
    // No shell: nvim's own path, and the arguments handed over as words. Nothing here has to be quoted,
    // which is the whole reason the path is resolved once rather than run through a shell each time.
    for (const commandArguments of argumentLists(socket)) await runCommand(nvim, commandArguments);
    return { ok: true, message: '' };
  } catch (error) {
    return { ok: false, message: `nvim would not open ${what}: ${(error as Error).message}` };
  }
}

// The whole of the key: write the pane out and hand it over.
export function openScrollback(
  temporaryDirectory: string,
  shellCommand: string,
  slot: number,
  index: number,
  text: string,
): Promise<Handover> {
  const file = scrollbackFile(temporaryDirectory, slot, index);
  return handToEditor({ temporaryDirectory, shellCommand, slot }, 'the scrollback', async () => {
    try {
      await writeOwnFile(file, text);
      return null;
    } catch (error) {
      return `could not write the scrollback: ${(error as Error).message}`;
    }
  }, (socket) => [wipeArguments(socket, file), tabArguments(socket, file)]);
}

// A file already on disk: a path a pane printed, which main has found. The renderer starts nvim the
// moment you pick the path, so the wait is the scrollback's.
export function openFileInEditor(
  editor: EditorTarget,
  file: string,
  line?: number,
  column?: number,
): Promise<Handover> {
  return handToEditor(editor, path.basename(file), async () => null,
    (socket) => [openFileArguments(socket, file, line, column)]);
}

// Ctrl+G's half in main: the box written out and handed over the way the scrollback is, wiped and then
// opened in a tab of its own, so `:wq` closes the tab and leaves what you were editing in front of you.
export function openPrompt(
  temporaryDirectory: string,
  shellCommand: string,
  slot: number,
  text: string,
): Promise<Handover> {
  const file = promptFile(temporaryDirectory, slot);
  return handToEditor({ temporaryDirectory, shellCommand, slot }, 'the prompt', async () => {
    try {
      await writePrompt(temporaryDirectory, slot, text);
      return null;
    } catch (error) {
      return `could not write the prompt: ${(error as Error).message}`;
    }
  }, (socket) => [wipeArguments(socket, file), tabArguments(socket, file)]);
}
