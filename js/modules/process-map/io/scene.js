/**
 * D.Mike — Process Map Bildexport: Szene und SVG.
 *
 * `buildPmapScene` legt die Kette wie am Bildschirm an — je Schritt eine
 * Spalte, Zeilen für Inputs, Karten und Outputs, darunter je Loop ein Band —
 * und liefert eine flache Liste von Zeichenelementen. `renderSceneToSVG`
 * malt sie nur. Rein: Farben und Textbreiten kommen herein (Viewmodel:
 * `this.cssVars(SCENE_VARS)` und ein Canvas-`measureText`).
 */
import { loopRailCells, loopPassColumns, loopArrowColumns, loopLanes, stepNumber } from '../domain/loops.js';

export const FONT = 'DM Sans, system-ui, sans-serif';
const PAD = 20;
const COL_W = 224;
const GAP = 32;        // Spaltenabstand, trägt den »-Verbinder
const ROW_GAP = 10;
const LABEL_H = 20;
const IO_H = 26;
const IO_GAP = 6;
const HDR_H = 36;
const DESC_H = 26;
const SUB_BAR_H = 24;
const SUB_H = 26;
const RAIL_H = 20;
const CTRL_H = 76;     // Kasten des Loops: Titel, Bedingung, Ziel
const CHIP_H = 26;
const CHIP_MIN = 120;
const CHIP_GAP = 16;   // Platz für das « zwischen den Chips
const LINE_GAP = 8;
const DOT = 7;         // Durchmesser des Punkts vor Inputs und nach Outputs

/** Die CSS-Variablen, die der Bildexport liest (Schlüssel → Variable). */
export const SCENE_VARS = Object.freeze({
  bgPrimary: '--color-bg-primary',
  bgSecondary: '--color-bg-secondary',
  bgTertiary: '--color-bg-tertiary',
  border: '--color-border-secondary',
  textPrimary: '--color-text-primary',
  textSecondary: '--color-text-secondary',
  textTertiary: '--color-text-tertiary',
  accent: '--color-accent',
  accentBg: '--pmap-step-accent-bg',
  inputColor: '--pmap-input',
  inputBg: '--pmap-input-bg',
  outputColor: '--pmap-output',
  outputBg: '--pmap-output-bg',
  connector: '--pmap-connector',
  va: '--pmap-va',
  vaBg: '--pmap-va-bg',
  bnva: '--pmap-bnva',
  bnvaBg: '--pmap-bnva-bg',
  nva: '--pmap-nva',
  nvaBg: '--pmap-nva-bg',
  param: '--pmap-param',
  paramBg: '--pmap-param-bg',
  noise: '--pmap-noise',
  noiseBg: '--pmap-noise-bg',
  loop: '--pmap-loop',
  loopBg: '--pmap-loop-bg',
  loopBorder: '--pmap-loop-border',
});

/** Rückfallfarben (helles Schema der Altform), wenn eine Variable leer ist. */
const FALLBACK = Object.freeze({
  bgPrimary: '#ffffff',
  bgSecondary: '#f8f9fa',
  bgTertiary: '#e9ecef',
  border: '#dee2e6',
  textPrimary: '#212529',
  textSecondary: '#6c757d',
  textTertiary: '#adb5bd',
  accent: '#0066cc',
  accentBg: 'rgba(0,102,204,0.10)',
  inputColor: '#34c759',
  inputBg: 'rgba(52,199,89,0.10)',
  outputColor: '#ff9500',
  outputBg: 'rgba(255,149,0,0.10)',
  connector: '#dee2e6',
  va: '#34c759',
  vaBg: 'rgba(52,199,89,0.12)',
  bnva: '#ff9f0a',
  bnvaBg: 'rgba(255,159,10,0.12)',
  nva: '#ff3b30',
  nvaBg: 'rgba(255,59,48,0.12)',
  param: '#007aff',
  paramBg: 'rgba(0,122,255,0.12)',
  noise: '#af52de',
  noiseBg: 'rgba(175,82,222,0.12)',
  loop: '#e67e22',
  loopBg: 'rgba(230,126,34,0.08)',
  loopBorder: 'rgba(230,126,34,0.30)',
});

/**
 * @typedef {import('../domain/model.types.js').StateFields['steps']} Steps
 * @typedef {{ kind: string, role?: string, [key: string]: any }} SceneItem
 * @typedef {{ width: number, height: number, items: SceneItem[] }} Scene
 * @typedef {{ t: (key: string) => string, colors: Partial<Record<keyof typeof SCENE_VARS, string>>,
 *   measure: (text: string, size: number, weight?: number) => number }} SceneOptions
 */

/**
 * Die Kette als flache Liste von Zeichenelementen in Malreihenfolge.
 * Elemente: `rect {x,y,w,h,r?,fill?,stroke?,dash?}`, `line {x1,y1,x2,y2,stroke,width?,dash?}`,
 * `polygon {points:[[x,y],…],fill}`, `text {x,y,text,size,weight?,fill,align?}`
 * (y ist die senkrechte Textmitte). Manche tragen eine `role`
 * (card, rail, pass, arrow, dot, chevron), die der Renderer übergeht.
 * @param {Steps} steps die Schritte des Models
 * @param {SceneOptions} opts
 * @returns {Scene}
 */
