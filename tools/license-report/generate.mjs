#!/usr/bin/env node
/**
 * generate — standalone license-artifact generator.
 *
 * CLI:
 *   node tools/license-report/generate.mjs           # write both artifacts
 *   node tools/license-report/generate.mjs --check   # compare in-memory vs committed; exit 1 if stale
 *
 * Invoked automatically via the postinstall npm hook so artifacts stay current
 * after every `npm install` / `npm ci` / `npm update`.
 *
 * Zero dependencies: only node:fs / node:path / node:url.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  collectLicenseData,
  renderLicenseDataModule,
  renderLicenseText,
} from './license-report.mjs';

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const TXT_PATH = join(APP_DIR, 'THIRD-PARTY-LICENSES.txt');
const JS_PATH  = join(APP_DIR, 'js', 'pages', 'licenses', 'licenses-data.generated.js');

const CHECK_MODE = process.argv.includes('--check');

const entries = await collectLicenseData(APP_DIR);
const txtContent = renderLicenseText(entries);
const jsContent  = renderLicenseDataModule(entries);

if (CHECK_MODE) {
  let stale = false;

  for (const [label, path, generated] of [
    ['THIRD-PARTY-LICENSES.txt', TXT_PATH, txtContent],
    ['js/pages/licenses/licenses-data.generated.js', JS_PATH, jsContent],
  ]) {
    if (!existsSync(path)) {
      console.error(`STALE: ${label} does not exist on disk.`);
      stale = true;
      continue;
    }
    const committed = readFileSync(path, 'utf8');
    if (committed !== generated) {
      console.error(`STALE: ${label} differs from what the generator would produce.`);
      stale = true;
    }
  }

  if (stale) {
    console.error(
      "Run 'npm install' (or 'npm run licenses') and commit " +
      'THIRD-PARTY-LICENSES.txt + js/pages/licenses/licenses-data.generated.js.',
    );
    process.exit(1);
  }

  console.log('OK: license artifacts are up to date.');
  process.exit(0);
}

// Write mode (default)
mkdirSync(dirname(JS_PATH), { recursive: true });
writeFileSync(TXT_PATH, txtContent, 'utf8');
writeFileSync(JS_PATH,  jsContent,  'utf8');
console.log(
  `license-report: wrote THIRD-PARTY-LICENSES.txt and js/pages/licenses/licenses-data.generated.js`,
);
