/**
 * Block renderer for module handbook content.
 *
 * Handles every block type that appears in js/modules/<mod>/<mod>-help.js:
 *   paragraph, text, definition, heading, list, steps, table,
 *   pitfall, scenario, result, decision.
 *
 * All output is static HTML — no runtime JS needed on the published pages.
 */

import { escapeHtml } from './escape.mjs';

const CALLOUT_KINDS = new Set(['pitfall', 'scenario', 'result', 'decision']);

export function renderBlock(block) {
  if (!block || typeof block !== 'object') return '';
  const type = block.type;

  switch (type) {
    case 'paragraph':
    case 'text':
      return `<p>${escapeHtml(block.content)}</p>`;

    case 'heading':
      return `<h3 class="handbook-block__heading">${escapeHtml(block.content)}</h3>`;

    case 'definition':
      return `<p class="handbook-block__definition"><strong>${escapeHtml(block.term)}:</strong> ${escapeHtml(block.content)}</p>`;

    case 'list':
      return `<ul class="handbook-block__list">${(block.items || []).map((it) => `<li>${escapeHtml(it)}</li>`).join('')}</ul>`;

    case 'steps':
      return `<ol class="handbook-block__steps">${(block.items || []).map((it) => `<li>${escapeHtml(it)}</li>`).join('')}</ol>`;

    case 'table': {
      const head = (block.headers || []).map((h) => `<th>${escapeHtml(h)}</th>`).join('');
      const rows = (block.rows || [])
        .map((row) => `<tr>${(row || []).map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
        .join('');
      return `<div class="handbook-block__table-wrap"><table class="handbook-block__table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
    }

    default:
      if (CALLOUT_KINDS.has(type)) {
        return `<aside class="handbook-callout handbook-callout--${type}"><p>${escapeHtml(block.content)}</p></aside>`;
      }
      // Unknown block — fall back to plain paragraph if it carries text.
      if (block.content) return `<p>${escapeHtml(block.content)}</p>`;
      return '';
  }
}

export function renderBlocks(blocks) {
  return (blocks || []).map(renderBlock).join('\n');
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
