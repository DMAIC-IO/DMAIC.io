/**
 * D.Mike — consistency check between the two hand-kept test file lists.
 *
 * Which suite runs where is decided in two places: SKIP in tests/run-node.mjs
 * (DOM-dependent files the node runner leaves out) and the `testFiles` import
 * list in tests/runner.html (what the browser bridge loads). Nothing tied the
 * two together, so a file listed only in SKIP ran nowhere — silently. This
 * module turns that into a hard failure of the node runner.
 *
 * The opposite drift (a DOM file only in runner.html) already fails loudly:
 * the node runner imports it and hits `document is not defined`.
 */

/**
 * Extract the entries of the `testFiles` array from tests/runner.html.
 *
 * @param {string} html - Contents of tests/runner.html.
 * @returns {string[]} Paths relative to tests/, without the leading `./`.
 * @throws {Error} When no `testFiles` array is found.
 */
export function parseRunnerFiles(html) {
  const block = html.match(/const\s+testFiles\s*=\s*\[([\s\S]*?)\]/);
  if (!block) throw new Error('runner.html: no `const testFiles = [...]` array found');
  return [...block[1].matchAll(/['"]\.\/([^'"]+)['"]/g)].map((m) => m[1]);
}

/**
 * Check that every SKIP entry exists and is imported by the browser runner.
 *
 * @param {object} lists
 * @param {Iterable<string>} lists.skip - SKIP entries from run-node.mjs.
 * @param {Iterable<string>} lists.browserFiles - Files runner.html imports.
 * @param {Iterable<string>} lists.testFiles - All `*.test.js` files on disk.
 * @returns {string[]} One message per problem; empty when consistent.
 */
export function checkSkipList({ skip, browserFiles, testFiles }) {
  const inBrowser = new Set(browserFiles);
  const onDisk = new Set(testFiles);
  const problems = [];
  for (const file of skip) {
    if (!onDisk.has(file)) {
      problems.push(`${file}: listed in SKIP (run-node.mjs) but does not exist — remove the entry`);
    } else if (!inBrowser.has(file)) {
      problems.push(`${file}: skipped by run-node.mjs and missing from runner.html — it runs nowhere`);
    }
  }
  return problems;
}