export function buildPmapScene(steps, { t, colors, measure }) {
  const c = /** @type {Record<keyof typeof SCENE_VARS, string>} */ (Object.fromEntries(
    Object.keys(FALLBACK).map((k) => [k, colors[/** @type {keyof typeof SCENE_VARS} */ (k)] || FALLBACK[/** @type {keyof typeof FALLBACK} */ (k)]])));
  /** @type {SceneItem[]} */
  const items = [];
  const add = (/** @type {string} */ kind, /** @type {object} */ props) => items.push({ kind, ...props });
  const text = (/** @type {number} */ x, /** @type {number} */ y, /** @type {string} */ str, /** @type {number} */ size,
    /** @type {string} */ fill, extra = {}) => add('text', { x, y, text: str, size, fill, ...extra });
  const fit = (/** @type {unknown} */ str, /** @type {number} */ size, /** @type {number} */ maxW, weight = 400) => {
    let s = String(str ?? '');
    if (measure(s, size, weight) <= maxW) return s;
    while (s && measure(`${s}…`, size, weight) > maxW) s = s.slice(0, -1);
    return `${s}…`;
  };
  const badge = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ h, /** @type {string} */ str,
    /** @type {number} */ size, /** @type {string} */ fg, /** @type {string} */ bg) => {
    const w = measure(str, size, 600) + 10;
    add('rect', { x, y, w, h, r: 4, fill: bg });
    text(x + w / 2, y + h / 2, str, size, fg, { weight: 600, align: 'center' });
    return w;
  };
  const dot = (/** @type {number} */ x, /** @type {number} */ cy, /** @type {string} */ fill) => add('rect', {
    x, y: cy - DOT / 2, w: DOT, h: DOT, r: DOT / 2, fill, role: 'dot',
  });

  const n = steps.length;
  const colX = (/** @type {number} */ i) => PAD + i * (COL_W + GAP);
  const cx = (/** @type {number} */ i) => colX(i) + COL_W / 2;
  /** @template {{ name: string }} T @param {T[]} list @returns {T[]} */
  const named = (list) => list.filter((io) => io.name);
  const ioH = (/** @type {Array<{ name: string }>} */ list) => LABEL_H + named(list).length * (IO_H + IO_GAP);
  const subCount = (/** @type {Steps[number]} */ s) => s.substeps.length;
  const cardH = (/** @type {Steps[number]} */ s) => HDR_H + (s.description ? DESC_H : 0) + SUB_BAR_H
    + (subCount(s) ? subCount(s) * SUB_H + 8 : 0);
  const maxOf = (/** @type {(s: Steps[number]) => number} */ fn) => Math.max(0, ...steps.map(fn));

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
    // Inputs, unten bündig über der Karte; vor der Beschriftung ein Punkt.
    let y = PAD + inRowH - ioH(step.inputs);
    dot(x, y + LABEL_H / 2, c.inputColor);
    text(x + DOT + 4, y + LABEL_H / 2, `${t('inputs')} »`, 10, c.inputColor, { weight: 600 });
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

    // Karte.
    add('rect', { x, y: cardTop, w: COL_W, h: cardRowH, r: 8, fill: c.bgSecondary, stroke: c.border, role: 'card' });
    add('line', { x1: x, y1: cardTop + HDR_H, x2: x + COL_W, y2: cardTop + HDR_H, stroke: c.border });
    let tx = x + 10;
    tx += badge(tx, cardTop + 8, 20, stepNumber(i), 11, c.accent, c.accentBg) + 6;
    if (step.valueType) {
      const vt = step.valueType;
      tx += badge(tx, cardTop + 8, 20, t(vt), 10, c[vt], c[/** @type {keyof typeof SCENE_VARS} */ (`${vt}Bg`)]) + 6;
    }
    text(tx, cardTop + 18, fit(step.title || t('stepNamePlaceholder'), 13, x + COL_W - 10 - tx, 600), 13,
      step.title ? c.textPrimary : c.textTertiary, { weight: 600 });
    y = cardTop + HDR_H;
    if (step.description) {
      text(x + 12, y + DESC_H / 2, fit(step.description, 11, COL_W - 24), 11, c.textSecondary);
      y += DESC_H;
    }
    const subs = step.substeps;
    add('line', { x1: x, y1: y, x2: x + COL_W, y2: y, stroke: c.border });
    const barColor = subs.length ? c.accent : c.textTertiary;
    // Winkel vor „Detail-Schritte“: nach unten offen mit Unterschritten, sonst nach rechts.
    const my = y + SUB_BAR_H / 2;
    const chevron = subs.length
      ? [[x + 10, my - 2], [x + 17, my - 2], [x + 13.5, my + 2.5]]
      : [[x + 11.5, my - 3.5], [x + 11.5, my + 3.5], [x + 16, my]];
    add('polygon', { points: chevron, fill: barColor, role: 'chevron' });
    text(x + 21, my, `${t('substepsLabel')}${subs.length ? ` (${subs.length})` : ''}`, 10, barColor, { weight: 600 });
    subs.forEach((ss, k) => {
      const sy = y + SUB_BAR_H + 4 + k * SUB_H;
      add('rect', { x: x + 8, y: sy, w: COL_W - 16, h: SUB_H - 2, r: 4, fill: c.bgTertiary });
      text(x + 14, sy + (SUB_H - 2) / 2, `${i + 1}.${k + 1}`, 11, c.accent);
      text(x + 46, sy + (SUB_H - 2) / 2, fit(ss.title, 11, COL_W - 60), 11, c.textPrimary);
    });
    if (i < n - 1) {
      text(x + COL_W + GAP / 2, cardTop + cardRowH / 2, '»', 18, c.connector, { align: 'center' });
    }

    // Outputs, oben bündig unter der Karte; nach der Beschriftung ein Punkt.
    const outLabel = `» ${t('outputs')}`;
    text(x, outTop + LABEL_H / 2, outLabel, 10, c.outputColor, { weight: 600 });
    dot(x + measure(outLabel, 10, 600) + 4, outTop + LABEL_H / 2, c.outputColor);
    named(step.outputs).forEach((io, k) => {
      const oy = outTop + LABEL_H + k * (IO_H + IO_GAP);
      add('rect', { x, y: oy, w: COL_W, h: IO_H, r: 4, fill: c.outputBg });
      add('rect', { x: x + COL_W - 13, y: oy + IO_H / 2 - 3.5, w: 7, h: 7, r: 3.5, fill: c.outputColor });
      text(x + 8, oy + IO_H / 2, fit(io.name, 11, COL_W - 28), 11, c.textPrimary);
    });
  });

  // Loop-Bänder in Reihenfolge der Quellschritte, nach den Schienenregeln der Ansicht.
  const lanes = loopLanes(steps);
  const pass = loopPassColumns(n, lanes);
  const arrows = loopArrowColumns(n, lanes);
  let y = outTop + outRowH;
  lanes.forEach(({ step, sourceIdx: src, targetIdx }, lane) => {
    const loop = /** @type {NonNullable<Steps[number]['loop']>} */ (step.loop);
    const rail = (/** @type {number} */ x1, /** @type {number} */ x2, /** @type {number} */ y1, /** @type {number} */ y2,
      /** @type {boolean} */ dash = false) => add('line', { x1, y1, x2, y2, stroke: c.loop, width: 2, dash, role: 'rail' });
    const railY = y + RAIL_H / 2;
    const bodyTop = y + RAIL_H + 4;
    const before = pass[lane].filter((col) => col < src);
    const left = before.length ? colX(before[before.length - 1] + 1) : colX(0);
    const right = colX(src) + COL_W;

    // Rework-Chips von rechts nach links; eine umbrochene Zeile beginnt am rechten Bandrand.
    /** @type {Array<{ x: number, y: number, w: number, title: string, empty: boolean, arrow: boolean }>} */
    const chips = [];
    let line = 0;
    let cursor = colX(src) - CHIP_GAP;
    loop.steps.forEach((ls) => {
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

    // Kasten mit Bedingung und Ziel an der Quellspalte.
    const bx = colX(src);
    add('rect', { x: bx, y: bodyTop, w: COL_W, h: CTRL_H, r: 6, fill: c.loopBg, stroke: c.loopBorder });
    add('line', { x1: bx + COL_W - 1.5, y1: bodyTop + 3, x2: bx + COL_W - 1.5, y2: bodyTop + CTRL_H - 3, stroke: c.loop, width: 3 });
    const target = targetIdx >= 0 && targetIdx < src ? steps[targetIdx] : null;
    const targetLabel = target ? `${stepNumber(targetIdx)}${target.title ? ` — ${target.title}` : ''}` : '—';
    text(bx + 10, bodyTop + 14, t('loopLabel'), 11, c.loop, { weight: 600 });
    text(bx + 10, bodyTop + 36, fit(`${t('loopCondition')}: ${loop.condition || '—'}`, 11, COL_W - 24), 11, c.textPrimary);
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

/** @param {unknown} s @returns {string} für XML maskiert */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * SVG-Farbattribut; rgb()/rgba() werden Hex plus Deckkraft (breitere Unterstützung in Betrachtern).
 * @param {string} attr @param {string|undefined} color @returns {string}
 */
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
 * Eine Szene als eigenständiges SVG-Dokument.
 * @param {Scene} scene @returns {string}
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
        return `<polygon points="${it.points.map((/** @type {number[]} */ p) => p.join(',')).join(' ')}" ${paint('fill', it.fill)}/>`;
      case 'text':
        return `<text x="${it.x}" y="${it.y}" ${paint('fill', it.fill)} font-size="${it.size}" font-weight="${it.weight || 400}" font-family="${FONT}" text-anchor="${ANCHOR[/** @type {'left'|'center'|'right'} */ (it.align || 'left')]}" dominant-baseline="central">${esc(it.text)}</text>`;
      default:
        return '';
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body.join('')}</svg>`;
}
