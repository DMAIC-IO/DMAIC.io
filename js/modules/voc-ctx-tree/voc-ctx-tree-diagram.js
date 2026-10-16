/**
 * D.Mike — VoC → CTx tree diagram layout (voc-ctx-tree-diagram.js)
 *
 * Pure layout for the PNG/SVG export: turns the active VoC into the
 * `{ nodes, links }` config of the `node-diagram` chart type. Top-down
 * indented layout matching the on-screen tree; the constants are the ones the
 * former hand-built export used, so the exported geometry stays the same.
 */

import { parseRGBA, rgbaStr } from '../../core/chart/chart-editor.js';

const PAD = 20;
const INDENT = 36;
const NODE_W = 280;
const NODE_PAD_X = 10;
const NODE_PAD_Y = 6;
const LINE_H = 16;
const BADGE_H = 14;
const BADGE_GAP = 4;
const GAP_Y = 8;
const CHAR_W = 7;

/**
 * Simple word-wrap (no DOM measurement — uses a char-width estimate).
 * @param {string} text
 * @param {number} maxWidth - available pixel width
 * @param {number} charWidth - estimated average char width in px
 * @returns {string[]}
 */
export function wrapText(text, maxWidth, charWidth) {
  const maxChars = Math.floor(maxWidth / charWidth);
  if (text.length <= maxChars) return [text];
  const words = text.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const word of words) {
    const test = cur ? `${cur  } ${  word}` : word;
    if (test.length > maxChars && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [text];
}

/**
 * Lay out a VoC tree as a node-diagram config.
 * @param {object|null} voc - the active VoC (root) with nested needs/drivers/requirements
 * @param {{ borderWidth: number, colors: object }} styles - appearance settings
 * @param {{ source: string, badgeNeed: string, badgeReq: string, target: string, measurement: string }} labels
 *        i18n strings, resolved by the caller
 * @returns {{ nodes: Array, links: Array }|null} null without a VoC
 */
export function buildTreeDiagram(voc, styles, labels) {
  if (!voc) return null;

  const palette = {};
  for (const [key, rgba] of Object.entries(styles.colors)) {
    const c = parseRGBA(rgba);
    palette[key] = { stroke: rgbaStr({ ...c, a: 1 }), fill: rgbaStr({ ...c, a: 0.08 }) };
  }

  const nodes = [];
  const levels = [];
  const links = [];
  let cursorY = PAD;

  const addNode = (type, badge, texts, level) => {
    const colors = palette[type] || palette.voc;
    const main = wrapText(texts[0] || '', NODE_W - 2 * NODE_PAD_X - 10, CHAR_W);
    const sub = texts.slice(1);
    const h = NODE_PAD_Y * 2 + BADGE_H + BADGE_GAP + (main.length + sub.length) * LINE_H;
    const id = `n${nodes.length}`;
    for (let j = nodes.length - 1; j >= 0; j--) {
      if (levels[j] === level - 1) {
        links.push({ from: nodes[j].id, to: id, shape: 'elbow', color: nodes[j].stroke, width: 1.5, dash: '4 3' });
        break;
      }
    }
    nodes.push({
      id, x: PAD + level * INDENT, y: cursorY, w: NODE_W, h,
      badge: { text: badge, color: colors.stroke },
      lines: [
        ...main.map((text) => ({ text, size: 12 })),
        ...sub.map((text) => ({ text, size: 10, muted: true })),
      ],
      fill: colors.fill, stroke: colors.stroke, strokeWidth: styles.borderWidth,
    });
    levels.push(level);
    cursorY += h + GAP_Y;
  };

  const vocLines = [`„${voc.text}“`];
  if (voc.source) vocLines.push(`${labels.source}: ${voc.source}`);
  addNode('voc', 'VOC', vocLines, 0);

  for (const need of voc.needs) {
    addNode('need', labels.badgeNeed, [need.text], 1);
    for (const drv of need.drivers) {
      addNode(drv.type, drv.type.toUpperCase(), [drv.text], 2);
      for (const req of drv.requirements) {
        const reqLines = [req.text];
        if (req.target) reqLines.push(`${labels.target}: ${req.target}`);
        if (req.measure) reqLines.push(`${labels.measurement}: ${req.measure}`);
        addNode('req', labels.badgeReq, reqLines, 3);
      }
    }
  }

  return { nodes, links };
}
