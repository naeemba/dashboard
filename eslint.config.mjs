import { builtinModules } from 'node:module';

import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

// `@xterm/addon-serialize` is Node-only here on purpose: main runs it over `@xterm/headless`.
const nodeOnly = [
  'node:*', 'electron', 'node-pty', 'ws', '@xterm/headless', '@xterm/addon-serialize',
  '@anthropic-ai/claude-agent-sdk', 'electron-squirrel-startup',
];
const domOnly = ['@xterm/xterm', '@xterm/addon-fit', 'lucide', 'marked', 'highlight.js', '@fontsource/*'];
// Builtins written without `node:` (`'fs'`, `'fs/promises'`). Matched as whole names, so `'util'`
// never catches `../shared/util/x` the way a glob would.
const unprefixedBuiltins = builtinModules.filter((name) => !name.startsWith('node:'));

// The same names as one regex, for the selectors below. A selector's regex may not contain a `/`,
// so it is written `\x2F`.
const slash = String.raw`\x2F`;
const packageRegex = (globs, exact = []) => {
  const alternatives = [
    ...globs.map((glob) => glob.replaceAll('.', '\\.').replaceAll('*', `[^${slash}]*`).replaceAll('/', slash) + `(${slash}|$)`),
    ...exact.map((name) => name.replaceAll('/', slash) + '$'),
  ];
  return `^(${alternatives.join('|')})`;
};
const folderRegex = (folders) => `(^|${slash})(${folders.join('|')})${slash}`;

// One process's side of the line: the folders it never imports, even for a type, and the packages
// it never value-imports. `no-restricted-imports` sees only static imports, so `import()` and an
// `import('...')` type get the same lines through `no-restricted-syntax`.
//
// The same rule refuses `String(error)` and `${error}` (errors-rule-1, which says why). It is a name
// match: only a value named `error` or `thrown` is caught. A later block's `no-restricted-syntax` replaces this one's, so the two failure files
// that format errors themselves take `side` again with `formatsErrors`, keeping their boundaries.
const errorName = '/^(error|thrown)$/';
const stringError = [
  {
    selector: `CallExpression[callee.name='String'][arguments.length=1][arguments.0.name=${errorName}]`,
    message: 'Print an error with failureText from src/shared/errors/failure.ts, not String(error).',
  },
  {
    selector: `TemplateLiteral > Identifier.expressions[name=${errorName}]`,
    message: 'Print an error with failureText from src/shared/errors/failure.ts, not ${error}.',
  },
];
const side = ({ folders, folderMessage, packages, packageMessage: message, builtins = [], formatsErrors = false }) => ({
  '@typescript-eslint/no-restricted-imports': ['error', {
    patterns: [
      { group: folders.map((folder) => `**/${folder}/**`), message: folderMessage },
      { group: packages, message, allowTypeImports: true },
    ],
    paths: builtins.map((name) => ({ name, message, allowTypeImports: true })),
  }],
  'no-restricted-syntax': ['error',
    { selector: `:matches(ImportExpression, TSImportType)[source.value=/${folderRegex(folders)}/]`, message: folderMessage },
    { selector: `ImportExpression[source.value=/${packageRegex(packages, builtins)}/]`, message },
    ...(formatsErrors ? [] : stringError),
  ],
});

const mainSide = {
  folders: ['renderer', 'preload'], folderMessage: 'Main never imports the renderer or the preload; move the type to src/shared.',
  packages: domOnly, packageMessage: 'DOM-only module in main.',
};
const sharedSide = {
  folders: ['main', 'renderer', 'preload'], folderMessage: 'Shared code imports only shared code.',
  packages: [...nodeOnly, ...domOnly], builtins: unprefixedBuiltins, packageMessage: 'Shared code runs in both processes.',
};

export default defineConfig(
  { ignores: ['.vite/', 'dist/', 'out/'] },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  // Every shape in src/ is a `type`, and the two are not interchangeable in the small ways that bite
  // later: an `interface` is open to declaration merging, a `type` is not. Taste a machine can hold.
  { rules: { '@typescript-eslint/consistent-type-definitions': ['error', 'type'] } },
  // One blank line apart at most; a stray second one is noise a diff then carries.
  { rules: { 'no-multiple-empty-lines': ['error', { max: 1 }] } },
  // 600 code lines a file (conventions-rule-4). Comments and blank lines do not count, so a file is
  // never split by deleting its explanation. An exception is a `files` override with its reason
  // (docs/conventions/hard-rules.md).
  { rules: { 'max-lines': ['error', { max: 600, skipComments: true, skipBlankLines: true }] } },
  // Process boundaries (app-rule-2). The folder a file sits in says which process runs it, and an
  // import across that line either drags Node into the renderer or the DOM into main. A type
  // import of a package is erased, so it passes; any import of another process's file fails, a
  // type one included, because the type belongs in src/shared. `eslint.config.test.ts` pins it.
  { files: ['src/renderer/**'], rules: side({
    folders: ['main', 'preload'], folderMessage: 'The renderer reaches main through the bridge; shared types live in src/shared.',
    packages: nodeOnly, builtins: unprefixedBuiltins, packageMessage: 'Node-only module in the renderer.',
  }) },
  { files: ['src/main/**'], rules: side(mainSide) },
  // `failureLine` is the command line's own formatter and prints a stack on purpose.
  { files: ['src/main/command/failure-line.ts'], rules: side({ ...mainSide, formatsErrors: true }) },
  // The preload runs in the window with `electron` and nothing else of Node's.
  { files: ['src/preload/**'], rules: side({
    folders: ['main', 'renderer'], folderMessage: 'The preload imports only src/shared.',
    packages: [...nodeOnly.filter((name) => name !== 'electron'), ...domOnly], builtins: unprefixedBuiltins,
    packageMessage: 'Only electron in the preload.',
  }) },
  { files: ['src/shared/**'], rules: side(sharedSide) },
  { files: ['src/shared/errors/failure.ts'], rules: side({ ...sharedSide, formatsErrors: true }) },
  // A test's folder comes from temporaryFolder() (workflow-rule-4). The core rule, not the typescript one
  // above, so this adds to the process boundaries instead of replacing them for test files.
  { files: ['src/**/*.test.ts', 'src/**/*-fixture.ts'], rules: { 'no-restricted-imports': ['error', {
    paths: ['node:fs', 'fs', 'node:fs/promises', 'fs/promises'].map((name) => ({
      name, importNames: ['mkdtemp', 'mkdtempSync'],
      message: 'Take a test folder from temporaryFolder() in src/main/testing/temporary-folder.ts; it removes it after the file.',
    })),
  }] } },
);
