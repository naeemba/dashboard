/// <reference types="vite/client" />
/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />

// The build's version and commit, `<package.json version>+<12-digit commit>`; set by vite.build-version.ts.
declare const __BUILD_VERSION__: string;

// The merged pull requests the build was made after, newest first; set by vite.changelog.ts.
declare const __CHANGELOG__: import('./src/shared/app/whats-new').Changelog;
