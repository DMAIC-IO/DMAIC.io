/**
 * Shared inline renderer for the static handbook.
 *
 * Handbook content is inline-markdown, exactly as the app treats it
 * (js/core/markdown-parser.js): `**bold**`, `*italic*`, `$latex$` and
 * `{{term:id|label}}`. Raw HTML is NOT a supported marker — it stays escaped,
 * in both renderers.
 *
 * Order matters and mirrors the app's token-first parse:
 *   1. lift `$…$` bodies out of the RAW text into placeholders — KaTeX has to
 *      see `<`, `>` and `'` as themselves, not as HTML entities
 *   2. HTML-escape the remaining prose
 *   3. resolve `{{term:…}}` into glossary links
 *   4. markdown-lite: **bold**, *italic*
 *   5. substitute the rendered KaTeX last, so no later pass touches its markup
 */
import { escapeHtml, escapeAttr } from './escape.mjs';
import { renderLatex } from './katex.mjs';

/** Indexed, delimited marker: survives escaping and cannot occur in prose. */
const MATH_MARKER = /@@math(\d+)@@/g;

/**
 * Render one run of inline handbook markup to HTML.
 *
 * @param {string} text
 * @param {{ glossaryHref?: (id: string) => string }} [opts]
 * @returns {Promise<string>}
 */
export async function renderInline(text, opts) {
  const mathBodies = [];
  let s = String(text ?? '').replace(/\$(\S(?:[^$\n]*?\S)?)\$/g, (_m, body) => {
    mathBodies.push(body);
    return `@@math${mathBodies.length - 1}@@`;
  });

  s = escapeHtml(s);

  s = s.replace(/\{\{term:([a-z0-9-]+)(?:\|([^}]+))?\}\}/gi, (_m, id, label) => {
    const visible = label || id;
    const href = opts?.glossaryHref?.(id);
    if (!href) return visible;
    return `<a class="handbook-glossary-link" href="${escapeAttr(href)}">${visible}</a>`;
  });

  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  if (mathBodies.length) {
    const rendered = await Promise.all(
      mathBodies.map((latex) => renderLatex(latex, { displayMode: false })),
    );
    s = s.replace(MATH_MARKER, (_m, i) => rendered[Number(i)]);
  }
  return s;
}

/**
 * Synchronous variant for slots that cannot await — resolves term links and
 * markdown-lite, and drops the `$` delimiters so no raw LaTeX leaks into the
 * page. Use `renderInline` wherever awaiting is possible.
 *
 * @param {string} text
 * @param {{ glossaryHref?: (id: string) => string }} [opts]
 * @returns {string}
 */
export function renderInlineSync(text, opts) {
  let s = escapeHtml(String(text ?? ''));
  s = s.replace(/\{\{term:([a-z0-9-]+)(?:\|([^}]+))?\}\}/gi, (_m, id, label) => {
    const visible = label || id;
    const href = opts?.glossaryHref?.(id);
    if (!href) return visible;
    return `<a class="handbook-glossary-link" href="${escapeAttr(href)}">${visible}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return s;
}
