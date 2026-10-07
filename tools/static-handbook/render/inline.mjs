/**
 * Shared inline renderer for the static handbook.
 *
 * Handbook content is inline-markdown, exactly as the app treats it
 * (js/core/markdown-parser.js): `**bold**`, `*italic*`, `$latex$`,
 * `{{term:id|label}}` and `{{ref:id|label}}`. Raw HTML is NOT a supported
 * marker — it stays escaped, in both renderers.
 *
 * `{{ref:id|label}}` becomes a link to the page's own references section
 * when the caller passes `opts.refLink` and the id is known (module pages).
 * Otherwise — unknown id, or glossary/algorithm pages without `refLink` —
 * it is flattened to plain text: the label when present, else the bare id.
 *
 * Order matters and mirrors the app's token-first parse:
 *   1. lift `$…$` bodies out of the RAW text into placeholders — KaTeX has to
 *      see `<`, `>` and `'` as themselves, not as HTML entities
 *   2. HTML-escape the remaining prose
 *   3. resolve `{{term:…}}` into glossary links and `{{ref:…}}` into
 *      reference links (or plain text)
 *   4. markdown-lite: **bold**, *italic*
 *   5. substitute the rendered KaTeX last, so no later pass touches its markup
 */
import { escapeHtml, escapeAttr } from './escape.mjs';
import { renderLatex } from './katex.mjs';

/** Indexed, delimited marker: survives escaping and cannot occur in prose. */
const MATH_MARKER = /@@math(\d+)@@/g;

/**
 * Resolve `{{ref:id|label}}` markers in already-escaped prose. With a
 * `refLink` that knows the id, the marker becomes its anchor; otherwise it
 * is flattened to the label, or the bare id — a typo never becomes a dead
 * link.
 * @param {string} s - HTML-escaped text
 * @param {{ refLink?: (id: string, escapedLabel?: string) => string|null }} [opts]
 * @returns {string}
 */
function resolveRefs(s, opts) {
  return s.replace(/\{\{ref:([a-z0-9-]+)(?:\|([^}]+))?\}\}/gi, (_m, id, label) =>
    opts?.refLink?.(id, label) || label || id);
}

/**
 * Render one run of inline handbook markup to HTML.
 *
 * @param {string} text
 * @param {{ glossaryHref?: (id: string) => string,
 *           refLink?: (id: string, escapedLabel?: string) => string|null }} [opts]
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

  s = resolveRefs(s, opts);

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
 * @param {{ glossaryHref?: (id: string) => string,
 *           refLink?: (id: string, escapedLabel?: string) => string|null }} [opts]
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
  s = resolveRefs(s, opts);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return s;
}
