#!/usr/bin/env node
/**
 * build — production bundle for app/dev.
 * Bundles js/app.js -> js/app.min.js (eval-free, CSP-safe), minified.
 *
 * CLI:
 *   node tools/build/build.mjs           # full build
 *   node tools/build/build.mjs --check   # exit 1 if any artifact is stale
 *   node tools/build/build.mjs --watch   # rebuild on change (dev daemon)
 */
import { build as esbuild } from 'esbuild';
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { collectLabData, renderLabDataModule } from './lab-data.mjs';
import { collectHelpIds, renderHelpRegistryModule } from './help-data.mjs';
import { collectGlossaryData, renderGlossaryDataModule } from './glossary-data.mjs';
import { collectLicenseData, renderLicenseDataModule, renderLicenseText } from '../license-report/license-report.mjs';

export const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Throw if bundled output would violate the strict CSP (no eval / new Function). */
export function assertEvalFree(code) {
  if (/\beval\s*\(/.test(code)) throw new Error('bundle contains eval(');
  if (/\bnew\s+Function\b/.test(code)) throw new Error('bundle contains new Function');
}

/** Ordered stylesheet hrefs from index.html (rel="stylesheet" only, vendor/ excluded). */
export function readCssLinks(indexHtml) {
  const out = [];
  const re = /<link\b[^>]*>/gi;
  let m;
  while ((m = re.exec(indexHtml)) !== null) {
    const tag = m[0];
    if (!/\brel=["']stylesheet["']/i.test(tag)) continue;
    const hrefMatch = /\bhref=["']([^"']+)["']/i.exec(tag);
    if (hrefMatch && !hrefMatch[1].startsWith('vendor/')) out.push(hrefMatch[1]);
  }
  return out;
}

/**
 * Bundle all stylesheets (in cascade order) into css/app.min.css. Returns {outfile, code}.
 * @param {string} appDir
 * @param {string[]} hrefs
 * @param {{ write?: boolean }} opts  write:false → in-memory only, no file written
 */
/** Third-party CSS folded into the bundle from node_modules (single include). */
const VENDOR_CSS = [
  ['katex', 'dist', 'katex.min.css'],   // KaTeX (references KaTeX_*.woff2 fonts)
  ['prismjs', 'themes', 'prism.css'],   // Prism light theme (no url() assets)
];

export async function bundleCss(appDir = APP_DIR, hrefs, { write = true } = {}) {
  const outfile = join(appDir, 'css', 'app.min.css');
  const entryFile = join(appDir, 'css', '_bundle_entry.css');
  // Temporary entry that @imports each app stylesheet in cascade order, then
  // the vendor CSS from node_modules. esbuild resolves KaTeX's url(fonts/…)
  // and copies the font files to css/fonts/ (assetNames below), rewriting the
  // url() to a relative path that resolves next to app.min.css at runtime.
  const imports = [
    ...hrefs.map(href => `@import "${join(appDir, href)}";`),
    ...VENDOR_CSS.map(seg => `@import "${join(appDir, 'node_modules', ...seg)}";`),
  ].join('\n');
  writeFileSync(entryFile, imports, 'utf8');
  const opts = {
    entryPoints: [entryFile],
    bundle: true,
    minify: true,
    outfile,
    // Copy font assets deterministically (no content hash) so `--check`
    // produces byte-identical CSS across runs.
    loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file' },
    assetNames: 'fonts/[name]',
  };
  let code;
  try {
    if (write) {
      await esbuild(opts);
      code = readFileSync(outfile, 'utf8');
    } else {
      const result = await esbuild({ ...opts, write: false });
      code = result.outputFiles.find(f => f.path.endsWith('.css')).text;
    }
  } finally {
    try { unlinkSync(entryFile); } catch { /* temp entry already removed */ }
  }
  return { outfile, code };
}

/** 8-character hex content hash (SHA-256 truncated). */
export function hash8(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 8);
}

/**
 * Replace the content between <!-- name:START --> and <!-- name:END --> markers.
 * Markers themselves are preserved (including any leading whitespace/indentation).
 * Throws if markers are missing.
 */
export function rewriteBlock(html, name, replacement) {
  // Escape literal marker text for use inside RegExp, then allow optional leading whitespace
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const startPat = `([ \\t]*${esc(`<!-- ${name}:START -->`)})`;
  const endPat   = `([ \\t]*${esc(`<!-- ${name}:END -->`)})`;
  const re = new RegExp(`${startPat}\\n[\\s\\S]*?\\n${endPat}`);
  if (!re.test(html)) throw new Error(`marker ${name} not found in index.html`);
  return html.replace(re, `$1\n${replacement}\n$2`);
}

/** Single hashed stylesheet link for the bundled CSS. */
export function buildStylesBlock(cssHref) {
  return `  <link rel="stylesheet" href="${cssHref}">`;
}

/** Single app-module bootstrap script (vendor libs are bundled into app.min.js). */
export function buildScriptsBlock(jsHref) {
  return [
    '  <!-- ── Application bootstrap ──────────────────────────────────── -->',
    `  <script type="module" src="${jsHref}"></script>`,
  ].join('\n');
}

/**
 * Bundle a single entry point to an output file (write mode only).
 * Runs assertEvalFree on every bundle for CSP safety.
 * @param {string} entry  absolute path to entry JS file
 * @param {string} outfile  absolute path for the emitted bundle
 */
async function bundleOne(entry, outfile) {
  const result = await esbuild({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    format: 'esm',
    target: 'es2022',
    sourcemap: true,
    legalComments: 'external',
    outfile,
    write: false,
  });
  const code = result.outputFiles.find((f) => f.path.endsWith('.js'))?.text ?? '';
  assertEvalFree(code);
  await mkdir(dirname(outfile), { recursive: true });
  for (const f of result.outputFiles) await writeFile(f.path, f.contents);
}

/**
 * Bundle the app module tree into js/app.min.js.
 * Returns {outfile, code} for the primary web bundle.
 * @param {string} appDir
 * @param {{ write?: boolean }} opts  write:false → in-memory only, no file written
 */
export async function bundleJs(appDir = APP_DIR, { write = true } = {}) {
  const outfile = join(appDir, 'js', 'app.min.js');
  let code;
  if (write) {
    await bundleOne(join(appDir, 'js', 'app.js'), outfile);
    code = readFileSync(outfile, 'utf8');
  } else {
    // In check/dry-run mode: build without sourcemap so the output is comparable
    // to the on-disk bundle (minus its external sourceMappingURL comment).
    const result = await esbuild({
      entryPoints: [join(appDir, 'js', 'app.js')],
      bundle: true,
      minify: true,
      format: 'esm',
      target: 'es2022',
      sourcemap: false,
      legalComments: 'none',
      write: false,
    });
    code = result.outputFiles[0].text;
    assertEvalFree(code);
  }
  return { outfile, code };
}

/**
 * Write `text` to `path`; in check mode, record path if it would change.
 * @param {string} path
 * @param {string} text
 * @param {boolean} check
 * @param {string[]} changed
 */
function emit(path, text, check, changed) {
  const cur = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (cur === text) return;
  if (check) { changed.push(path); return; }
  writeFileSync(path, text);
}

/**
 * Full build orchestrator.
 *
 * Steps:
 *   0. build-templates (inline *.html partials into index.html)
 *   1. lab-data.generated.js
 *   2. JS bundle (esbuild)
 *   3. CSS bundle (esbuild)
 *   4. index.html rewrite with content-hashed <script>/<link>
 *
 * In check mode (check:true): regenerates the git-ignored index.html, and compares
 * the committed artifacts (app.min.js/.map, app.min.css, lab-data.generated.js) without
 * writing them; returns the list of stale committed artifacts.
 * Returns { changed: string[] } — empty array means everything is up to date.
 *
 * @param {string} [appDir]
 * @param {{ check?: boolean }} [opts]
 * @returns {Promise<{ changed: string[] }>}
 */
export async function runBuild(appDir = APP_DIR, { check = false } = {}) {
  const changed = [];

  // 0. templates — always generate index.html from index.dist.html (write mode).
  //    index.html is git-ignored and generated; it must exist for readCssLinks below.
  execFileSync('node', [
    join(appDir, 'tools', 'build-templates', 'build.mjs'),
  ], { cwd: appDir, stdio: 'inherit' });

  // 1. lab-data
  const labData = renderLabDataModule(await collectLabData(appDir));
  emit(join(appDir, 'js', 'algorithm-lab', 'lab-data.generated.js'), labData, check, changed);

  // 1b. help registry (eager static imports of every module handbook)
  const helpRegistry = renderHelpRegistryModule(collectHelpIds(appDir));
  emit(join(appDir, 'js', 'core', 'help-registry.generated.js'), helpRegistry, check, changed);

  // 1c. glossary data (catalog + all terms inlined; no runtime fetch)
  const glossaryData = renderGlossaryDataModule(collectGlossaryData(appDir));
  emit(join(appDir, 'js', 'core', 'glossary-data.generated.js'), glossaryData, check, changed);

  // 1d. license data + THIRD-PARTY-LICENSES.txt
  const licenseEntries = await collectLicenseData(appDir);
  mkdirSync(join(appDir, 'js', 'pages', 'licenses'), { recursive: true });
  emit(join(appDir, 'js', 'pages', 'licenses', 'licenses-data.generated.js'), renderLicenseDataModule(licenseEntries), check, changed);
  emit(join(appDir, 'THIRD-PARTY-LICENSES.txt'), renderLicenseText(licenseEntries), check, changed);

  // 2. JS bundle (in check mode: in-memory only — do NOT mutate app.min.js)
  const { code: jsCode } = await bundleJs(appDir, { write: !check });

  // 3. Read the generated index.html (sourced from index.dist.html) for CSS hrefs.
  //    index.dist.html always has the full 74-link STYLES list, so readCssLinks
  //    always returns the full source list — never a self-overwritten bundle link.
  const indexPath = join(appDir, 'index.html');
  let html = readFileSync(indexPath, 'utf8');
  const hrefs = readCssLinks(html);
  const minCssPath = join(appDir, 'css', 'app.min.css');
  let cssCode;
  ({ code: cssCode } = await bundleCss(appDir, hrefs, { write: !check }));

  // Determine the content to hash for generating the versioned URLs.
  // In check mode: use the on-disk bundles (if they exist) so the hash matches
  // what was written by the last real build — allowing correct index.html comparison.
  // In build mode: jsCode/cssCode are the freshly written bundles.
  let jsCodeForHash = jsCode;
  let cssCodeForHash = cssCode;

  if (check) {
    const jsOnDiskPath = join(appDir, 'js', 'app.min.js');
    // Compare in-memory (no sourcemap) vs on-disk (has sourcemap comment).
    // Strip the trailing sourceMappingURL line from the on-disk version to compare JS body.
    if (existsSync(jsOnDiskPath)) {
      const jsOnDisk = readFileSync(jsOnDiskPath, 'utf8');
      jsCodeForHash = jsOnDisk; // use on-disk content for the hash
      const jsOnDiskStripped = jsOnDisk.replace(/\/\/# sourceMappingURL=\S+\s*$/, '').trimEnd() + '\n';
      const jsNorm = jsCode.trimEnd() + '\n';
      if (jsOnDiskStripped !== jsNorm) changed.push(jsOnDiskPath);
    } else {
      changed.push(jsOnDiskPath);
    }
    emit(minCssPath, cssCode, true, changed);
  }

  // 4. index rewrite with content hashes — always write (index.html is git-ignored).
  //    index.html is NOT a committed artifact; it is never added to changed[].
  const jsHref  = `js/app.min.js?v=${hash8(jsCodeForHash)}`;
  const cssHref = `css/app.min.css?v=${hash8(cssCodeForHash)}`;
  html = rewriteBlock(html, 'STYLES',  buildStylesBlock(cssHref));
  html = rewriteBlock(html, 'SCRIPTS', buildScriptsBlock(jsHref));
  writeFileSync(indexPath, html);

  return { changed };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--watch')) {
    const { context } = await import('esbuild');
    // Use write:false so the context does not write app.min.js directly;
    // the full runBuild() (which calls bundleJs + bundleOne) owns all writes.
    const ctx = await context({
      entryPoints: [join(APP_DIR, 'js', 'app.js')],
      bundle: true,
      minify: true,
      format: 'esm',
      target: 'es2022',
      sourcemap: true,
      legalComments: 'none',
      write: false,
      plugins: [{
        name: 'full-rebuild',
        setup(b) {
          b.onEnd(async () => {
            try {
              await runBuild(APP_DIR, { check: false });
              console.log('build: refreshed');
            } catch (e) {
              console.error(e.message);
            }
          });
        },
      }],
    });
    await ctx.watch();
    console.log('build: watching…');
    return;
  }

  const res = await runBuild(APP_DIR, { check: args.includes('--check') });
  if (args.includes('--check') && res.changed.length) {
    console.error('build: stale artifacts:\n' + res.changed.join('\n'));
    process.exit(1);
  }
  console.log('build: done');
}

if (process.argv[1] && process.argv[1].endsWith('build.mjs')) main();
