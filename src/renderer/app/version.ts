// Which build of this app you are looking at: package.json's version plus the commit it was built from,
// `2.41.3+df3aad4`. What the manager page prints it for is that page's to say; the help dialog's
// manager blurb says it in full.
//
// A build-time constant vite.build-version.ts bakes in, rather than an answer over the bridge, so the
// foot of the manager page is never blank for a tick while an answer travels. package.json moves only
// on a release, so the commit is the part that tells a build six merges behind from main.
export const APP_VERSION = __BUILD_VERSION__;
