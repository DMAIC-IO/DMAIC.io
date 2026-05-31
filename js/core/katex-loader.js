/**
 * DMAIC.io — KaTeX Loader (katex-loader.js)
 *
 * Lazy-loads the vendor KaTeX CSS + JS bundle exactly once per session,
 * regardless of how many call sites need it (algorithm-lab, glossary
 * details, future module-help formulas). Also provides helpers to render
 * block and inline math from the DMAIC.io conventions:
 *
 *   - **Block formulas:** `<element data-katex="\\sigma^2 = …">` — typically
 *     emitted by glossary `formula` blocks.
 *   - **Inline math:** `<element data-katex-inline="\\sigma">` — emitted by
 *     post-processing `$…$` patterns in glossary/help paragraph text.
 *
 * Failures are non-fatal — the raw LaTeX text remains visible.
 */

let _katexPromise = null;

const KATEX_CSS = './vendor/katex/katex.min.css';
const KATEX_JS  = './vendor/katex/katex.min.js';

/**
 * Ensure KaTeX is loaded. Resolves once `window.katex` is available.
 * Safe to call concurrently — repeated calls share one underlying load.
 * @returns {Promise<void>}
 */
export function ensureKaTeX() {
  if (typeof window !== 'undefined' && window.katex) return Promise.resolve();
  if (_katexPromise) return _katexPromise;

  _katexPromise = new Promise((resolve, reject) => {
    // CSS — append if not already there.
    if (!document.querySelector('link[href*="katex"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = KATEX_CSS;
      document.head.append(link);
    }
    // JS — reuse an existing tag (e.g. injected by algorithm-lab) if present.
    const existing = document.querySelector('script[src*="katex.min.js"]');
    if (existing) {
      if (window.katex) return resolve();
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', reject);
      return;
    }
    const s = document.createElement('script');
    s.src = KATEX_JS;
    s.onload = () => resolve();
    s.onerror = reject;
    document.head.append(s);
  });
  return _katexPromise;
}

/**
 * Render block-mode KaTeX into every `[data-katex]` descendant of `root`.
 * Sources the LaTeX from the attribute. Idempotent — already-rendered
 * targets (signalled by `data-katex-rendered="1"`) are skipped.
 * @param {ParentNode} root
 */
export async function renderBlockMath(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  const els = root.querySelectorAll('[data-katex]:not([data-katex-rendered="1"])');
  if (!els.length) return;
  try {
    await ensureKaTeX();
  } catch {
    return;
  }
  if (!window.katex) return;
  for (const el of els) {
    const latex = el.getAttribute('data-katex') || '';
    try {
      window.katex.render(latex, el, { throwOnError: false, displayMode: true });
      el.dataset.katexRendered = '1';
    } catch {
      el.textContent = latex;
    }
  }
}

/**
 * Render inline-mode KaTeX into every `[data-katex-inline]` descendant of
 * `root`. Same idempotency contract as `renderBlockMath`.
 * @param {ParentNode} root
 */
export async function renderInlineMath(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  const els = root.querySelectorAll('[data-katex-inline]:not([data-katex-rendered="1"])');
  if (!els.length) return;
  try {
    await ensureKaTeX();
  } catch {
    return;
  }
  if (!window.katex) return;
  for (const el of els) {
    const latex = el.getAttribute('data-katex-inline') || '';
    try {
      window.katex.render(latex, el, { throwOnError: false, displayMode: false });
      el.dataset.katexRendered = '1';
    } catch {
      el.textContent = latex;
    }
  }
}

/**
 * Replace `$…$` inline-math markers in an already-HTML-escaped string with
 * `<span data-katex-inline="…">…</span>` placeholders. The escape step
 * leaves `$` intact (it's not an HTML special char), so the pattern is
 * safe to apply post-escape.
 *
 * @param {string} escapedHtml
 * @returns {string}
 */
export function injectInlineMathMarkers(escapedHtml) {
  // Match `$…$` where the body is non-empty and has no whitespace at the
  // delimiter boundary. Rules out false positives like "$ 100 $" while
  // accepting bare-variable forms like `$n$`, `$n-1$`, `$\sigma^2$`.
  //
  // Trade-off: authors must escape literal `$` chars in non-math text
  // (write `\$100` instead of `$100`). For curated glossary content this
  // is a fine constraint; if a real conflict appears we can switch to
  // `$$…$$` delimiters.
  return escapedHtml.replace(/\$(\S(?:[^$\n]*?\S)?)\$/g, (_full, body) =>
    `<span class="dmike-math-inline" data-katex-inline="${escAttrLocal(body)}">${body}</span>`);
}

function escAttrLocal(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
