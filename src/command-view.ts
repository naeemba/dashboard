import type { Action } from './actions';
import { clampIndex, heldIndex } from './clamp-index';
import { isBareCharacter } from './shortcuts';
import { taskSummary, type TaskResult } from './tasks';

export type CommandProject = { name: string; path: string };

export type CommandOptions = {
  // Every open project, asked for again on every arrival rather than handed over once, so a project
  // opened since you were last here has a row.
  projects(): readonly CommandProject[];
  runTask(command: string, projectPaths: string[]): void;
  cancelTasks(): void;
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
// The selection's key when it is on the command box. Every project path is an absolute filesystem
// path, so it always starts with a slash — this never does, and so can never collide with one, the
// way an empty string could if a project's path were ever empty.
const COMMAND_KEY = 'command';

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
  keys.textContent = 'Enter runs it · Space marks a project · Escape cancels';
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

  function projects(): readonly CommandProject[] {
    return options.projects();
  }

  function keyAt(index: number): string {
    return index === COMMAND_ROW ? COMMAND_KEY : currentProjects[index - 1]?.path ?? COMMAND_KEY;
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
    return results.get(path)
      ?? { projectPath: path, state: 'idle', exitCode: null, lastLine: '', tail: [] };
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
    const paths = projects().map((project) => project.path).filter((path) => !unmarked.has(path));
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
    // A row with nothing under it does not open. The selection has already moved here by now, so the
    // click that landed on it still did its half of the job.
    if (resultFor(project.path).tail.length === 0) return;
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
    currentProjects = projects();
    const keysAtRow = [COMMAND_KEY, ...currentProjects.map((project) => project.path)];
    setSelection(heldIndex(keysAtRow, selectedKey, selected));
    empty.hidden = currentProjects.length > 0;
    label.classList.toggle('highlighted', selected === COMMAND_ROW);
    keys.textContent = running
      ? 'Escape stops it'
      : 'Enter runs it · Space marks a project · Escape cancels';
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
      if (project === null) {
        return running ? 'command · running · Escape stops it' : 'command · Enter runs it';
      }
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
      // Whether anything is still going, asked of the results rather than counted as they arrive: a
      // cancel answers every project at once, and a tally kept by hand would have to be right about
      // how many of those it had already seen.
      running = [...results.values()].some((entry) => entry.state === 'running');
      // A row whose output has just gone shuts itself, rather than staying open over nothing and
      // leaving a gap under the name.
      if (result.tail.length === 0) opened.delete(result.projectPath);
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
