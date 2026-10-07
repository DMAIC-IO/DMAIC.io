#!/usr/bin/env node
/**
 * build — production bundle for app/dev.
 * Bundles js/app.js -> js/app.min.js + js/chunks/*.min.js (eval-free,
 * CSP-safe, minified); the chunk list goes into index.html as a manifest.
 *
 * CLI:
 *   node tools/build/build.mjs           # full build
 *   node tools/build/build.mjs --check   # exit 1 if any artifact is stale
 *   node tools/build/build.mjs --watch   # rebuild on change (dev daemon)
 */
import { build as esbuild } from 'esbuild';
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync, renameSync, readdirSync, statSync, watch } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { renderIndexHtml } from '../build-templates/build.mjs';
import { collectLabData, renderLabDataModule } from './lab-data.mjs';
import { collectHelpIds, renderHelpRegistryModule } from './help-data.mjs';
import { collectReferenceIds, renderReferencesRegistryModule } from './references-data.mjs';
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
 * @param {{ write?: boolean, writeOutput?: (path: string, contents: Uint8Array) => Promise<void> }} opts
 *   write:false → in-memory only, no file written; writeOutput → per-file writer (tests)
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

/** esbuild options for the app bundle — shared by build, check and tests. */
export function jsBuildOptions(appDir = APP_DIR) {
  return {
    absWorkingDir: appDir,
    entryPoints: [join(appDir, 'js', 'app.js')],
    bundle: true,
    splitting: true,
    minify: true,
    format: 'esm',
    target: 'es2022',
    sourcemap: true,
    legalComments: 'external',
    outdir: join(appDir, 'js'),
    entryNames: 'app.min',
    chunkNames: 'chunks/[name]-[hash].min',
    metafile: true,
    write: false,
  };
}

/**
 * Outputs reachable from the entry through static imports, and their inputs.
 * Dynamic imports (`import()`) end the walk — that is what splits.
 * @param {object} metafile  esbuild metafile (paths relative to absWorkingDir)
 * @param {string} [entryOut]
 * @returns {{ outputs: Set<string>, inputs: Set<string> }}
 */
export function staticClosure(metafile, entryOut = 'js/app.min.js') {
  const outputs = new Set();
  const inputs = new Set();
  const visit = (out) => {
    if (outputs.has(out) || !metafile.outputs[out]) return;
    outputs.add(out);
    for (const input of Object.keys(metafile.outputs[out].inputs)) inputs.add(input);
    for (const imp of metafile.outputs[out].imports) {
      if (imp.kind === 'import-statement' && !imp.external) visit(imp.path);
    }
  };
  visit(entryOut);
  return { outputs, inputs };
}

/**
 * Bundle js/app.js into js/app.min.js plus js/chunks/*.min.js.
 * Every JS output is checked eval-free. With write:true new files are written
 * first and stale chunks removed afterwards, so the chunk set on disk is never
 * incomplete (a watcher-triggered rebuild during a test run).
 * @param {string} appDir
 * @param {{ write?: boolean }} opts  write:false → in-memory only, no file written
 * @returns {Promise<{ outfile: string, code: string, chunks: string[], metafile: object, outputFiles: object[] }>}
 */
export async function bundleJs(appDir = APP_DIR, { write = true, writeOutput = writeOutputAtomic } = {}) {
  const outfile = join(appDir, 'js', 'app.min.js');
  const result = await esbuild(jsBuildOptions(appDir));
  const chunkDir = join(appDir, 'js', 'chunks');
  const chunks = [];
  let code = '';
  for (const f of result.outputFiles) {
    if (!f.path.endsWith('.js')) continue;
    try { assertEvalFree(f.text); } catch (e) { throw new Error(`${f.path}: ${e.message}`); }
    if (f.path === outfile) code = f.text;
    else if (dirname(f.path) === chunkDir) chunks.push(`js/chunks/${f.path.slice(chunkDir.length + 1)}`);
  }
  chunks.sort();
  if (write) {
    await mkdir(chunkDir, { recursive: true });
    // Chunks first, the entry (and its map) last: a page loading the new
    // entry mid-rebuild finds every chunk it imports already on disk.
    const isEntry = (p) => p === outfile || p === `${outfile}.map`;
    const ordered = [...result.outputFiles].sort((a, b) => isEntry(a.path) - isEntry(b.path));
    for (const f of ordered) await writeOutput(f.path, f.contents);
    const keep = new Set(result.outputFiles.map((f) => f.path));
    for (const name of readdirSync(chunkDir)) {
      const p = join(chunkDir, name);
      if (!keep.has(p)) unlinkSync(p);
    }
  }
  return { outfile, code, chunks, metafile: result.metafile, outputFiles: result.outputFiles };
}

