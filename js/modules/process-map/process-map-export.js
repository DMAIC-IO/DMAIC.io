/**
 * D.Mike — Process Map image export (process-map-export.js)
 *
 * One pure scene builder, two thin renderers (spec
 * 2026-10-06-process-map-export-horizontal-design). `buildPmapScene` lays the
 * steps out like the screen — one column per step, rows for inputs, cards and
 * outputs, one loop band per loop below — and returns a flat list of drawing
 * primitives. `renderSceneToCanvas` / `renderSceneToSVG` only paint them.
 */

import { downloadBlob } from '../../core/export-utils.js';
import { loopRailCells, loopPassColumns, loopArrowColumns } from './process-map-model.js';

const FONT = 'DM Sans, system-ui, sans-serif';
const PAD = 20;
const COL_W = 224;
const GAP = 32;        // column gap, holds the » connector
const ROW_GAP = 10;
const LABEL_H = 20;
const IO_H = 26;
const IO_GAP = 6;
const HDR_H = 36;
const DESC_H = 26;
const SUB_BAR_H = 24;
const SUB_H = 26;
const RAIL_H = 20;
const CTRL_H = 76;     // loop controls box: title, condition, target
const CHIP_H = 26;
const CHIP_MIN = 120;
const CHIP_GAP = 16;   // room for the « between chips
const LINE_GAP = 8;

/** Read the themed colour palette from the document root. */
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const cv = (v, fb) => cs.getPropertyValue(v).trim() || fb;
  return {
    bgPrimary:    cv('--color-bg-primary', '#ffffff'),
    bgSecondary:  cv('--color-bg-secondary', '#f8f9fa'),
    bgTertiary:   cv('--color-bg-tertiary', '#e9ecef'),
    border:       cv('--color-border-secondary', '#dee2e6'),
    textPrimary:  cv('--color-text-primary', '#212529'),
    textSecondary: cv('--color-text-secondary', '#6c757d'),
    textTertiary: cv('--color-text-tertiary', '#adb5bd'),
    accent:       cv('--color-accent', '#0066cc'),
    accentBg:     cv('--color-pmap-step-accent-bg', 'rgba(0,102,204,0.10)'),
    inputColor:   cv('--color-pmap-input', '#34c759'),
    inputBg:      cv('--color-pmap-input-bg', 'rgba(52,199,89,0.10)'),
    outputColor:  cv('--color-pmap-output', '#ff9500'),
    outputBg:     cv('--color-pmap-output-bg', 'rgba(255,149,0,0.10)'),
    connector:    cv('--color-pmap-connector', '#dee2e6'),
    va:           cv('--color-pmap-va', '#34c759'),
    vaBg:         cv('--color-pmap-va-bg', 'rgba(52,199,89,0.12)'),
    bnva:         cv('--color-pmap-bnva', '#ff9f0a'),
    bnvaBg:       cv('--color-pmap-bnva-bg', 'rgba(255,159,10,0.12)'),
    nva:          cv('--color-pmap-nva', '#ff3b30'),
    nvaBg:        cv('--color-pmap-nva-bg', 'rgba(255,59,48,0.12)'),
    param:        cv('--color-pmap-param', '#007aff'),
    paramBg:      cv('--color-pmap-param-bg', 'rgba(0,122,255,0.12)'),
    noise:        cv('--color-pmap-noise', '#af52de'),
    noiseBg:      cv('--color-pmap-noise-bg', 'rgba(175,82,222,0.12)'),
    loop:         cv('--color-pmap-loop', '#e67e22'),
    loopBg:       cv('--color-pmap-loop-bg', 'rgba(230,126,34,0.08)'),
    loopBorder:   cv('--color-pmap-loop-border', 'rgba(230,126,34,0.30)'),
  };
}

