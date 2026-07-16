/**
 * D.Mike — VoC → CTx Tree SVG builder (voc-ctx-tree-svg.js)
 *
 * Pure SVG export utility, lifted verbatim from the legacy module's
 * `_buildTreeSVG()` / `_wrapText()`. Iterative (not recursive) top-down indented
 * layout matching the on-screen tree. Kept byte-identical (including the
 * hard-coded char-width estimates used for text wrapping) so the exported image
 * stays pixel-stable.
 */

import { parseRGBA, rgbaStr } from '../../core/chart/chart-editor.js';

/**
 * Simple word-wrap for SVG text (no DOM measurement — uses char estimate).
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
 * Build an SVG DOM element representing a VoC tree.
 * Uses a top-down indented layout matching the on-screen tree.
 *
 * @param {object} voc - the active VoC (root) with nested needs/drivers/reqs
 * @param {{ borderWidth: number, colors: object }} styles - appearance settings
 * @param {{ source: string, badgeNeed: string, badgeReq: string, target: string, measurement: string }} labels
 *        i18n strings (resolved by the caller — keeps i18n out of this util)
 * @returns {SVGElement|null}
 */
export function buildTreeSVG(voc, styles, labels) {
  if (!voc) return null;

  const NS = 'http://www.w3.org/2000/svg';
  const PAD = 20;
  const INDENT = 36;
  const NODE_W = 280;
  const NODE_PAD_X = 10;
  const NODE_PAD_Y = 6;
  const LINE_H = 16;        // line height for text
  const BADGE_H = 14;
  const GAP_Y = 8;
  const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';

  // Collect flat node list with positions
  const nodes = [];
  let cursorY = PAD;

  const addNode = (type, badge, lines, level) => {
    const textLines = wrapText(lines[0] || '', NODE_W - 2 * NODE_PAD_X - 10, 7);
    const subLines = lines.slice(1); // extra lines (source, target, measure)
    const totalTextLines = textLines.length + subLines.length;
    const h = NODE_PAD_Y * 2 + BADGE_H + 4 + totalTextLines * LINE_H;
    const x = PAD + level * INDENT;
    nodes.push({ type, badge, textLines, subLines, x, y: cursorY, w: NODE_W, h, level });
    cursorY += h + GAP_Y;
  };

  // VoC root
  const vocLines = [`„${  voc.text  }“`];
  if (voc.source) vocLines.push(`${labels.source  }: ${  voc.source}`);
  addNode('voc', 'VOC', vocLines, 0);

  for (const need of voc.needs) {
    addNode('need', labels.badgeNeed, [need.text], 1);

    for (const drv of need.drivers) {
      addNode(drv.type, drv.type.toUpperCase(), [drv.text], 2);

      for (const req of drv.requirements) {
        const reqLines = [req.text];
        if (req.target) reqLines.push(`${labels.target  }: ${  req.target}`);
        if (req.measure) reqLines.push(`${labels.measurement  }: ${  req.measure}`);
        addNode('req', labels.badgeReq, reqLines, 3);
      }
    }
  }

  const totalW = PAD * 2 + 3 * INDENT + NODE_W;
  const totalH = cursorY + PAD - GAP_Y;

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('xmlns', NS);
  svg.setAttribute('viewBox', `0 0 ${totalW} ${totalH}`);
  svg.setAttribute('width', totalW);
  svg.setAttribute('height', totalH);

  // Build color lookup from styles
  const svgColors = {};
  for (const [key, rgba] of Object.entries(styles.colors)) {
    const c = parseRGBA(rgba);
    svgColors[key] = {
      stroke: rgbaStr({ ...c, a: 1 }),
      fill: rgbaStr({ ...c, a: 0.08 }),
    };
  }

  // Draw connector lines
  for (let i = 1; i < nodes.length; i++) {
    const node = nodes[i];
    for (let j = i - 1; j >= 0; j--) {
      if (nodes[j].level === node.level - 1) {
        const parent = nodes[j];
        const colors = svgColors[parent.type] || svgColors.voc;
        const lineX = node.x - INDENT / 2;
        const lineY1 = parent.y + parent.h;
        const lineY2 = node.y + node.h / 2;

        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', `M ${lineX} ${lineY1} L ${lineX} ${lineY2} L ${node.x} ${lineY2}`);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', colors.stroke);
        path.setAttribute('stroke-width', '1.5');
        path.setAttribute('stroke-dasharray', '4 3');
        svg.appendChild(path);
        break;
      }
    }
  }

  // Draw nodes
  for (const node of nodes) {
    const colors = svgColors[node.type] || svgColors.voc;

    // Background rect
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', node.x);
    rect.setAttribute('y', node.y);
    rect.setAttribute('width', node.w);
    rect.setAttribute('height', node.h);
    rect.setAttribute('rx', '6');
    rect.setAttribute('fill', colors.fill);
    rect.setAttribute('stroke', colors.stroke);
    rect.setAttribute('stroke-width', String(styles.borderWidth));
    svg.appendChild(rect);

    let ty = node.y + NODE_PAD_Y;

    // Badge
    const badgeW = node.badge.length * 6.5 + 8;
    const badgeRect = document.createElementNS(NS, 'rect');
    badgeRect.setAttribute('x', node.x + NODE_PAD_X);
    badgeRect.setAttribute('y', ty);
    badgeRect.setAttribute('width', badgeW);
    badgeRect.setAttribute('height', BADGE_H);
    badgeRect.setAttribute('rx', '3');
    badgeRect.setAttribute('fill', colors.stroke);
    svg.appendChild(badgeRect);

    const badgeText = document.createElementNS(NS, 'text');
    badgeText.setAttribute('x', node.x + NODE_PAD_X + badgeW / 2);
    badgeText.setAttribute('y', ty + BADGE_H - 3);
    badgeText.setAttribute('text-anchor', 'middle');
    badgeText.setAttribute('font-family', FONT);
    badgeText.setAttribute('font-size', '9');
    badgeText.setAttribute('font-weight', '600');
    badgeText.setAttribute('letter-spacing', '0.5');
    badgeText.setAttribute('fill', '#fff');
    badgeText.textContent = node.badge;
    svg.appendChild(badgeText);

    ty += BADGE_H + 4;

    // Main text lines
    for (const line of node.textLines) {
      const txt = document.createElementNS(NS, 'text');
      txt.setAttribute('x', node.x + NODE_PAD_X);
      txt.setAttribute('y', ty + LINE_H - 4);
      txt.setAttribute('font-family', FONT);
      txt.setAttribute('font-size', '12');
      txt.setAttribute('fill', '#1d1d1f');
      txt.textContent = line;
      svg.appendChild(txt);
      ty += LINE_H;
    }

    // Sub-lines (source, target, measure) — smaller, muted
    for (const sub of node.subLines) {
      const txt = document.createElementNS(NS, 'text');
      txt.setAttribute('x', node.x + NODE_PAD_X);
      txt.setAttribute('y', ty + LINE_H - 4);
      txt.setAttribute('font-family', FONT);
      txt.setAttribute('font-size', '10');
      txt.setAttribute('fill', '#86868b');
      txt.textContent = sub;
      svg.appendChild(txt);
      ty += LINE_H;
    }
  }

  return svg;
}
