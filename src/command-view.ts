import type { Action } from './actions';
import { clampIndex, heldIndex } from './clamp-index';
import { isBareCharacter } from './shortcuts';
import {
  anyRunning, commandKeys, COMMAND_KEY, hasTail, idleTask, taskSummary, type TaskResult,
} from './tasks';

export type CommandProject = { name: string; path: string };

export type CommandOptions = {
  // Every open project, asked for again on every arrival rather than handed over once, so a project
  // opened since you were last here has a row.
  projects(): readonly CommandProject[];
  runTask(command: string, projectPaths: string[]): void;
  cancelTasks(): void;
  // What an action is bound to right now, read fresh on every redraw rather than handed over once, so
  // rebinding a key in the settings screen rewrites the hint under the list and the status bar with it
  // — status.ts's managerLabel takes the picker's binding the same way and for the same reason.
  binding(actionName: string): string;
  // Redraws the status bar, which names what the selection is on.
  onChanged(): void;
};

export type CommandView = {
  element: HTMLElement;
  render(): void;
  statusLabel(): string;
  runAction(action: Action): void;
  // One result in, from main. The view redraws itself and tells the renderer, so the status bar moves
  // with it.
  update(result: TaskResult): void;
  focus(): void;
};

// The command box is the first thing the selection walks over, and the project rows follow it.
const COMMAND_ROW = 0;

