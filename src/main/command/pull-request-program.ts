import { setTimeout as delay } from 'node:timers/promises';
import { runProgram } from '../app/git';
import { isRecord } from '../../shared/app/is-record';
import { isManagerHomeDirectory, projectRoot } from '../board/board-store';
import { boardTarget } from '../board/board-target';
import { projectNamedInFile } from '../projects/project-named';
import { projectRemote } from '../app/base-branch';
import { fastForwardCheckout } from './fast-forward-checkout';
import { failureLine } from './failure-line';
import type { ProgramAnswer } from './gh-answer';
import { conflictedFiles, landPullRequest, parsePullRequestCommand, releaseLanded, waitOnPullRequest } from './pull-request-cli';
import { writePullRequest } from './pull-request-write-cli';
import { askLanded } from '../workers/session-socket';

// gh or git in the folder, its exit read rather than thrown: a failed check is an answer, not a
// failure. One that could not start (none installed) has no exit code, and still throws. gh runs as
// long as CI does, inside the scope of the pane or terminal that ran the command.
function answering(program: 'gh' | 'git') {
  return async (folder: string, words: string[]): Promise<ProgramAnswer> => {
    try {
      return { ok: true, output: await runProgram(program, words, folder) };
    } catch (error: unknown) {
      if (!isRecord(error) || typeof error.code !== 'number') throw error;
      return { ok: false, output: `${String(error.stdout ?? '')}${String(error.stderr ?? '')}`.trim() };
    }
  };
}

// The whole of `dashboard pr` outside pull-request-cli.ts: the folder, gh, and the answer printed. The
// project is found as `board` finds it (board-target.ts): --project, else the one the folder is in.
export async function runPullRequestProgram(commandArguments: readonly string[]): Promise<number> {
  const project = boardTarget(commandArguments, process.cwd(), { isHome: isManagerHomeDirectory, projectRoot, named: projectNamedInFile });
  const parsed = project.ok ? parsePullRequestCommand(project.commandArguments) : project;
  if (!project.ok || !parsed.ok) {
    process.stderr.write(`${parsed.ok ? '' : parsed.message}\n`);
    return 1;
  }
  const gh = (words: string[]) => answering('gh')(project.project, words);
  try {
    if ('write' in parsed) {
      const written = await writePullRequest({ gh, wait: delay }, parsed.write);
      (written.ok ? process.stdout : process.stderr).write(`${written.output}\n`);
      return written.ok ? 0 : 1;
    }
    const verb = parsed.verb === 'land' ? landPullRequest : waitOnPullRequest;
    const answer = await verb({ gh, wait: delay }, parsed.target);
    // The verdict is the last line printed, so the session that ran it reads its end and nothing more.
    const { conflicts } = answer;
    const verdict = conflicts === undefined
      ? answer.output
      : await projectRemote(project.project).then((remote) => conflictedFiles(answering('git'), project.project, remote, conflicts));
    const { base } = answer;
    // The merge has gone through: a git that throws (none installed) is a line, never the exit code.
    const forwarded = answer.ok && base !== undefined
      ? `${await projectRemote(project.project)
        .then((remote) => fastForwardCheckout(answering('git'), project.project, remote, base))
        .catch((error: unknown) => `${base} is not fast-forwarded: ${failureLine(error)}`)}\n`
      : '';
    // The worker on the merged branch, released or kept, as the app answers it: never the last line.
    const landed = await releaseLanded((branch) => askLanded('branch', branch, project.project), answer, parsed.keep);
    (answer.ok ? process.stdout : process.stderr).write(`${forwarded}${landed === '' ? '' : `${landed}\n`}${verdict}\n`);
    return answer.ok ? 0 : 1;
  } catch (error: unknown) {
    process.stderr.write(`${failureLine(error)}\n`);
    return 1;
  }
}

