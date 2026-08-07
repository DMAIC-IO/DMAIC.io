/**
 * Algorithm Lab — Renderer Utilities
 * KaTeX formula rendering, Prism.js code highlighting.
 */

import katex from 'katex';
import { Prism } from '../core/vendor/prism.js';
import { tokensToNodes } from './lab-renderer-tokens.js';

// Re-export the pure token walker (lives in a Prism-free module so it stays
// unit-testable unbundled — see lab-renderer-tokens.js).
export { tokensToNodes };

/**
 * KaTeX + Prism are bundled from node_modules (their CSS ships in app.min.css),
 * so these "ensure" helpers are resolved no-ops kept for their existing
 * `await ensureKaTeX()` / `await ensurePrism()` call sites.
 */
async function ensureKaTeX() {}

async function ensurePrism() {}

/**
 * Render ONE LaTeX formula block into `el` (idempotent — clears first).
 * @param {HTMLElement} el     - the per-formula container (from x-for)
 * @param {{label:string, latex:string, description?:string|object}} f
 * @param {string} lang        - current language (pass the reactive `lang` so
 *                               x-effect re-renders the localized description)
 */
export async function renderFormula(el, f, lang) {
  await ensureKaTeX();
  el.replaceChildren();
  el.className = 'lab__formula';

  const label = document.createElement('div');
  label.className = 'lab__formula-label';
  label.textContent = f.label;
  el.append(label);

  const math = document.createElement('div');
  try {
    katex.render(f.latex, math, { throwOnError: false, displayMode: true });
  } catch {
    math.textContent = f.latex;
  }
  el.append(math);

  const descText = locDesc(f.description, lang);
  if (descText) {
    const desc = document.createElement('div');
    desc.className = 'lab__formula-description';
    desc.textContent = descText;
    el.append(desc);
  }
}

/** Local copy of the loc() resolver (renderer must not depend on lab-core). */
function locDesc(value, lang) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return value[lang] ?? value.en ?? value.de ?? '';
  return String(value);
}

/**
 * Render syntax-highlighted code into `el` — no innerHTML, no eval.
 * Tokenizes via Prism, then walks the token tree to DOM (see tokensToNodes).
 * @param {HTMLElement} el
 * @param {string} code
 * @param {string} [language='javascript']
 */
export async function renderCode(el, code, language = 'javascript') {
  await ensurePrism();
  el.replaceChildren();
  const pre = document.createElement('pre');
  const codeEl = document.createElement('code');
  codeEl.className = `language-${language}`;

  const grammar = Prism && Prism.languages[language];
  if (grammar) {
    const tokens = Prism.tokenize(code, grammar);
    codeEl.append(...tokensToNodes(tokens));
  } else {
    // No grammar loaded → render plain (still no innerHTML).
    codeEl.append(document.createTextNode(code));
  }

  pre.append(codeEl);
  el.append(pre);
}

/**
 * Update the Prism.js theme link when the app theme changes.
 * @param {string} theme - 'light' or 'dark'
 */
export function updatePrismTheme(_theme) {
  // No-op: Prism CSS is bundled into app.min.css (single theme); the runtime
  // <link> swap is gone with the vendor tags. Dark-mode code-block styling is
  // carried by the bundled theme + app CSS variables (see Task 1.6 / CSS bundle).
}
