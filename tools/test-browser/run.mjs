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
 * Zero extra dependencies: `playwright` is already a devDependency. The
 * browser binary comes from `npx playwright install chromium`.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HEADED = process.argv.includes('--headed');
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

const server = await serveRoot();

// Surface page-level breakage the suites themselves cannot report.
const pageErrors = [];
let browser;
let exitCode = 0;
try {
  // Inside the try: a missing browser binary must still shut the server down.
  browser = await chromium.launch({ headless: !HEADED });
  const page = await browser.newPage();
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto(`${server.origin}/tests/runner.html`, { waitUntil: 'load' });

  // `data-test-run="done"` is set only after every suite finished — a crashed
  // or still-running load times out here instead of reading as green.
  await page.waitForFunction(
    () => document.body.dataset.testRun === 'done' && !!window.__testRunResults,
    null,
    { timeout: TIMEOUT_MS },
  );

  const r = await page.evaluate(() => window.__testRunResults);

  for (const f of r.failures) {
    console.error(`\n✗ ${f.suite}`);
    for (const t of f.tests) console.error(`  ✗ ${t.name}\n    ${t.error ?? ''}`);
  }

  console.log(
    `\n${r.passed} passed, ${r.failed} failed, ${r.skipped} skipped, ${r.todo} todo ` +
    `(${r.suiteCount} suites, browser DOM runner)`,
  );

  if (r.failed > 0) exitCode = 1;

  // A run that finds nothing means the loader broke, not that all is well.
  if (r.suiteCount === 0) {
    console.error('No suites ran — tests/runner.html loaded nothing.');
    exitCode = 1;
  }
} catch (err) {
  console.error(`Browser test run failed: ${err.message}`);
  exitCode = 1;
} finally {
  if (pageErrors.length) {
    console.error(`\nUncaught page errors:\n  ${pageErrors.join('\n  ')}`);
    exitCode = 1;
  }
  await browser?.close();
  await server.close();
}

process.exit(exitCode);
