/**
 * Block renderer for module handbook content.
 *
 * Handles every block type that appears in js/modules/<mod>/<mod>-help.js:
 *   paragraph, text, definition, heading, list, steps, table,
 *   pitfall, scenario, result, decision.
 *
 * All output is static HTML — no runtime JS needed on the published pages.
 */

import { renderInline } from './inline.mjs';

const CALLOUT_KINDS = new Set(['pitfall', 'scenario', 'result', 'decision']);

export async function renderBlock(block, opts = {}) {
  if (!block || typeof block !== 'object') return '';
  const type = block.type;
  const inline = (text) => renderInline(text, opts);

  switch (type) {
    case 'paragraph':
    case 'text':
      return `<p>${await inline(block.content)}</p>`;

    case 'heading':
      return `<h3 class="handbook-block__heading">${await inline(block.content)}</h3>`;

    case 'definition':
      return `<p class="handbook-block__definition"><strong>${await inline(block.term)}:</strong> `
        + `${await inline(block.content)}</p>`;

    case 'list': {
      const items = await Promise.all((block.items || []).map(async (it) => `<li>${await inline(it)}</li>`));
      return `<ul class="handbook-block__list">${items.join('')}</ul>`;
    }

    case 'steps': {
      const items = await Promise.all((block.items || []).map(async (it) => `<li>${await inline(it)}</li>`));
      return `<ol class="handbook-block__steps">${items.join('')}</ol>`;
    }

    case 'table': {
      const headCells = await Promise.all((block.headers || []).map(async (h) => `<th>${await inline(h)}</th>`));
      const bodyRows = await Promise.all((block.rows || []).map(async (row) => {
        const cells = await Promise.all((row || []).map(async (cell) => `<td>${await inline(cell)}</td>`));
        return `<tr>${cells.join('')}</tr>`;
      }));
      return `<div class="handbook-block__table-wrap"><table class="handbook-block__table">`
        + `<thead><tr>${headCells.join('')}</tr></thead><tbody>${bodyRows.join('')}</tbody></table></div>`;
    }

    default:
      if (CALLOUT_KINDS.has(type)) {
        return `<aside class="handbook-callout handbook-callout--${type}"><p>${await inline(block.content)}</p></aside>`;
      }
      // Unknown block — fall back to plain paragraph if it carries text.
      if (block.content) return `<p>${await inline(block.content)}</p>`;
      return '';
  }
}

export async function renderBlocks(blocks, opts = {}) {
  const parts = await Promise.all((blocks || []).map((b) => renderBlock(b, opts)));
  return parts.join('\n');
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
