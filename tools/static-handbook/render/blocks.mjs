/**
 * Block renderer for module handbook content.
 *
 * Handles every block type that appears in js/modules/<mod>/<mod>-help.js:
 *   paragraph, text, definition, heading, list, steps, table,
 *   pitfall, scenario, result, decision.
 *
 * All output is static HTML — no runtime JS needed on the published pages.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { renderInline } from './inline.mjs';
import { normalizeSvg } from '../../build/icons.mjs';

/**
 * ISC-Attribution für die inline eingebetteten lucide-Icons. `normalizeSvg()`
 * entfernt den Lizenzkommentar aus dem Asset, deshalb wird der Hinweis hier
 * einmal pro Seite im <head> ausgegeben (siehe page-shell.mjs) — so reist die
 * Attribution mit jedem ausgelieferten Artefakt mit. Muster übernommen aus dem
 * Sprite des Site-Repos.
 */
export const LUCIDE_ATTRIBUTION =
  '@license lucide-static v1.32.0 - ISC — Copyright (c) Lucide Icons and '
  + 'Contributors — https://github.com/lucide-icons/lucide/blob/main/LICENSE '
  + '— Quelle: assets/icons/vendor/lucide/';

const CALLOUT_KINDS = new Set(['pitfall', 'scenario', 'result', 'decision']);

// The palette (Task 10 fix) has only three usable accent hues (blue/green/
// teal) for four callout kinds, and the markup carries no text label — so
// colour tint alone can't tell scenario and decision apart on a skim. An
// icon per kind (vendored lucide assets the app already ships under
// assets/icons/vendor/, same source the in-app icon-map.json draws from)
// is the second signal. No sprite/JS icon-loader exists in this fully
// static, zero-JS output, so the SVG markup is read once and inlined
// verbatim per occurrence — this is the existing vendored asset, not a
// hand-drawn icon.
const CALLOUT_ICON_NAMES = {
  pitfall: 'triangle-alert',   // matches icon-map.json's status.warning
  scenario: 'flask-conical',   // matches icon-map.json's action.experiment
  result: 'circle-check',      // matches icon-map.json's status.ok
  decision: 'diamond',         // matches icon-map.json's flow.decision
};

const ICON_VENDOR_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../assets/icons/vendor/lucide',
);

const iconSvgCache = new Map();

/** Read + cache a vendored lucide icon's SVG markup for inline embedding. */
async function calloutIconSvg(kind) {
  const name = CALLOUT_ICON_NAMES[kind];
  if (!name) return '';
  if (iconSvgCache.has(name)) return iconSvgCache.get(name);
  let svg = '';
  try {
    const raw = await readFile(path.join(ICON_VENDOR_DIR, `${name}.svg`), 'utf8');
    // normalizeSvg() (tools/build/icons.mjs) entfernt Lizenzkommentar und das
    // vom Asset mitgebrachte class-Attribut — sonst stünden nach der Injektion
    // zwei class-Attribute im selben <svg>. Danach: dekorativ auszeichnen (der
    // Callout-Text trägt die Bedeutung) und für CSS-Größe/-Farbe taggen.
    svg = normalizeSvg(raw)
      .replace('<svg', '<svg class="handbook-callout__icon" aria-hidden="true" focusable="false"');
  } catch (err) {
    console.warn(`[static-handbook] Callout-Icon "${name}" nicht lesbar:`, err);
    svg = '';
  }
  iconSvgCache.set(name, svg);
  return svg;
}

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
        const iconSvg = await calloutIconSvg(type);
        return `<aside class="handbook-callout handbook-callout--${type}">${iconSvg}<p>${await inline(block.content)}</p></aside>`;
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
