import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const nodePty = '/node_modules/node-pty';
// build/Release, not prebuilds/: it is the one directory node-pty looks in first, and the copy
// there has spawn-helper's exec bit, without which posix_spawnp fails. scripts/node-pty-built.sh
// is what puts it there in a checkout npm left with prebuilds/ alone.
const keep = [
  '/.vite',
  '/package.json',
  `${nodePty}/package.json`,
  `${nodePty}/lib`,
  `${nodePty}/build/Release/pty.node`,
  `${nodePty}/build/Release/spawn-helper`,
];

const config: ForgeConfig = {
  packagerConfig: {
    // node-pty runs spawn-helper from app.asar.unpacked, so the whole package must be unpacked.
    // board-cli-entry.js is unpacked for a different reason: it is run by `node`, not by Electron, and
    // node cannot read a file inside an asar. main.ts points agents at the unpacked copy.
    asar: { unpack: '{**/node_modules/node-pty/**,**/.vite/build/board-cli-entry.js}' },
    // Re-sign the bundle. A packaged app otherwise keeps the prebuilt Electron binary's signature,
    // which still calls itself com.github.Electron while Info.plist says com.electron.dashboard.
    // macOS files an app with Notification Center under the *signing* name, so a Dashboard that
    // disagrees with itself never appears in System Settings > Notifications and every banner it
    // raises is dropped, with no error anywhere to say why.
    // "Dashboard Local" is a self-signed code-signing certificate in the login keychain, not a
    // Developer ID. An ad hoc signature would do for Notification Center, but macOS remembers folder
    // access (Documents, Desktop, ...) against an ad hoc app's exact hash, so every rebuild asked for
    // every folder again. Against a certificate it remembers "this id, signed by this certificate",
    // which survives rebuilds. Delete or recreate the certificate and the prompts return once.
    // README.md's Install section says how to make it.
    // identityValidation off: the certificate is untrusted, so the signer would refuse to find it.
    // hardenedRuntime off: it turns on library validation, and a self-signed certificate has no team
    // identity, so the app binary is refused its own Electron Framework and the app dies at launch
    // with "different Team IDs". Hardened runtime only buys notarization, which this build cannot
    // have anyway. timestamp none: a real certificate makes the signer ask Apple's timestamp server
    // for every file, which buys nothing here and takes half a second each.
    // continueOnError off: the packager otherwise turns any signing failure (certificate missing,
    // keychain locked, two certificates with this name) into one warning line and ships the
    // prebuilt binary's signature, and scripts/rebuild.sh installs it over the working app.
    osxSign: {
      continueOnError: false,
      identity: 'Dashboard Local',
      identityValidation: false,
      optionsForFile: () => ({ hardenedRuntime: false, timestamp: 'none' }),
    },
    // The Vite plugin's default ignore keeps only .vite/. node-pty is external, so copy what it
    // loads at runtime: package.json, lib/, and the native binary (~400 KB of 63 MB).
    // A directory that is ignored is never entered, so ancestors of kept paths must be kept too.
    ignore: (file) =>
      file !== '' &&
      !keep.some((path) => file.startsWith(path + '/') || (path + '/').startsWith(file + '/')),
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
        // The `board` command. Built beside main because it is the same kind of thing — a Node
        // program, not a page — and shipped in the bundle so an agent in any project can run it.
        // `vite.board-cli.config.ts` extends main's config and owns the entry and the file name, so
        // `entry` here is only the label Forge prints while building; move the file there, not here.
        {
          entry: 'src/board-cli-entry.ts',
          config: 'vite.board-cli.config.ts',
          target: 'main',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
