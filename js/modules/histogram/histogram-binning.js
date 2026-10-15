/**
 * D.Mike — Bar pattern helper of the histogram module — removed with the module's own renderer (see 2026-10-15 histogram plan, Task 9).
 */

import { svgEl } from '../../core/chart/chart-core.js';

// ─── Pattern helper ─────────────────────────────────────────
export function createBarPattern(defs, id, s) {
  const size = 8;
  const pat = svgEl('pattern', {
    id, patternUnits: 'userSpaceOnUse', width: size, height: size,
  }, defs);
  const lineColor = s.patternColor || 'rgba(0,0,0,0.5)';
  const sw = s.patternSolidity ? s.patternSolidity * 2 : 0.8;
  switch (s.pattern) {
    case '/':  svgEl('line', { x1: 0, y1: size, x2: size, y2: 0, stroke: lineColor, 'stroke-width': sw }, pat); break;
    case '\\': svgEl('line', { x1: 0, y1: 0, x2: size, y2: size, stroke: lineColor, 'stroke-width': sw }, pat); break;
    case '-':  svgEl('line', { x1: 0, y1: size / 2, x2: size, y2: size / 2, stroke: lineColor, 'stroke-width': sw }, pat); break;
    case '|':  svgEl('line', { x1: size / 2, y1: 0, x2: size / 2, y2: size, stroke: lineColor, 'stroke-width': sw }, pat); break;
    case 'x':
      svgEl('line', { x1: 0, y1: size, x2: size, y2: 0, stroke: lineColor, 'stroke-width': sw }, pat);
      svgEl('line', { x1: 0, y1: 0, x2: size, y2: size, stroke: lineColor, 'stroke-width': sw }, pat);
      break;
    case '+':
      svgEl('line', { x1: 0, y1: size / 2, x2: size, y2: size / 2, stroke: lineColor, 'stroke-width': sw }, pat);
      svgEl('line', { x1: size / 2, y1: 0, x2: size / 2, y2: size, stroke: lineColor, 'stroke-width': sw }, pat);
      break;
    case '.':  svgEl('circle', { cx: size / 2, cy: size / 2, r: sw, fill: lineColor }, pat); break;
  }
}
