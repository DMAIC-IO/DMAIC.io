/**
 * D.Mike — headless browser test runner (deploy gate for the DOM suites).
 *
 * `npm run test:unit` covers only the DOM-free suites; everything listed in
 * SKIP there (module shells, charts, datagrid, pages, Alpine, storage, …) runs
 * in `tests/runner.html` against a real DOM. This script drives that page in
 * headless Chromium so those suites gate a release too, instead of being green
 * only in somebody's browser tab.
 *
 *   node tools/test-browser/run.mjs            # run, exit non-zero on failure
 *   node tools/test-browser/run.mjs --headed   # watch it in a real window
 *
 * The page runs as `SHARDS` parallel `runner.html?shard=k/n` pages, the same
 * split as the DDEV bridge: one page is single-threaded and with ~14 000 tests
 * no longer finishes within the timeout. Each shard has its own timeout; the
 * results are added up in summary.mjs, and any bad shard fails the run.
 *
 * Zero extra dependencies: `playwright` is already a devDependency. The
 * browser binary comes from `npx playwright install chromium`.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { chromium } from 'playwright';
import { SHARDS, summarize } from './summary.mjs';

// The callbacks handed to page.waitForFunction/page.evaluate are serialised and
// run inside the browser, not in this node process — `document` and `window`
// there are the page's, which eslint cannot know from a .mjs file.
/* global document, window */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HEADED = process.argv.includes('--headed');
// Per shard. The four shards together run what one page ran before.
const TIMEOUT_MS = 180_000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.csv': 'text/csv; charset=utf-8',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/**
 * Static file server over the repo root. The runner page resolves its
 * import-map entries against `../vendor/` and `../node_modules/`, so the
 * document root has to be the repo root — not `tests/`.
 * @returns {Promise<{origin: string, close: () => Promise<void>}>}
 */
async function serveRoot() {
  const server = createServer(async (req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const filePath = join(ROOT, normalize(urlPath));
    // Path traversal guard — the URL must stay inside the repo.
    if (filePath !== ROOT && !filePath.startsWith(ROOT + sep)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    try {
      const body = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });

  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((ok) => server.close(ok)),
  };
}

/**
 * Runs one shard in its own page and reports how it ended — never throws, so
 * a timed-out shard does not hide the results of the others.
 * @param {import('playwright').Browser} browser
 * @param {string} origin
 * @param {number} k
 * @returns {Promise<import('./summary.mjs').ShardOutcome>}
 */
async function runShard(browser, origin, k) {
  const outcome = { k, n: SHARDS, results: null, error: null, pageErrors: [] };
  const started = Date.now();
  // Same pinned time zone as tests/run-node.mjs — CI runners default to UTC.
  const page = await browser.newPage({ timezoneId: 'Europe/Berlin' });
  // Surface page-level breakage the suites themselves cannot report.
  page.on('pageerror', (err) => outcome.pageErrors.push(err.message));
  try {
    await page.goto(`${origin}/tests/runner.html?shard=${k}/${SHARDS}`, { waitUntil: 'load' });
    // `data-test-run="done"` is set only after every suite finished — a crashed
    // or still-running load times out here instead of reading as green.
    await page.waitForFunction(
      () => document.body.dataset.testRun === 'done' && !!window.__testRunResults,
      null,
      { timeout: TIMEOUT_MS },
    );
    outcome.results = await page.evaluate(() => window.__testRunResults);
  } catch (err) {
    outcome.error = err.message;
  } finally {
    await page.close();
  }
  const r = outcome.results;
  console.log(
    `shard ${k}/${SHARDS}: ` +
    (r ? `${r.passed} passed, ${r.failed} failed, ${r.suiteCount} suites` : 'did not finish') +
    ` in ${((Date.now() - started) / 1000).toFixed(1)} s`,
  );
  return outcome;
}

const server = await serveRoot();

let browser;
let exitCode = 0;
try {
  // Inside the try: a missing browser binary must still shut the server down.
  browser = await chromium.launch({ headless: !HEADED });
  const started = Date.now();
  const shards = await Promise.all(
    Array.from({ length: SHARDS }, (_, i) => runShard(browser, server.origin, i + 1)),
  );
  const sum = summarize(shards);

  for (const f of sum.failures) {
    console.error(`\n✗ ${f.suite} (${f.shard})`);
    for (const t of f.tests) console.error(`  ✗ ${t.name}\n    ${t.error ?? ''}`);
  }
  if (sum.problems.length) console.error(`\nProblems:\n  ${sum.problems.join('\n  ')}`);

  console.log(
    `\n${sum.passed} passed, ${sum.failed} failed, ${sum.skipped} skipped, ${sum.todo} todo ` +
    `(${sum.suiteCount} suites, ${SHARDS} shards, browser DOM runner, ` +
    `${((Date.now() - started) / 1000).toFixed(1)} s)`,
  );
  exitCode = sum.exitCode;
} catch (err) {
  console.error(`Browser test run failed: ${err.message}`);
  exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
}

process.exit(exitCode);
