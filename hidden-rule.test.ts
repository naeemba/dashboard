import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// conventions-rule-3: any `display` in our CSS beats the browser's own `[hidden] { display: none }`,
// so a class that sets one needs a `.name[hidden]` rule, or an element with it set `hidden` stays on
// screen. Only a bare class is held to it (`.chat`, not `.chat-log img` or `.page.missing`): a
// selector with more in it styles something the class does not own.
//
// `view-` and `page-` classes sit on a `.view` or a `.page`, which `.view[hidden], .page[hidden]` in
// index.css hides with visibility so its panes keep their size; a `display: none` for one of them
// would make its terminals measure zero.
const HIDDEN_BY_VISIBILITY = /^\.(view|page)-/;
const BARE_CLASS = /^\.[\w-]+$/;
const RULE = /([^{}]+)\{([^{}]*)\}/g;
const SHOWS = /display\s*:\s*(?!none\b)[\w-]+/;

function classesWithoutHiddenRule(css: string): string[] {
  const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(RULE)].map(([, selectors, body]) => ({
    selectors: selectors.split(',').map((selector) => selector.trim()),
    body,
  }));
  const hidden = new Set(rules.flatMap((rule) => rule.selectors).filter((selector) => selector.endsWith('[hidden]')));
  return rules
    .filter((rule) => SHOWS.test(rule.body))
    .flatMap((rule) => rule.selectors)
    .filter((selector) => BARE_CLASS.test(selector) && !HIDDEN_BY_VISIBILITY.test(selector))
    .filter((selector) => !hidden.has(`${selector}[hidden]`));
}

const stylesheets = readdirSync('src', { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.css'))
  .map((file) => path.join('src', file).split(path.sep).join('/'));

describe('a class that sets display', () => {
  it('has a [hidden] rule beside it in its stylesheet', () => {
    const missing = stylesheets.flatMap((file) =>
      classesWithoutHiddenRule(readFileSync(file, 'utf8')).map((selector) => `${file}: ${selector}`));
    expect(missing).toEqual([]);
  });

  it('is found, so an empty scan cannot pass', () => {
    expect(stylesheets).not.toHaveLength(0);
    expect(classesWithoutHiddenRule('.row { display: flex }')).toEqual(['.row']);
    expect(classesWithoutHiddenRule('.row { display: flex } .row[hidden] { display: none }')).toEqual([]);
    expect(classesWithoutHiddenRule('@media (x) { .a, .b { display: grid } } .b[hidden] {}')).toEqual(['.a']);
    expect(classesWithoutHiddenRule('.a { display: none } .a b { display: flex } .view-x { display: grid }')).toEqual([]);
  });
});
