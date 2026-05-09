/**
 * KaTeX server-side rendering wrapper.
 *
 * Uses the vendored KaTeX at vendor/katex/katex.mjs to pre-render LaTeX
 * formulas to static HTML at build time. Pages that use these helpers
 * must also link the copied KaTeX CSS (vendor/katex/katex.min.css) so
 * the rendered HTML has the right typography and glyphs.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = path.resolve(new URL('../../..', import.meta.url).pathname);
const KATEX_PATH = path.join(REPO, 'vendor/katex/katex.mjs');

let katex = null;

async function ensureKatex() {
  if (katex) return katex;
  const mod = await import(pathToFileURL(KATEX_PATH).href);
  katex = mod.default || mod;
  return katex;
}

/**
 * Render a LaTeX string to static HTML.
 *
 * Errors (malformed LaTeX) do not throw — KaTeX emits a red error span
 * so we can see the problem on the published page and fix the source.
 *
 * @param {string} latex
 * @param {{ displayMode?: boolean }} [opts]
 * @returns {Promise<string>}
 */
export async function renderLatex(latex, opts = {}) {
  const k = await ensureKatex();
  return k.renderToString(latex || '', {
    displayMode: opts.displayMode !== false, // default true
    throwOnError: false,
    output: 'html',
    strict: 'ignore',
  });
}
