/**
 * Algorithm Lab — Renderer Utilities
 * KaTeX formula rendering, Prism.js code highlighting.
 */

import { h } from '../core/dom.js';
import katex from 'katex';
import { Prism } from '../core/vendor/prism.js';

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
 * Convert a Prism token stream into DOM nodes (no innerHTML, no eval).
 *
 * Mirrors Prism's stringifier class output exactly: each `Token` becomes a
 * `<span class="token <type> <alias…>">`, so existing prism.css /
 * prism-tomorrow.css selectors keep matching. Plain strings become text nodes.
 * `token.content` may itself be a string or an array of tokens (nested
 * grammars, e.g. template strings / interpolation) — handled recursively.
 *
 * Duck-types on `.content` rather than `instanceof Prism.Token`, so the walker
 * is unit-testable with hand-built token objects and never touches Prism.
 *
 * @param {Array<string|{type:string, content:(string|Array), alias?:(string|string[])}>} tokens
 * @returns {Node[]} flat list of text nodes and <span> elements, in order
 */
export function tokensToNodes(tokens) {
  const out = [];
  for (const token of tokens) {
    if (typeof token === 'string') {
      out.push(document.createTextNode(token));
      continue;
    }
    // Build the class list exactly like Prism: ["token", type, ...aliases].
    const classes = ['token', token.type];
    const alias = token.alias;
    if (Array.isArray(alias)) classes.push(...alias);
    else if (alias) classes.push(alias);

    // content is a string (leaf) or an array of child tokens (recurse).
    const children = typeof token.content === 'string'
      ? [document.createTextNode(token.content)]
      : tokensToNodes(token.content);

    out.push(h('span', { class: classes.join(' ') }, ...children));
  }
  return out;
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
