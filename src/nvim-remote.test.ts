import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  dropWrittenFiles, editorSocket, nvimFromOutput, openFileArguments, readPrompt, savedPrompt, scrollbackFile,
  tabArguments, wipeArguments, writePrompt,
} from './nvim-remote';

describe('nvimFromOutput', () => {
  it('takes the path the shell printed', () => {
    expect(nvimFromOutput('/opt/homebrew/bin/nvim\n')).toBe('/opt/homebrew/bin/nvim');
  });

  // A login shell reads the rc files, and an rc file that greets you prints before the answer does.
  it('takes the last line, past whatever the rc files said first', () => {
    expect(nvimFromOutput('nvm: using node 22\nwelcome back\n/usr/local/bin/nvim\n'))
      .toBe('/usr/local/bin/nvim');
  });

  it('reads a shell that printed nothing as no nvim', () => {
    expect(nvimFromOutput('')).toBeNull();
    expect(nvimFromOutput('\n  \n')).toBeNull();
  });
});

describe('editorSocket and scrollbackFile', () => {
  // Two projects open at once must not answer for each other, and neither must two copies of the app
  // sharing one temp folder — a dev build beside the installed one.
  it('gives each slot its own socket, under this process', () => {
    expect(editorSocket('/tmp', 0)).not.toBe(editorSocket('/tmp', 1));
    expect(editorSocket('/tmp', 0)).toContain(String(process.pid));
  });

  // Five panes sharing one filename is nvim reloading the same buffer over the transcript you opened
  // a moment ago, instead of putting the two side by side.
  it('gives each pane of a project its own file', () => {
    expect(scrollbackFile('/tmp', 0, 0)).not.toBe(scrollbackFile('/tmp', 0, 1));
    expect(scrollbackFile('/tmp', 0, 0)).not.toBe(scrollbackFile('/tmp', 1, 0));
    expect(scrollbackFile('/tmp', 0, 0)).toContain(String(process.pid));
  });
});

describe('wipeArguments', () => {
  it('wipes the file before it is dropped again, so an edited copy cannot refuse', () => {
    expect(wipeArguments('/tmp/one.sock', '/tmp/scrollback.txt')).toEqual([
      '--server', '/tmp/one.sock', '--remote-expr',
      "execute('silent! bwipeout! ' .. fnameescape('/tmp/scrollback.txt'))",
    ]);
  });

  // The path goes inside a vimscript string. Left alone, a quote in it ends the string early and the
  // rest of the path is read as code.
  it("doubles a quote in the path, the way vimscript wants it", () => {
    expect(wipeArguments('/tmp/one.sock', "/tmp/it's/scrollback.txt")[3])
      .toBe("execute('silent! bwipeout! ' .. fnameescape('/tmp/it''s/scrollback.txt'))");
  });
});

describe('tabArguments', () => {
  it('asks for a tab, not an edit of what you were writing', () => {
    expect(tabArguments('/tmp/one.sock', '/tmp/scrollback.txt'))
      .toEqual(['--server', '/tmp/one.sock', '--remote-tab', '/tmp/scrollback.txt']);
  });
});

describe('openFileArguments', () => {
  it('drops the file and puts the cursor on the line and column the pane named', () => {
    expect(openFileArguments('/tmp/s.sock', '/p/a.ts', 42, 7)).toEqual([
      '--server', '/tmp/s.sock', '--remote-expr',
      "execute(['drop ' .. fnameescape('/p/a.ts'), 'call cursor(42, 7)', 'normal! zz'])",
    ]);
  });

  it('starts at the first column when the pane named only a line', () => {
    expect(openFileArguments('/s', '/a.ts', 3)[3]).toContain("'call cursor(3, 1)'");
  });

  it('leaves the cursor alone when there is no line', () => {
    expect(openFileArguments('/s', '/a.ts')[3]).toBe("execute(['drop ' .. fnameescape('/a.ts')])");
  });

  // The path sits inside a vimscript string, so a quote in it must not end the string early.
  it('doubles a quote in the path', () => {
    expect(openFileArguments('/s', "/it's.ts")[3]).toContain("fnameescape('/it''s.ts')");
  });
});

describe('savedPrompt', () => {
  // The newline nvim adds on write is not a change; read as one, every return would undo your typing.
  it('reads the text it wrote, saved back with a newline, as nothing new', () => {
    expect(savedPrompt('fix the bug\n', 'fix the bug')).toBeNull();
    expect(savedPrompt('fix the bug', 'fix the bug')).toBeNull();
  });

  it('answers what was saved, without the newline nvim ends it with', () => {
    expect(savedPrompt('fix the bug\nand test it\n', 'fix the bug')).toBe('fix the bug\nand test it');
  });

  it('keeps a blank line you ended it with on purpose', () => {
    expect(savedPrompt('fix it\n\n', 'fix it')).toBe('fix it\n');
  });

  // nvim on Windows saves a file it read as `dos` with \r\n; read as a change, it replaces the box.
  it('reads carriage returns nvim on Windows saved as nothing new', () => {
    expect(savedPrompt('fix the bug\r\n', 'fix the bug')).toBeNull();
    expect(savedPrompt('fix the bug\r\nand test it\r\n', 'x')).toBe('fix the bug\nand test it');
  });
});

describe('readPrompt', () => {
  const folders: string[] = [];
  afterEach(() => {
    dropWrittenFiles();
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
  });
  function folder(): string {
    const made = mkdtempSync(path.join(os.tmpdir(), 'dashboard-prompt-test-'));
    folders.push(made);
    return made;
  }

  // The second read answering null is what stops a later return from putting the saved text back
  // over what you typed into the box since.
  it('answers what was saved once, then nothing until it is saved again', async () => {
    const file = await writePrompt(folder(), 1, 'a');
    writeFileSync(file, 'b\n');
    expect(await readPrompt(1)).toBe('b');
    expect(await readPrompt(1)).toBeNull();
  });

  it('answers nothing for a slot that never wrote a prompt', async () => {
    expect(await readPrompt(99)).toBeNull();
  });

  it('answers nothing once the file is gone', async () => {
    const file = await writePrompt(folder(), 2, 'a');
    rmSync(file);
    expect(await readPrompt(2)).toBeNull();
  });
});
