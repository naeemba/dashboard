// CI's check that a pull request leaves package.json's version alone (workflow-rule-3). The entry is
// scripts/version-unchanged-step.mjs, kept apart so importing this file never runs the check.

// Why the pull request is refused, or '' when its version is the base's.
export function versionRefusal(baseVersion, headVersion) {
  if (baseVersion === headVersion) return '';
  return `package.json version moved from ${baseVersion} to ${headVersion}. A card leaves it alone; only the Release workflow bumps it (workflow-rule-3). Put it back to ${baseVersion}.`;
}
