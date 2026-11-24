import { describe, expect, it } from 'vitest';
import { forgeOfUrl, projectForge } from './forge';
import { answeringPrograms as answering } from '../testing/answering-programs';

describe('forgeOfUrl', () => {
  it('reads GitHub from its host, an ssh alias of it included', () => {
    expect(forgeOfUrl('https://github.com/naeemba/dashboard.git')).toBe('github');
    expect(forgeOfUrl('git@github.com-p:naeemba/dashboard.git')).toBe('github');
    expect(forgeOfUrl('git@gitlab.com:acme/github-webhooks.git')).toBe('gitlab');
    expect(forgeOfUrl('https://git.arr.lan/tools/github-sync.git')).toBe('gitlab');
  });

  // insta-experiences: a self-hosted GitLab whose host does not say gitlab.
  it('reads anything else as GitLab', () => {
    expect(forgeOfUrl('git@git.arr.lan:gitroot/projects/blue-travel/fe/insta-experiences.git')).toBe('gitlab');
    expect(forgeOfUrl('https://gitlab.com/group/project.git')).toBe('gitlab');
  });
});

describe('projectForge', () => {
  // The GitHub mirror is a remote too: the forge is the chosen remote's, not any remote's.
  it('asks the remote the work goes to', async () => {
    const run = answering({
      'git remote': 'github-deprecated\ngitlab',
      'git config --get branch.main.remote': 'gitlab',
      'git remote get-url gitlab': 'git@git.arr.lan:fe/insta-experiences.git',
    });
    expect(await projectForge('/work/insta', run)).toBe('gitlab');
  });

  it('is GitHub when git cannot say', async () => {
    expect(await projectForge('/work/none', answering({}))).toBe('github');
  });
});