/**
 * Lay out the process map as a flat list of drawing primitives in paint
 * order. Pure: no DOM access; text widths come from the injected `measure`.
 * Items: `rect {x,y,w,h,r?,fill?,stroke?,dash?}`, `line {x1,y1,x2,y2,stroke,width?,dash?}`,
 * `polygon {points:[[x,y],…],fill}`, `text {x,y,text,size,weight?,fill,align?}`
 * (y is the vertical text centre). Some items carry a `role` tag
 * (card, rail, pass, arrow) that the renderers ignore.
 * @param {Array<object>} steps process-map steps (model shape)
 * @param {{t:(key:string)=>string, colors:object, measure:(text:string, size:number, weight?:number)=>number}} opts
 * @returns {{width:number, height:number, items:Array<object>}}
 */
export function buildPmapScene(steps, { t, colors: c, measure }) {
  const items = [];
  const add = (kind, props) => items.push({ kind, ...props });
  const text = (x, y, str, size, fill, extra = {}) => add('text', { x, y, text: str, size, fill, ...extra });
  const fit = (str, size, maxW, weight = 400) => {
    let s = String(str ?? '');
    if (measure(s, size, weight) <= maxW) return s;
    while (s && measure(`${s}…`, size, weight) > maxW) s = s.slice(0, -1);
    return `${s}…`;
  };
  const badge = (x, y, h, str, size, fg, bg) => {
    const w = measure(str, size, 600) + 10;
    add('rect', { x, y, w, h, r: 4, fill: bg });
    text(x + w / 2, y + h / 2, str, size, fg, { weight: 600, align: 'center' });
    return w;
  };

  const n = steps.length;
  const colX = (i) => PAD + i * (COL_W + GAP);
  const cx = (i) => colX(i) + COL_W / 2;
  const named = (list) => (list || []).filter((io) => io.name);
  const ioH = (list) => LABEL_H + named(list).length * (IO_H + IO_GAP);
  const subCount = (s) => (s.substeps || []).length;
  const cardH = (s) => HDR_H + (s.description ? DESC_H : 0) + SUB_BAR_H + (subCount(s) ? subCount(s) * SUB_H + 8 : 0);
  const maxOf = (fn) => Math.max(0, ...steps.map(fn));

  const inRowH = maxOf((s) => ioH(s.inputs));
  const cardRowH = maxOf(cardH);
  const outRowH = maxOf((s) => ioH(s.outputs));
  const cardTop = PAD + inRowH + ROW_GAP;
  const outTop = cardTop + cardRowH + ROW_GAP;
  const width = PAD * 2 + Math.max(n, 1) * COL_W + Math.max(n - 1, 0) * GAP;
  const bg = { x: 0, y: 0, w: width, h: 0, fill: c.bgPrimary };
  add('rect', bg);

  steps.forEach((step, i) => {
    const x = colX(i);
    // Inputs, bottom-aligned above the card.
    let y = PAD + inRowH - ioH(step.inputs);
    text(x, y + LABEL_H / 2, `● ${t('inputs')} »`, 10, c.inputColor, { weight: 600 });
    named(step.inputs).forEach((io, k) => {
      const iy = y + LABEL_H + k * (IO_H + IO_GAP);
      add('rect', { x, y: iy, w: COL_W, h: IO_H, r: 4, fill: c.inputBg });
      add('rect', { x: x + 6, y: iy + IO_H / 2 - 3.5, w: 7, h: 7, r: 3.5, fill: c.inputColor });
      let nameX = x + 20;
      if (io.inputType) {
        const param = io.inputType === 'param';
        nameX += badge(nameX, iy + 4, IO_H - 8, t(param ? 'inputTypeParam' : 'inputTypeNoise'), 10,
          param ? c.param : c.noise, param ? c.paramBg : c.noiseBg) + 4;
      }
      text(nameX, iy + IO_H / 2, fit(io.name, 11, x + COL_W - 6 - nameX), 11, c.textPrimary);
    });

    // Card.
    add('rect', { x, y: cardTop, w: COL_W, h: cardRowH, r: 8, fill: c.bgSecondary, stroke: c.border, role: 'card' });
    add('line', { x1: x, y1: cardTop + HDR_H, x2: x + COL_W, y2: cardTop + HDR_H, stroke: c.border });
    let tx = x + 10;
    tx += badge(tx, cardTop + 8, 20, String(i + 1).padStart(2, '0'), 11, c.accent, c.accentBg) + 6;
    if (step.valueType) {
      tx += badge(tx, cardTop + 8, 20, t(step.valueType), 10, c[step.valueType], c[`${step.valueType}Bg`]) + 6;
    }
    text(tx, cardTop + 18, fit(step.title || t('stepNamePlaceholder'), 13, x + COL_W - 10 - tx, 600), 13,
      step.title ? c.textPrimary : c.textTertiary, { weight: 600 });
    y = cardTop + HDR_H;
    if (step.description) {
      text(x + 12, y + DESC_H / 2, fit(step.description, 11, COL_W - 24), 11, c.textSecondary);
      y += DESC_H;
    }
    const subs = step.substeps || [];
    add('line', { x1: x, y1: y, x2: x + COL_W, y2: y, stroke: c.border });
    const barColor = subs.length ? c.accent : c.textTertiary;
    text(x + 10, y + SUB_BAR_H / 2, `${subs.length ? '▾' : '▸'} ${t('substepsLabel')}${subs.length ? ` (${subs.length})` : ''}`,
      10, barColor, { weight: 600 });
    subs.forEach((ss, k) => {
      const sy = y + SUB_BAR_H + 4 + k * SUB_H;
      add('rect', { x: x + 8, y: sy, w: COL_W - 16, h: SUB_H - 2, r: 4, fill: c.bgTertiary });
      text(x + 14, sy + (SUB_H - 2) / 2, `${i + 1}.${k + 1}`, 11, c.accent);
      text(x + 46, sy + (SUB_H - 2) / 2, fit(ss.title, 11, COL_W - 60), 11, c.textPrimary);
    });
    if (i < n - 1) {
      text(x + COL_W + GAP / 2, cardTop + cardRowH / 2, '»', 18, c.connector, { align: 'center' });
    }

    // Outputs, top-aligned below the card.
    text(x, outTop + LABEL_H / 2, `» ${t('outputs')} ●`, 10, c.outputColor, { weight: 600 });
    named(step.outputs).forEach((io, k) => {
      const oy = outTop + LABEL_H + k * (IO_H + IO_GAP);
      add('rect', { x, y: oy, w: COL_W, h: IO_H, r: 4, fill: c.outputBg });
      add('rect', { x: x + COL_W - 13, y: oy + IO_H / 2 - 3.5, w: 7, h: 7, r: 3.5, fill: c.outputColor });
      text(x + 8, oy + IO_H / 2, fit(io.name, 11, COL_W - 28), 11, c.textPrimary);
    });
  });

  // Loop bands, in source-step order, with the view's rail rules.
  const lanes = [];
  steps.forEach((step, i) => {
    if (!step.loop) return;
    const targetIdx = step.loop.targetStepId ? steps.findIndex((s) => s.id === step.loop.targetStepId) : -1;
    lanes.push({ step, sourceIdx: i, targetIdx });
  });
  const pass = loopPassColumns(n, lanes);
  const arrows = loopArrowColumns(n, lanes);
  let y = outTop + outRowH;
  lanes.forEach(({ step, sourceIdx: src, targetIdx }, lane) => {
    const rail = (x1, x2, y1, y2, dash) => add('line', { x1, y1, x2, y2, stroke: c.loop, width: 2, dash, role: 'rail' });
    const railY = y + RAIL_H / 2;
    const bodyTop = y + RAIL_H + 4;
    const before = pass[lane].filter((col) => col < src);
    const left = before.length ? colX(before[before.length - 1] + 1) : colX(0);
    const right = colX(src) + COL_W;

    // Rework chips right → left; a wrapped line starts at the band's right edge.
    const chips = [];
    let line = 0;
    let cursor = colX(src) - CHIP_GAP;
    (step.loop.steps || []).forEach((ls) => {
      const title = ls.title || t('loopStepPlaceholder');
      const w = Math.min(Math.max(measure(title, 11) + 20, CHIP_MIN), right - left - CHIP_GAP);
      let first = false;
      if (cursor - w < left) { line += 1; cursor = right; first = true; }
      const cy = line === 0 ? bodyTop : bodyTop + CTRL_H + LINE_GAP + (line - 1) * (CHIP_H + LINE_GAP);
      chips.push({ x: cursor - w, y: cy, w, title, empty: !ls.title, arrow: !first });
      cursor -= w + CHIP_GAP;
    });
    const bodyH = Math.max(CTRL_H, ...chips.map((ch) => ch.y + CHIP_H - bodyTop));
    const bandH = RAIL_H + 4 + bodyH + 12;

    pass[lane].forEach((col) => add('line', { x1: cx(col), y1: y, x2: cx(col), y2: y + bandH, stroke: c.loop, width: 2, role: 'pass' }));
    loopRailCells(n, src, targetIdx).forEach((cell, col) => {
      if (!cell) return;
      if (cell !== 'span') rail(cx(col), cx(col), y, railY);
      if (cell === 'target') rail(cx(col), colX(col) + COL_W, railY, railY);
      if (cell === 'span') rail(colX(col) - GAP, colX(col) + COL_W, railY, railY);
      if (cell === 'source') rail(colX(col) - GAP, cx(col), railY, railY);
      if (cell === 'source-open') rail(colX(col) + COL_W / 4, cx(col), railY, railY, true);
    });
    if (lane === 0) {
      arrows.forEach((col) => add('polygon', {
        points: [[cx(col) - 5, y + 8], [cx(col) + 5, y + 8], [cx(col), y - 2]], fill: c.loop, role: 'arrow',
      }));
    }

    // Controls box at the source column.
    const bx = colX(src);
    add('rect', { x: bx, y: bodyTop, w: COL_W, h: CTRL_H, r: 6, fill: c.loopBg, stroke: c.loopBorder });
    add('line', { x1: bx + COL_W - 1.5, y1: bodyTop + 3, x2: bx + COL_W - 1.5, y2: bodyTop + CTRL_H - 3, stroke: c.loop, width: 3 });
    const target = steps[targetIdx];
    const targetLabel = target ? `${String(targetIdx + 1).padStart(2, '0')}${target.title ? ` — ${target.title}` : ''}` : '—';
    text(bx + 10, bodyTop + 14, t('loopLabel'), 11, c.loop, { weight: 600 });
    text(bx + 10, bodyTop + 36, fit(`${t('loopCondition')}: ${step.loop.condition || '—'}`, 11, COL_W - 24), 11, c.textPrimary);
    text(bx + 10, bodyTop + 58, fit(`${t('loopTarget')}: ${targetLabel}`, 11, COL_W - 24), 11, c.textSecondary);

    chips.forEach((ch) => {
      add('rect', { x: ch.x, y: ch.y, w: ch.w, h: CHIP_H, r: 4, fill: c.bgSecondary, stroke: c.loopBorder });
      text(ch.x + 10, ch.y + CHIP_H / 2, fit(ch.title, 11, ch.w - 20), 11, ch.empty ? c.textTertiary : c.textPrimary);
      if (ch.arrow) text(ch.x + ch.w + CHIP_GAP / 2, ch.y + CHIP_H / 2, '«', 13, c.loop, { align: 'center' });
    });
    y += bandH;
  });

  bg.h = y + PAD;
  return { width, height: bg.h, items };
}

