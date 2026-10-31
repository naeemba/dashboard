# Nvim: decisions

Settled questions. Read the entry before re-litigating it.

## nvim-decision-1: A file path in a pane opens in nvim

A path a pane prints — `src/main.ts:42`, `./notes.md`, `~/.zshrc` — underlines
like a URL does, and clicking it opens the file in the project's nvim at that
line. The hint key (Alt+O) is the keyboard's way to the same thing: a letter
over every path on the screen, one keystroke to open it. Both read their paths
through `file-links.ts`, so a path you can click is a path you can label.

A relative path is looked for in the folder the pane's shell stands in now, read
from the running process, then the folder the pane started in, then the
project. An agent shipped into a worktree prints paths relative to the
worktree, and a shell that has `cd`'d somewhere prints paths relative to there;
the project root alone would open the wrong copy of the file, or none.

What reads as a path is decided without touching the disk, so `and/or`
underlines too. Asking main about every row under the pointer would cost an IPC
round trip per hover for a false underline that, once clicked, says "there is no
file and/or here". The file is only looked for when you open one.

The file opens with `:drop`, in the window you were editing in, not a new tab.
The scrollback gets a tab because it is a copy you read beside your work; a
path is a file you went to.
