/**
 * D.Mike — Version Utilities (version-utils.js)
 * Semver comparison helpers used by the import compatibility check.
 */

/**
 * Parse a semver string into its components.
 * @param {string} version - e.g. '1.2.3'
 * @returns {{ major: number, minor: number, patch: number }}
 */
export function parseVersion(version) {
  const [major, minor, patch] = version.split('.').map(Number);
  return { major, minor, patch };
}

/**
 * Compare two semver strings.
 * @param {string} a
 * @param {string} b
 * @returns {-1 | 0 | 1} -1 if a < b, 0 if equal, 1 if a > b
 */
export function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}

/**
 * Check if two versions share the same MAJOR.MINOR.
 * PATCH differences are irrelevant for export compatibility.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function isSameMajorMinor(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  return pa.major === pb.major && pa.minor === pb.minor;
}

/**
 * Strip PATCH from a version string.
 * @param {string} version - e.g. '1.2.3'
 * @returns {string} e.g. '1.2'
 */
export function stripPatch(version) {
  const { major, minor } = parseVersion(version);
  return `${major}.${minor}`;
}
