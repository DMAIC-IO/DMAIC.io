/**
 * Block renderer for module handbook content.
 *
 * Handles every block type that appears in js/modules/<mod>/<mod>-help.js:
 *   paragraph, text, definition, heading, list, steps, table,
 *   pitfall, scenario, result, decision.
 *
 * All output is static HTML — no runtime JS needed on the published pages.
 */

import { escapeHtml, escapeAttr } from './escape.mjs';

const CALLOUT_KINDS = new Set(['pitfall', 'scenario', 'result', 'decision']);

/**
 * Escape `s` and, if `opts.glossaryHref` is supplied, post-process
 * `{{term:id|label}}` / `{{term:id}}` markers into static glossary links.
 * The latex `{`/`|`/`}` chars are not HTML-special, so the markers survive
 * the escape step and we can match them on the already-escaped string.
 *
 * @param {string} s
 * @param {{ glossaryHref?: (id: string) => string }} [opts]
 */
function escAndLink(s, opts) {
  const out = escapeHtml(s);
  if (!opts?.glossaryHref) return out;
  return out.replace(/\{\{term:([a-z0-9-]+)(?:\|([^}]+))?\}\}/gi, (_, id, label) => {
    const text = label || id;
    const href = opts.glossaryHref(id);
    // Unknown term → strip the marker and emit plain text (no broken link).
    if (!href) return text;
    return `<a class="handbook-glossary-link" href="${escapeAttr(href)}">${text}</a>`;
  });
}

export function renderBlock(block, opts = {}) {
  if (!block || typeof block !== 'object') return '';
  const type = block.type;

  switch (type) {
    case 'paragraph':
    case 'text':
      return `<p>${escAndLink(block.content, opts)}</p>`;

    case 'heading':
      return `<h3 class="handbook-block__heading">${escAndLink(block.content, opts)}</h3>`;

    case 'definition':
      return `<p class="handbook-block__definition"><strong>${escAndLink(block.term, opts)}:</strong> ${escAndLink(block.content, opts)}</p>`;

    case 'list':
      return `<ul class="handbook-block__list">${(block.items || []).map((it) => `<li>${escAndLink(it, opts)}</li>`).join('')}</ul>`;

    case 'steps':
      return `<ol class="handbook-block__steps">${(block.items || []).map((it) => `<li>${escAndLink(it, opts)}</li>`).join('')}</ol>`;

    case 'table': {
      const head = (block.headers || []).map((h) => `<th>${escAndLink(h, opts)}</th>`).join('');
      const rows = (block.rows || [])
        .map((row) => `<tr>${(row || []).map((cell) => `<td>${escAndLink(cell, opts)}</td>`).join('')}</tr>`)
        .join('');
      return `<div class="handbook-block__table-wrap"><table class="handbook-block__table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
    }

    default:
      if (CALLOUT_KINDS.has(type)) {
        return `<aside class="handbook-callout handbook-callout--${type}"><p>${escAndLink(block.content, opts)}</p></aside>`;
      }
      // Unknown block — fall back to plain paragraph if it carries text.
      if (block.content) return `<p>${escAndLink(block.content, opts)}</p>`;
      return '';
  }
}

export function renderBlocks(blocks, opts = {}) {
  return (blocks || []).map(b => renderBlock(b, opts)).join('\n');
}

/**
 * Extract a short SEO description (first paragraph-like block, up to ~160 chars).
 */
export function firstParagraphText(blocks) {
  for (const b of blocks || []) {
    if ((b.type === 'paragraph' || b.type === 'text' || b.type === 'scenario') && b.content) {
      const raw = String(b.content).replace(/\s+/g, ' ').trim();
      if (raw.length <= 160) return raw;
      const cut = raw.slice(0, 157);
      const lastSpace = cut.lastIndexOf(' ');
      return (lastSpace > 100 ? cut.slice(0, lastSpace) : cut) + '…';
    }
  }
  return '';
}
