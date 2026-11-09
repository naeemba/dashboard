import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// conventions-rule-3: any `display` in our CSS beats the browser's own `[hidden] { display: none }`,
// so a class that sets one needs a `.name[hidden]` rule, or an element with it set `hidden` stays on
// screen. Only a bare class is held to it (`.chat`, not `.chat-log img` or `.page.missing`): a
// selector with more in it styles something the class does not own.
//
// The classes that sit on a `.view` or a `.page`, which `.view[hidden], .page[hidden]` in index.css
// hides with visibility so its panes keep their size; a `display: none` for one of them would make
// its terminals measure zero. A new view's class is a row here, or the test asks for its rule.
const HIDDEN_BY_VISIBILITY = new Set([
  '.view-terminals', '.view-nvim', '.view-notes', '.view-manager', '.view-command', '.view-log', '.page-manager',
]);
const BARE_CLASS = /^\.[\w-]+$/;
const RULE = /([^{}]+)\{([^{}]*)\}/g;
const SHOWS = /display\s*:\s*(?!none\b)[\w-]+/;

// Each bare class that sets display with no `[hidden]` rule, and each `[hidden]` rule whose class no
// longer sets one in the same stylesheet, so a rule left behind by a deleted class is caught too.
function hiddenRuleProblems(css: string): string[] {
  const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(RULE)].map(([, selectors, body]) => ({
    selectors: selectors.split(',').map((selector) => selector.trim()),
    body,
  }));
  const shown = new Set(rules.filter((rule) => SHOWS.test(rule.body)).flatMap((rule) => rule.selectors)
    .filter((selector) => BARE_CLASS.test(selector)));
  const hidden = new Set(rules.flatMap((rule) => rule.selectors)
    .filter((selector) => selector.endsWith('[hidden]')).map((selector) => selector.slice(0, -'[hidden]'.length))
    .filter((selector) => BARE_CLASS.test(selector)));
  return [
    ...[...shown].filter((selector) => !hidden.has(selector) && !HIDDEN_BY_VISIBILITY.has(selector))
      .map((selector) => `${selector} sets display with no [hidden] rule`),
    ...[...hidden].filter((selector) => !shown.has(selector))
      .map((selector) => `${selector}[hidden] has no class setting display`),
  ];
}

const stylesheets = readdirSync('src', { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.css'))
  .map((file) => path.join('src', file).split(path.sep).join('/'));

describe('a class that sets display', () => {
  it('has a [hidden] rule in its stylesheet, and every [hidden] rule has its class', () => {
    const problems = stylesheets.flatMap((file) =>
      hiddenRuleProblems(readFileSync(file, 'utf8')).map((problem) => `${file}: ${problem}`));
    expect(problems).toEqual([]);
  });

  it('is found, so an empty scan cannot pass', () => {
    expect(stylesheets).not.toHaveLength(0);
    expect(hiddenRuleProblems('.row { display: flex }')).toEqual(['.row sets display with no [hidden] rule']);
    expect(hiddenRuleProblems('.row { display: flex } .row[hidden] { display: none }')).toEqual([]);
    expect(hiddenRuleProblems('@media (x) { .a, .b { display: grid } } .b[hidden] {}'))
      .toEqual(['.a sets display with no [hidden] rule']);
    expect(hiddenRuleProblems('.a { display: none } .a b { display: flex } .view-log { display: grid }')).toEqual([]);
    expect(hiddenRuleProblems('.gone[hidden] { display: none }')).toEqual(['.gone[hidden] has no class setting display']);
  });
});
