import { setTimeout as delay } from 'node:timers/promises';
import { runProgram } from '../app/git';
import { isRecord } from '../../shared/app/is-record';
import { isManagerHomeDirectory, projectRoot } from '../board/board-store';
import { boardTarget } from '../board/board-target';
import { projectNamedInFile } from '../projects/project-named';
import { failureLine } from './failure-line';
import { type GitHubAnswer, landPullRequest, parsePullRequestCommand } from './pull-request-cli';

// gh in the folder, its exit read rather than thrown: a failed check is an answer, not a failure. A
// gh that could not start (none installed) has no exit code, and still throws. It runs as long as CI
// does, inside the scope of the pane or terminal that ran the command.
function gh(folder: string) {
  return async (words: string[]): Promise<GitHubAnswer> => {
    try {
      return { ok: true, output: await runProgram('gh', words, folder) };
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
  try {
    const answer = await landPullRequest({ gh: gh(project.project), wait: delay }, parsed.target);
    (answer.ok ? process.stdout : process.stderr).write(`${answer.output}\n`);
    return answer.ok ? 0 : 1;
  } catch (error: unknown) {
    process.stderr.write(`${failureLine(error)}\n`);
    return 1;
  }
}
