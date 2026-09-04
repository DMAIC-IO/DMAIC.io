/**
 * D.Mike — Headless (no-browser) unit test runner.
 *
 * Runs the DOM-free unit suites directly in node — no Playwright, no Chromium,
 * no DOM emulation. It imports every `*.test.js` file that does not depend on a
 * live DOM (each registers its suites via the shared test-utils registry), then
 * runs them with `runAll()`.
 *
 *   node tests/run-node.mjs           # run all DOM-free suites
 *   node tests/run-node.mjs engines   # only files whose path contains "engines"
 *
 * Suites that need a real DOM/SVG layout, IndexedDB, or Alpine (module shells,
 * charts, datagrid, pages, storage, …) are listed in SKIP below and stay in the
 * browser Playwright bridge (test/playwright/tests-unit). A pure unit test —
 * models, engines, parsers — has no such dependency and belongs here.
 *
 * Exit code is non-zero when any test fails.
 */

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, relative } from 'node:path';

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));

// Fixture-driven tests load JSON via `fetch(new URL('../fixtures/…', import.meta.url))`.
// In the browser that base URL is http(s); under node it is a file:// URL, which
// node's global fetch rejects. Teach the global fetch to serve file:// from disk.
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input?.url ?? String(input);
  if (url.startsWith('file://')) {
    const body = await readFile(fileURLToPath(url), 'utf8');
    return {
      ok: true,
      status: 200,
      url,
      async json() { return JSON.parse(body); },
      async text() { return body; },
    };
  }
  return realFetch(input, init);
};

// DOM-dependent suites — run in the browser bridge, not here. Paths relative to
// this directory. Keep sorted; add a file here if it starts needing the DOM.
const SKIP = new Set([
  'algorithm-lab/lab-renderer.test.js',
  'core/action-verbs.test.js',
  'core/chart/cumulative-cost.test.js',
  'core/chart/gantt.test.js',
  'core/chart/trend.test.js',
  'core/create-dialog.test.js',
  'core/create-page.test.js',
  'core/datagrid-header-xss.test.js',
  'core/datagrid-locked-columns.test.js',
  'core/datagrid-roles.test.js',
  'core/dom.test.js',
  'core/flowchart-view-autosize.test.js',
  'core/help-renderer.test.js',
  'core/html-utils.test.js',
  'core/icon.test.js',
  'core/markdown-parser.test.js',
  'core/spacing-tokens.test.js',
  'core/state-manager.test.js',
  'core/storage/local-adapter.test.js',
  'core/template-module-imagepaths.test.js',
  'core/template-module-route.test.js',
  'core/template-module.test.js',
  'core/worksheet-pool.test.js',
  'core/workspace-detached.test.js',
  'dialogs/scenario-confirm-data.test.js',
  'modules/ishikawa-cost.test.js',
  'modules/ishikawa-gantt.test.js',
  'modules/ishikawa-trend.test.js',
  'modules/msa-typ6.test.js',
  'modules/project-charter-richtext.test.js',
  'modules/project-charter.test.js',
  'pages/cycle.test.js',
  'pages/settings.test.js',
  'pages/training.test.js',
  'startup/cross-version-prompt.test.js',
  'startup/example-deeplink.test.js',
  'startup/migration-notice.test.js',
  'ui/action-modal.test.js',
  'ui/dmaic-tiles-rebuild.test.js',
  'ui/modal-dialog-api.test.js',
  'ui/workspace-reset.test.js',
]);

/** Recursively collect every `*.test.js` file under `dir`. */
async function collectTestFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await collectTestFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
      out.push(full);
    }
  }
  return out;
}

const filter = process.argv[2] ?? '';
const all = (await collectTestFiles(TESTS_DIR)).sort();

let skipped = 0;
const files = all.filter((f) => {
  const rel = relative(TESTS_DIR, f);
  if (SKIP.has(rel)) { skipped++; return false; }
  return filter ? rel.includes(filter) : true;
});

if (files.length === 0) {
  console.error(`No test files found${filter ? ` matching "${filter}"` : ''}.`);
  process.exit(1);
}

// Importing a test file registers its suite()/test() calls in the shared
// registry inside test-utils.js.
const importErrors = [];
for (const file of files) {
  try {
    await import(pathToFileURL(file).href);
  } catch (err) {
    importErrors.push({ file: relative(TESTS_DIR, file), error: err });
  }
}

const { runAll } = await import('./test-utils.js');
const results = await runAll();

// ─── Report ──────────────────────────────────────────────────────────────────
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

for (const suite of results.suites) {
  if (suite.failed === 0) continue;
  console.log(`\n${RED}✗ ${suite.name}${RESET}`);
  for (const t of suite.tests) {
    if (t.status !== 'failed') continue;
    console.log(`  ${RED}✗${RESET} ${t.name}`);
    console.log(`    ${DIM}${t.error}${RESET}`);
  }
}

for (const { file, error } of importErrors) {
  console.log(`\n${RED}✗ failed to import ${file}${RESET}`);
  console.log(`  ${DIM}${error.message}${RESET}`);
}

console.log(
  `\n${GREEN}${results.passed} passed${RESET}, ` +
  `${results.failed ? RED : DIM}${results.failed} failed${RESET}, ` +
  `${YELLOW}${results.skipped} skipped${RESET}, ` +
  `${DIM}${results.todo} todo${RESET} ` +
  `${DIM}(${results.suites.length} suites, ${files.length} files; ` +
  `${skipped} DOM files run in the browser bridge)${RESET}`
);

process.exit(results.failed > 0 || importErrors.length > 0 ? 1 : 0);
