/**
 * Algorithm Lab — inline text rendering.
 * Turns Lab doc texts (inline markdown with `{{term:id|label}}` tokens) into
 * DOM nodes. Term tokens become the app-wide glossary marker span, which
 * core/glossary-inline.js augments with its button and the frame routes to
 * the help-panel glossary. Kept free of Prism/KaTeX so it stays
 * unit-testable unbundled.
 */

import { h } from '../core/dom.js';
import { parseInline } from '../core/markdown-parser.js';

/** Term token → glossary marker span (same markup as the handbook). */
function labTermRef(id, label) {
  return h('span', { class: 'glossary-term', 'data-glossary-term': id }, label != null ? label : id);
}

/**
 * Parse one Lab doc text into DOM nodes.
 * @param {string|null|undefined} text - already localized source text
 * @returns {Node[]} text nodes plus <strong>/<em>/glossary marker spans
 */
export function labInlineNodes(text) {
  if (!text) return [];
  return parseInline(text, { termRef: labTermRef });
}