/** Canvas/SVG font shorthand for a text item. */
const fontOf = (it) => `${it.weight || 400} ${it.size}px ${FONT}`;

/**
 * Paint a scene onto a Canvas 2D context (already scaled by the caller).
 * @param {{items:Array<object>}} scene
 * @param {CanvasRenderingContext2D} ctx
 */
export function renderSceneToCanvas(scene, ctx) {
  scene.items.forEach((it) => {
    ctx.setLineDash(it.dash ? [4, 3] : []);
    ctx.beginPath();
    switch (it.kind) {
      case 'rect':
        ctx.roundRect(it.x, it.y, it.w, it.h, it.r || 0);
        if (it.fill) { ctx.fillStyle = it.fill; ctx.fill(); }
        if (it.stroke) { ctx.strokeStyle = it.stroke; ctx.lineWidth = 1; ctx.stroke(); }
        break;
      case 'line':
        ctx.moveTo(it.x1, it.y1);
        ctx.lineTo(it.x2, it.y2);
        ctx.strokeStyle = it.stroke;
        ctx.lineWidth = it.width || 1;
        ctx.stroke();
        break;
      case 'polygon':
        it.points.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fillStyle = it.fill;
        ctx.fill();
        break;
      case 'text':
        ctx.font = fontOf(it);
        ctx.fillStyle = it.fill;
        ctx.textAlign = it.align || 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(it.text, it.x, it.y);
        break;
      default:
    }
  });
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** SVG paint attribute; rgb()/rgba() become hex plus an opacity attribute for wider viewer support. */
function paint(attr, color) {
  if (!color) return `${attr}="none"`;
  const m = color.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[,/]\s*([\d.]+)(%?))?\s*\)$/);
  if (!m) return `${attr}="${esc(color)}"`;
  const hex = `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`;
  const alpha = m[4] === undefined ? 1 : Number(m[4]) / (m[5] ? 100 : 1);
  return alpha < 1 ? `${attr}="${hex}" ${attr}-opacity="${alpha}"` : `${attr}="${hex}"`;
}

