import { projectRemote } from './base-branch';
import type { runProgram } from './git';

// Which forge a project's pull requests live on, read from the URL of the remote its work goes to
// (chosenRemote): GitHub when the URL names github, else GitLab, whose CLI is glab and whose pull
// request is a merge request. The rule ~/.claude/scripts/gitlab-remote.sh uses, which /mr-loop reads.
// insta-experiences is on git.arr.lan, which names neither, so the rule cannot wait for "gitlab".
// ponytail: a GitHub Enterprise host without "github" in its name reads as GitLab; ask gh's hosts
// (`gh auth status`) if one ever turns up.
export type Forge = 'github' | 'gitlab';

export function forgeOfUrl(url: string): Forge {
  return url.toLowerCase().includes('github') ? 'github' : 'gitlab';
}

// GitHub when git cannot say (no remote, not a repository): what every project was before GitLab.
export async function projectForge(folder: string, run: typeof runProgram): Promise<Forge> {
  const remote = await projectRemote(folder, run);
  const url = await run('git', ['remote', 'get-url', remote], folder).catch(() => null);
  return url === null ? 'github' : forgeOfUrl(url);
}