export function createCommandView(options: CommandOptions): CommandView {
  const element = document.createElement('div');
  element.className = 'view view-command';
  // Focusable, so the selection can leave the command box and Space stops being a space. That is the
  // whole mechanism: while the box has the keyboard a space is typed into it, and while this element
  // has it a space is a mark. Nothing has to decide which — whichever has focus answers.
  element.tabIndex = -1;

  const label = document.createElement('label');
  label.className = 'command-label';
  label.textContent = 'Command';
  const input = document.createElement('input');
  input.className = 'command-input';
  input.type = 'text';
  input.placeholder = 'npm audit';
  // Every box you type into carries this. Without it a Persian command runs away from the caret and
  // Home and End go to the opposite ends of what you see.
  input.dir = 'auto';
  label.append(input);

  const list = document.createElement('ul');
  list.className = 'command-list';
  const empty = document.createElement('p');
  empty.textContent = 'No project is open, so there is nothing to run a command in.';
  const keys = document.createElement('p');
  keys.className = 'command-keys';
  element.append(label, list, empty, keys);

  // Which projects a run covers. Everything starts marked, so a command typed and Enter pressed runs
  // everywhere — the common case costs no marking at all. Held by path rather than by position: a
  // project opened in front of another must not hand its mark to somebody else.
  const unmarked = new Set<string>();
  // Which rows are showing their output. Same reasoning, same shape.
  const opened = new Set<string>();
  const results = new Map<string, TaskResult>();
  // The rows render() last drew, so the functions below read the same list the screen is showing
  // rather than asking options.projects() again and risking an answer that has already moved on.
  let currentProjects: readonly CommandProject[] = [];
  let selected = COMMAND_ROW;
  // What the selection is on, rather than where it is. render() also runs passively, off a task result
  // arriving from main, and a project list that has changed underneath a bare index would slide the
  // highlight onto a different project than the one you were looking at — manager.ts's selectedKey is
  // the same fix for the same reason.
  let selectedKey = COMMAND_KEY;
  let running = false;

  function keyAt(index: number): string {
    return commandKeys(currentProjects)[index] ?? COMMAND_KEY;
  }

  // What the one key that is not Space does here, named by whatever it is bound to. Nothing hears the
  // cancel key while nothing is running, so the idle line does not offer it: a line saying "Escape
  // cancels" on a screen where Escape does nothing is a way out that is not there.
  function keyHint(): string {
    return running
      ? `${options.binding('command-cancel')} stops it`
      : `${options.binding('command-open')} runs it`;
  }

  // Where the selection is and what it is on, always written together: set one without the other and
  // the next redraw hunts for a row the highlight is no longer on and drags it back.
  function setSelection(index: number): void {
    selected = index;
    selectedKey = keyAt(index);
  }

  // The project the selection is on, or null when it is on the command box.
  function selectedProject(): CommandProject | null {
    return selected === COMMAND_ROW ? null : currentProjects[selected - 1] ?? null;
  }

  function resultFor(path: string): TaskResult {
    return results.get(path) ?? idleTask(path);
  }

  // Moves the keyboard to wherever the selection is, unconditionally. Safe from a key or a click,
  // because both mean this screen already has the keyboard's attention. render() must not call this
  // directly — see the guarded call inside it — because render() also runs off a task result arriving
  // from main, which has nothing to do with which screen you are looking at.
  function focusSelection(): void {
    if (selected === COMMAND_ROW) input.focus();
    else element.focus();
  }

  function move(direction: 'up' | 'down'): void {
    setSelection(clampIndex(selected + (direction === 'down' ? 1 : -1), currentProjects.length));
    render();
    focusSelection();
    options.onChanged();
  }

  function toggleMark(project: CommandProject): void {
    if (unmarked.has(project.path)) unmarked.delete(project.path);
    else unmarked.add(project.path);
  }

  function run(): void {
    const command = input.value.trim();
    if (command === '') return;
    const paths = currentProjects.map((project) => project.path).filter((path) => !unmarked.has(path));
    if (paths.length === 0) return;
    running = true;
    // Last run's answers go as this one starts. A row showing yesterday's exit code beside four that
    // say `running` is a row you will read as this run's.
    for (const path of paths) results.delete(path);
    options.runTask(command, paths);
    render();
    options.onChanged();
  }

  // Enter: run it from the box, or open what a project printed from a row. One key, and what it does
  // is whatever the row it is on does — the same arrangement the manager's list has.
  function open(): void {
    const project = selectedProject();
    if (project === null) return run();
    // A row with nothing under it has nothing to toggle open, so Enter falls through to the same run
    // the command box does — hasTail in tasks.ts says why.
    if (!hasTail(resultFor(project.path))) return run();
    if (opened.has(project.path)) opened.delete(project.path);
    else opened.add(project.path);
    render();
    options.onChanged();
  }

  function cancel(): void {
    if (!running) return;
    options.cancelTasks();
  }

  function projectRow(project: CommandProject, index: number): HTMLElement {
    const item = document.createElement('li');
    item.className = 'command-project';
    const mark = document.createElement('span');
    mark.className = 'command-mark';
    // A span of its own, so the name beside it holds a folder's name and nothing else — a marker
    // sharing that span crosses to the far side of a Persian name and stops lining up.
    mark.textContent = unmarked.has(project.path) ? '▢ ' : '▣ ';
    const name = document.createElement('span');
    name.className = 'command-name';
    name.textContent = project.name;
    const result = resultFor(project.path);
    const summary = document.createElement('span');
    summary.className = 'command-summary';
    summary.textContent = taskSummary(result);

    const lines = result.tail;
    const tail = document.createElement('pre');
    tail.className = 'command-tail';
    tail.textContent = lines.join('\n');
    tail.hidden = !opened.has(project.path) || lines.length === 0;
    item.append(mark, name, summary, tail);

    // A click moves the selection to the row first and then does what Enter does there.
    item.addEventListener('click', () => {
      setSelection(index + 1);
      render();
      focusSelection();
      open();
      options.onChanged();
    });
    if (selected === index + 1) item.classList.add('highlighted');
    return item;
  }

  function render(): void {
    currentProjects = options.projects();
    setSelection(heldIndex(commandKeys(currentProjects), selectedKey, selected));
    empty.hidden = currentProjects.length > 0;
    label.classList.toggle('highlighted', selected === COMMAND_ROW);
    keys.textContent = running ? keyHint() : `${keyHint()} · Space marks a project`;
    list.replaceChildren(...currentProjects.map((project, index) => projectRow(project, index)));
    // Only when this screen already holds the keyboard. render() also runs off a task result arriving
    // from main, which arrives no matter which section is showing — a command finishing while you read
    // the board must not snatch the keyboard out of it and drop it here.
    if (element.contains(document.activeElement)) focusSelection();
  }

  // A click is not the only way the box gets focus — Tab does too, and so does the exported `focus()`
  // landing here on arrival. Whichever way it happens, the selection is pulled onto the command row
  // immediately, so a selection left on a project row from before can never intercept the Space that
  // was meant for the box: selectedProject() would still find that project and steal the keystroke.
  input.addEventListener('focus', () => {
    if (selected === COMMAND_ROW) return;
    setSelection(COMMAND_ROW);
    render();
    options.onChanged();
  });

  // Everything the window did not claim. Only Space, and only once the selection has left the command
  // box — while the box has the keyboard this listener never sees it, because the space is typed.
  // isBareCharacter is what keeps a modified key out; shortcuts.ts says why.
  element.addEventListener('keydown', (event) => {
    if (!isBareCharacter(event) || event.key !== ' ') return;
    const project = selectedProject();
    if (project === null) return;
    event.preventDefault();
    toggleMark(project);
    render();
    options.onChanged();
  });

  return {
    element,
    render,
    statusLabel(): string {
      const project = selectedProject();
      if (project === null) return `command · ${running ? 'running · ' : ''}${keyHint()}`;
      const marked = unmarked.has(project.path) ? 'not marked' : 'marked';
      return `${project.name} · ${marked} · ${taskSummary(resultFor(project.path))}`;
    },
    runAction(action: Action): void {
      if (action.kind === 'command-select') return move(action.direction);
      if (action.kind === 'command-open') return open();
      if (action.kind === 'command-cancel') return cancel();
    },
    update(result: TaskResult): void {
      results.set(result.projectPath, result);
      running = anyRunning(results.values());
      // A row whose output has just gone shuts itself, rather than staying open over nothing and
      // leaving a gap under the name.
      if (!hasTail(result)) opened.delete(result.projectPath);
      render();
      options.onChanged();
    },
    // The one deliberate exception to render()'s guarded focus-sync: called by the renderer when this
    // screen is entered, precisely when it does not yet hold the keyboard, so it must move focus
    // unconditionally rather than finding nothing to guard against and doing nothing.
    focus(): void {
      focusSelection();
    },
  };
}