const ANCHOR = { left: 'start', center: 'middle', right: 'end' };

/**
 * Serialize a scene to a standalone SVG document string.
 * @param {{width:number, height:number, items:Array<object>}} scene
 * @returns {string}
 */
export function renderSceneToSVG({ width, height, items }) {
  const body = items.map((it) => {
    const dash = it.dash ? ' stroke-dasharray="4 3"' : '';
    switch (it.kind) {
      case 'rect':
        return `<rect x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}"${it.r ? ` rx="${it.r}"` : ''} ${paint('fill', it.fill)}${it.stroke ? ` ${paint('stroke', it.stroke)}` : ''}${dash}/>`;
      case 'line':
        return `<line x1="${it.x1}" y1="${it.y1}" x2="${it.x2}" y2="${it.y2}" ${paint('stroke', it.stroke)} stroke-width="${it.width || 1}"${dash}/>`;
      case 'polygon':
        return `<polygon points="${it.points.map((p) => p.join(',')).join(' ')}" ${paint('fill', it.fill)}/>`;
      case 'text':
        return `<text x="${it.x}" y="${it.y}" ${paint('fill', it.fill)} font-size="${it.size}" font-weight="${it.weight || 400}" font-family="${FONT}" text-anchor="${ANCHOR[it.align || 'left']}" dominant-baseline="central">${esc(it.text)}</text>`;
      default:
        return '';
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body.join('')}</svg>`;
}

/** Build the scene with the live theme colours and canvas text metrics. */
function sceneFor(steps, t) {
  const mctx = document.createElement('canvas').getContext('2d');
  const measure = (str, size, weight) => {
    mctx.font = fontOf({ size, weight });
    return mctx.measureText(str).width;
  };
  return buildPmapScene(steps, { t, colors: readColors(), measure });
}

/**
 * Render the process map to a 2× PNG and trigger a download.
 * @param {Array<object>} steps
 * @param {(key:string)=>string} t i18n translator (bare keys)
 * @param {function} [notify]
 */
export function exportPmapPNG(steps, t, notify) {
  const scene = sceneFor(steps, t);
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = scene.width * scale;
  canvas.height = scene.height * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  renderSceneToCanvas(scene, ctx);
  canvas.toBlob((blob) => downloadBlob(blob, 'process-map.png'), 'image/png');
  notify?.('PNG ✓', 'success');
}

/**
 * Render the process map to a standalone SVG and trigger a download.
 * @param {Array<object>} steps
 * @param {(key:string)=>string} t i18n translator (bare keys)
 * @param {function} [notify]
 */
export function exportPmapSVG(steps, t, notify) {
  const svg = renderSceneToSVG(sceneFor(steps, t));
  downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), 'process-map.svg');
  notify?.('SVG ✓', 'success');
}
