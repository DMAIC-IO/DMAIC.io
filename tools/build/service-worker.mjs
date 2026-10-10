/**
 * Service worker build step: the precache list, its version, and the bundled
 * sw.js. runBuild (build.mjs) calls these after the shell is rendered.
 * Spec: docs/superpowers/specs/2026-10-10-service-worker-offline-design.md
 */
import { build as esbuild } from 'esbuild';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

/** Trees precached as a whole, any depth. */
const TREES = ['examples', 'js/algorithm-lab/algorithms'];

/** Single directories and the file names taken from each. */
const FLAT = [
  ['assets', /\.svg$/],
  ['assets/fonts', /\.(woff2|ttf)$/],   // .ttf: the PDF export embeds them
  ['assets/icons/own', /\.svg$/],
];

/** Single files, listed when present. */
const FILES = ['js/core/tips/tips.json', 'release.json'];

/** URLs whose content a hash in the URL (or in the CSS that names them) already covers. */
const HASHED = /\?|^js\/chunks\/|^css\/fonts\//;

const abs = (appDir, rel) => join(appDir, ...rel.split('/'));

/**
 * Files below `rel`, as posix paths relative to the app root. Follows
 * symlinks (the build tests run in a symlinked shadow tree). Never lists
 * source maps.
 */
function filesIn(appDir, rel, { deep = false, match = null } = {}) {
  const dir = abs(appDir, rel);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const child = `${rel}/${name}`;
    if (statSync(join(dir, name)).isDirectory()) {
      if (deep) out.push(...filesIn(appDir, child, { deep, match }));
    } else if (!name.endsWith('.map') && (!match || match.test(name))) {
      out.push(child);
    }
  }
  return out;
}

/**
 * The KaTeX fonts app.min.css references, .woff2 only (every supported
 * browser picks it first), as URLs relative to the app root.
 * @param {string} css  bundled app.min.css
 * @returns {string[]}
 */
export function fontUrlsFromCss(css) {
  const urls = [...css.matchAll(/url\(\s*["']?(?:\.\/)?fonts\/([^"')?#]+\.woff2)/g)]
    .map((m) => `css/fonts/${m[1]}`);
  return [...new Set(urls)].sort();
}

/**
 * Every URL the app fetches at runtime, relative to the scope, sorted.
 * @param {string} appDir
 * @param {{ jsHref: string, cssHref: string, cssCode: string, chunks: string[], i18nHash: string }} build
 * @returns {string[]}
 */
export function collectPrecache(appDir, { jsHref, cssHref, cssCode, chunks, i18nHash }) {
  const urls = new Set(['./', 'index.html', jsHref, cssHref, ...chunks, ...fontUrlsFromCss(cssCode)]);
  // Same query i18n.js appends from the i18n-version meta.
  for (const f of filesIn(appDir, 'i18n', { match: /\.json$/ })) urls.add(`${f}?v=${i18nHash}`);
  for (const tree of TREES) for (const f of filesIn(appDir, tree, { deep: true })) urls.add(f);
  for (const [dir, match] of FLAT) for (const f of filesIn(appDir, dir, { match })) urls.add(f);
  for (const mod of readdirSync(abs(appDir, 'js/modules'))) {
    for (const f of filesIn(appDir, `js/modules/${mod}/data`, { match: /\.json$/ })) urls.add(f);
  }
  for (const f of FILES) if (existsSync(abs(appDir, f))) urls.add(f);
  return [...urls].sort();
}

/**
 * Version of a precache list: changes when a URL or a listed file changes.
 * Hashed URLs are not read — their name changes with their content, and in
 * check mode they are not on disk.
 * @param {string} appDir
 * @param {string[]} urls
 * @param {{ html: string }} shell  the index.html being written
 * @returns {string}  8 hex chars
 */
export function precacheVersion(appDir, urls, { html }) {
  const hash = createHash('sha256');
  for (const url of urls) {
    hash.update(`${url}\n`);
    if (url === './' || url === 'index.html') hash.update(html);
    else if (!HASHED.test(url) && existsSync(abs(appDir, url))) hash.update(readFileSync(abs(appDir, url)));
  }
  return hash.digest('hex').slice(0, 8);
}

/**
 * Bundle js/sw/sw.js into one classic script (in memory).
 * @param {string} appDir
 * @param {{ version: string, precache: string[] }} defs
 * @returns {Promise<string>}
 */
export async function bundleServiceWorker(appDir, { version, precache }) {
  const result = await esbuild({
    absWorkingDir: appDir,
    entryPoints: [join(appDir, 'js', 'sw', 'sw.js')],
    bundle: true,
    minify: true,
    format: 'iife',
    target: 'es2022',
    legalComments: 'none',
    write: false,
    define: { VERSION: JSON.stringify(version), PRECACHE: JSON.stringify(precache) },
  });
  return result.outputFiles[0].text;
}
