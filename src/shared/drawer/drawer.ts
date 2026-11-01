import type { OpenProjects } from '../app/bridge';

// What the drawer on a project's page lists, as main sends it: the project's docs and the Claude
// conversations the app started for it. Both sides name these, so they live here.

// One Claude conversation the app started, from its own record of it rather than from Claude Code's
// folders: a worker in a card's worktree lands in another folder there and would be missed.
export type SessionRecord = {
  id: string;
  // What the drawer calls it, `dashboard-14` until it is renamed.
  label: string;
  // Where it ran, which is where `claude --resume` has to be typed for the id to be found.
  directory: string;
  card: string | null;
  startedAt: number;
  lastUsedAt: number;
};

// The newest few, and whether there are older ones for the Load more row to fetch.
export type SessionList = { rows: SessionRecord[]; more: boolean };

// How many rows the drawer asks for at first, and how many more each Load more adds.
export const SESSION_PAGE_SIZE = 50;

// A markdown file under the project's docs/ folder: where it is, and the path the row prints.
export type DocEntry = { path: string; name: string };

// A doc's text for the viewer, its images carried inline, or why it was not read (errors-rule-2).
export type DocReply = { text: string } | { refused: string };

// A refusal answered as a value (errors-rule-2); null is the thing having happened.
export type DrawerReply = { refused: string } | null;

// A resume: the new worker's number and the list that has it on, so the screen can put the keyboard in
// it, or the refusal.
export type ResumeReply = { index: number; open: OpenProjects } | { refused: string };
