/**
 * DMAIC.io — KaTeX Loader (katex-loader.js)
 *
 * KaTeX is bundled from node_modules into app.min.js (CSS into app.min.css),
 * so no runtime loading is needed. `ensureKaTeX()` is retained as a resolved
 * async no-op for existing call sites (algorithm-lab, glossary details,
 * module-help formulas). Also provides helpers to render block and inline
 * math from the DMAIC.io conventions:
 *
 *   - **Block formulas:** `<element data-katex="\\sigma^2 = …">` — typically
 *     emitted by glossary `formula` blocks.
 *   - **Inline math:** `<element data-katex-inline="\\sigma">` — emitted by
 *     post-processing `$…$` patterns in glossary/help paragraph text.
 *
 * Failures are non-fatal — the raw LaTeX text remains visible.
 */

import katex from 'katex';

/**
 * KaTeX is statically bundled from node_modules; its CSS ships inside
 * app.min.css. Kept async so existing `await ensureKaTeX()` call sites are
 * unchanged. Resolves immediately — the library is always present.
 * @returns {Promise<void>}
 */
export function ensureKaTeX() {
  return Promise.resolve();
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
  if (!katex) return;
  for (const el of els) {
    const latex = el.getAttribute('data-katex') || '';
    try {
      katex.render(latex, el, { throwOnError: false, displayMode: true });
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
  if (!katex) return;
  for (const el of els) {
    const latex = el.getAttribute('data-katex-inline') || '';
    try {
      katex.render(latex, el, { throwOnError: false, displayMode: false });
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
