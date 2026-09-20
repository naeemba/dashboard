import { version } from '../package.json';

// Which build of this app you are looking at. The manager page prints it along its foot so an
// installed copy can be held up against the version on main: the number on screen is older than the
// one in package.json on the remote, and you know the copy in /Applications is behind.
//
// Read straight out of package.json rather than over the bridge, because it is a build-time constant
// and not something to ask main for. Two consequences worth knowing. It is baked in when `.vite` is
// built, which is the same moment forge takes the bundle's Info.plist version from that same file —
// so the foot of the page and "About Dashboard" can never disagree. And it is there on the first
// draw, so the foot of the manager page is never blank for a tick while an answer travels.
export const APP_VERSION: string = version;