/**
 * Write a build output via a temp file in the same directory plus rename, so
 * a reader never sees a half-written file. The watcher ignores `*.tmp`.
 * @param {string} path
 * @param {Uint8Array} contents
 * @returns {Promise<void>}
 */
export async function writeOutputAtomic(path, contents) {
  const tmpPath = `${path}.${process.pid}.tmp`;
  await writeFile(tmpPath, contents);
  renameSync(tmpPath, path);
}

/** Data-only manifest of every chunk (CSP-safe: not executable). */
export function buildChunkManifestBlock(chunks) {
  return `  <script type="application/json" id="chunk-manifest">${JSON.stringify(chunks)}</script>`;
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
 *   0. build-templates: Shell aus index.dist.html + inlined *.html-Templates
 *      rendern — nur in den Speicher, index.html wird hier nicht angefasst
 *   1. lab-data.generated.js
 *   2. JS bundle (esbuild, split: entry + js/chunks/)
 *   3. CSS bundle (esbuild)
 *   4. index.html rewrite with content-hashed <script>/<link> and the chunk manifest
 *
 * In check mode (check:true): regenerates the git-ignored index.html, and compares
 * the build artifacts (app.min.js, js/chunks/*.min.js, app.min.css, generated modules)
 * without writing them; returns the list of stale committed artifacts.
 * Returns { changed: string[] } — empty array means everything is up to date.
 *
 * @param {string} [appDir]
 * @param {{ check?: boolean }} [opts]
 * @returns {Promise<{ changed: string[] }>}
 */
export async function runBuild(appDir = APP_DIR, { check = false } = {}) {
  const changed = [];

  // 0. templates — die fertige Shell NUR in den Speicher rendern. Geschrieben
  //    wird index.html erst in Schritt 4, in einem Rutsch: sonst liegt die
  //    Datei zwischendurch im Dev-Entry-Zustand (Script-Tag auf js/app.js mit
  //    blanken Specifiern) und ein parallel laufender Testlauf sieht eine tote
  //    App-Shell.
  let html = renderIndexHtml(appDir);

  // 1. lab-data
  const labData = renderLabDataModule(await collectLabData(appDir));
  emit(join(appDir, 'js', 'algorithm-lab', 'lab-data.generated.js'), labData, check, changed);

  // 1b. help registry (eager static imports of every module handbook)
  const helpRegistry = renderHelpRegistryModule(collectHelpIds(appDir));
  emit(join(appDir, 'js', 'core', 'help-registry.generated.js'), helpRegistry, check, changed);

  // 1b2. references registry (eager static imports of every module's references)
  const referencesRegistry = renderReferencesRegistryModule(collectReferenceIds(appDir));
  emit(join(appDir, 'js', 'core', 'references-registry.generated.js'), referencesRegistry, check, changed);

  // 1c. glossary data (catalog + all terms inlined; no runtime fetch)
  const glossaryData = renderGlossaryDataModule(collectGlossaryData(appDir));
  emit(join(appDir, 'js', 'core', 'glossary-data.generated.js'), glossaryData, check, changed);

  // 1d. license data + THIRD-PARTY-LICENSES.txt
  const licenseEntries = await collectLicenseData(appDir);
  mkdirSync(join(appDir, 'js', 'pages', 'licenses'), { recursive: true });
  emit(join(appDir, 'js', 'pages', 'licenses', 'licenses-data.generated.js'), renderLicenseDataModule(licenseEntries), check, changed);
  emit(join(appDir, 'THIRD-PARTY-LICENSES.txt'), renderLicenseText(licenseEntries), check, changed);

  // 2. JS bundle (in check mode: in-memory only — compare, do not write)
  const { code: jsCode, chunks, outputFiles } = await bundleJs(appDir, { write: !check });
  if (check) {
    for (const f of outputFiles) {
      if (!f.path.endsWith('.js')) continue;
      const cur = existsSync(f.path) ? readFileSync(f.path, 'utf8') : null;
      if (cur !== f.text) changed.push(f.path);
    }
    const chunkDir = join(appDir, 'js', 'chunks');
    const expected = new Set(chunks.map((c) => join(appDir, c)));
    if (existsSync(chunkDir)) {
      for (const name of readdirSync(chunkDir)) {
        const p = join(chunkDir, name);
        if (name.endsWith('.min.js') && !expected.has(p)) changed.push(p);
      }
    }
  }

  // 3. CSS-Hrefs aus der in Schritt 0 gerenderten Shell lesen — nicht von der
  //    Platte. index.dist.html trägt immer die vollständige STYLES-Liste, also
  //    liefert readCssLinks die volle Quellliste, nie einen bereits ersetzten
  //    Bundle-Link.
  const indexPath = join(appDir, 'index.html');
  const hrefs = readCssLinks(html);
  const minCssPath = join(appDir, 'css', 'app.min.css');
  let cssCode;
  ({ code: cssCode } = await bundleCss(appDir, hrefs, { write: !check }));

  if (check) emit(minCssPath, cssCode, true, changed);

  // 4. index rewrite with content hashes — always write (index.html is git-ignored).
  //    index.html is NOT a committed artifact; it is never added to changed[].
  const jsHref  = `js/app.min.js?v=${hash8(jsCode)}`;
  const cssHref = `css/app.min.css?v=${hash8(cssCode)}`;
  const deJson  = readFileSync(join(appDir, 'i18n', 'de.json'), 'utf8');
  const enJson  = readFileSync(join(appDir, 'i18n', 'en.json'), 'utf8');
  const i18nHash = hash8(deJson + enJson);
  html = rewriteBlock(html, 'STYLES',  buildStylesBlock(cssHref));
  html = rewriteBlock(html, 'SCRIPTS', buildScriptsBlock(jsHref));
  html = rewriteBlock(html, 'CHUNKS',  buildChunkManifestBlock(chunks));
  html = rewriteBlock(html, 'I18N_VERSION',
    `  <meta name="i18n-version" content="${i18nHash}">`);
  // Atomar schreiben: ein parallel laufender Testlauf sieht entweder die alte
  // oder die neue Shell, nie eine halb geschriebene. Der Temp-Name ist
  // prozess-eindeutig (Watcher und manueller Build laufen sonst auf dieselbe
  // Datei) und liegt im selben Verzeichnis — nur dann ist renameSync atomar.
  const tmpPath = `${indexPath}.${process.pid}.tmp`;
  try {
    writeFileSync(tmpPath, html);
    renameSync(tmpPath, indexPath);
  } catch (err) {
    // Scheitert das Schreiben oder das Umbenennen, darf kein Torso liegen bleiben.
    try { unlinkSync(tmpPath); } catch { /* nie geschrieben oder schon weg */ }
    throw err;
  }

  return { changed };
}

/** Outputs of runBuild — changes to them must never retrigger the watcher. */
const WATCH_OUTPUTS = new Set(['index.html', 'package.json', 'package-lock.json', 'THIRD-PARTY-LICENSES.txt', join('css', 'app.min.css'), join('css', '_bundle_entry.css')]);
const WATCH_SKIP_DIRS = ['node_modules', '.git', 'tests', 'tools', 'docs', 'vendor'];
/** Subtree of a skipped directory that runBuild still reads: the lab fixtures. */
const WATCH_FIXTURE_DIR = join('tests', 'fixtures');

/** Whether `relPath` lies inside the lab fixture tree. */
function inFixtureDir(relPath) {
  return relPath === WATCH_FIXTURE_DIR || relPath.startsWith(WATCH_FIXTURE_DIR + sep);
}

/**
 * Whether the watcher must not descend into the directory `relPath`. The
 * fixture tree and its ancestors stay armed; everything else below a skipped
 * name does not.
 *
 * @param {string} relPath  directory path relative to the app root
 * @returns {boolean}
 */
function isSkippedDir(relPath) {
  if (inFixtureDir(relPath) || WATCH_FIXTURE_DIR.startsWith(relPath + sep)) return false;
  return relPath.split(/[\\/]/).some((p) => WATCH_SKIP_DIRS.includes(p) || p.startsWith('.'));
}

/**
 * Whether a changed file needs a rebuild that esbuild's watcher cannot see.
 * esbuild only follows the JS import graph; templates (inlined into the shell),
 * stylesheets, i18n, glossary JSON and the lab fixtures under tests/fixtures/
 * are read by runBuild itself.
 *
 * @param {string} relPath  path relative to the app root
 * @returns {boolean}
 */
export function isWatchedSource(relPath) {
  if (!relPath || WATCH_OUTPUTS.has(relPath)) return false;
  // Lab fixtures are inlined into lab-data.generated.js.
  if (inFixtureDir(relPath)) return relPath.endsWith('.json');
  const parts = relPath.split(/[\\/]/);
  if (parts.some((p) => WATCH_SKIP_DIRS.includes(p) || p.startsWith('.'))) return false;
  if (/\.(generated|min)\./.test(relPath) || relPath.endsWith('.tmp')) return false;
  return /\.(html|css|json)$/.test(relPath);
}

/**
 * Watch every directory under `root` non-recursively and report changed paths.
 *
 * Node's `{ recursive: true }` watcher on Linux arms each file by inode, so a
 * file replaced by rename — an editor's atomic save, `git checkout` — falls
 * silent for good. A directory watch reports its entries by name and survives
 * that. Directories created later are armed when they appear.
 *
 * @param {string} root
 * @param {(relPath: string) => void} onChange  path relative to `root`
 * @returns {(() => void) & { dirs: () => string[] }}  closes all watchers;
 *   `dirs()` lists the watched directories relative to `root`
 */
export function watchSourceTree(root, onChange) {
  const watchers = new Map();

  const arm = (rel) => {
    if (watchers.has(rel)) return;
    const abs = join(root, rel);
    let w;
    try {
      w = watch(abs, (_event, name) => {
        if (!name) return;
        const child = rel ? join(rel, name) : String(name);
        if (!isSkippedDir(child)) {
          try { if (statSync(join(root, child)).isDirectory()) arm(child); } catch { /* gone again */ }
        }
        onChange(child);
      });
    } catch { return; }
    w.on('error', () => { w.close(); watchers.delete(rel); });
    watchers.set(rel, w);
    let entries = [];
    try { entries = readdirSync(abs, { withFileTypes: true }); } catch { /* removed meanwhile */ }
    for (const e of entries) {
      const child = rel ? join(rel, e.name) : e.name;
      if (e.isDirectory() && !isSkippedDir(child)) arm(child);
    }
  };

  arm('');
  const close = () => { for (const w of watchers.values()) w.close(); watchers.clear(); };
  close.dirs = () => [...watchers.keys()];
  return close;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--watch')) {
    const { context } = await import('esbuild');
    // Use write:false so the context does not write app.min.js directly;
    // the full runBuild() (which calls bundleJs) owns all writes.
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
    // Templates, CSS and JSON are outside the JS import graph: watch them
    // separately and route them through the same onEnd full rebuild.
    let timer = null;
    watchSourceTree(APP_DIR, (file) => {
      if (!isWatchedSource(file)) return;
      clearTimeout(timer);
      timer = setTimeout(() => ctx.rebuild().catch((e) => console.error(e.message)), 150);
    });
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

// Nur als CLI ausführen — nicht, wenn eine andere build.mjs dieses Modul
// importiert (ein endsWith('build.mjs')-Test würde dort mitfeuern).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
