// The in-app update, as both sides see it (docs/updates). Main reads the newest release off GitHub
// (src/main/update/release.ts) and moves through these states with the update actions
// (src/main/actions/update/); the screen draws the notice and the dialog from the state alone.

export type ReleaseAsset = { name: string; size: number; url: string };
// `version` is bare semver, no `v`. `notes` are the release body's What's new lines, `url` its page.
export type Release = { version: string; notes: string[]; url: string; assets: ReleaseAsset[] };

// `failure` is the last download or swap that failed, said on the dialog until the next try.
export type UpdateState =
  | { kind: 'none' }
  | { kind: 'available'; release: Release; failure?: string }
  | { kind: 'downloading'; release: Release }
  | { kind: 'staged'; release: Release; failure?: string };

export type UpdateRow = 'update' | 'restart' | 'whats-new';

export const UPDATE_ROW_LABELS: Record<UpdateRow, string> = {
  update: 'Update', restart: 'Restart to update', 'whats-new': "What's new",
};

// The rows the dialog walks: what can be done from here, and the notes once there is a release.
export function updateRows(state: UpdateState): UpdateRow[] {
  switch (state.kind) {
    case 'available': return ['update', 'whats-new'];
    case 'downloading': return ['whats-new'];
    case 'staged': return ['restart', 'whats-new'];
    case 'none': return [];
  }
}

// The dialog's title. `running` is the build stamp; only its version is said.
export function updateTitle(state: UpdateState, running: string): string {
  switch (state.kind) {
    case 'available': return `Dashboard v${state.release.version} is out`;
    case 'downloading': return `Downloading Dashboard v${state.release.version}…`;
    case 'staged': return `Dashboard v${state.release.version} is ready`;
    case 'none': return `Dashboard v${running.split('+')[0]} is the newest release`;
  }
}

// What the status bar says, unasked, once there is something to do; empty clears it. `key` is the
// binding that opens the dialog, as the help dialog spells it.
export function updateNotice(state: UpdateState, key: string): string {
  if (state.kind === 'available') return `Dashboard v${state.release.version} is out · ${key} to update`;
  if (state.kind === 'staged') return `Dashboard v${state.release.version} is ready · ${key} to restart into it`;
  return '';
}
