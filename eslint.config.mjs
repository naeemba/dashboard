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
const side = ({ folders, folderMessage, packages, packageMessage: message, builtins = [] }) => ({
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
  ],
});

export default defineConfig(
  { ignores: ['.vite/', 'dist/', 'out/'] },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  // Every shape in src/ is a `type`, and the two are not interchangeable in the small ways that bite
  // later: an `interface` is open to declaration merging, a `type` is not. Taste a machine can hold.
  { rules: { '@typescript-eslint/consistent-type-definitions': ['error', 'type'] } },
  // One blank line apart at most; a stray second one is noise a diff then carries.
  { rules: { 'no-multiple-empty-lines': ['error', { max: 1 }] } },
  // Process boundaries (app-rule-2). The folder a file sits in says which process runs it, and an
  // import across that line either drags Node into the renderer or the DOM into main. A type
  // import of a package is erased, so it passes; any import of another process's file fails, a
  // type one included, because the type belongs in src/shared. `eslint.config.test.ts` pins it.
  { files: ['src/renderer/**'], rules: side({
    folders: ['main', 'preload'], folderMessage: 'The renderer reaches main through the bridge; shared types live in src/shared.',
    packages: nodeOnly, builtins: unprefixedBuiltins, packageMessage: 'Node-only module in the renderer.',
  }) },
  { files: ['src/main/**'], rules: side({
    folders: ['renderer', 'preload'], folderMessage: 'Main never imports the renderer or the preload; move the type to src/shared.',
    packages: domOnly, packageMessage: 'DOM-only module in main.',
  }) },
  // The preload runs in the window with `electron` and nothing else of Node's.
  { files: ['src/preload/**'], rules: side({
    folders: ['main', 'renderer'], folderMessage: 'The preload imports only src/shared.',
    packages: domOnly, packageMessage: 'DOM-only module in the preload.',
  }) },
  { files: ['src/shared/**'], rules: side({
    folders: ['main', 'renderer', 'preload'], folderMessage: 'Shared code imports only shared code.',
    packages: [...nodeOnly, ...domOnly], builtins: unprefixedBuiltins, packageMessage: 'Shared code runs in both processes.',
  }) },
);
