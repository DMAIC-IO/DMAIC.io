/**
 * D.Mike — C&E-Matrix Export: die Tabelle als Deskriptor für `tableToSVG`
 * (für `exports.image()`). Die Farben der Summenzellen kommen aus den
 * aufgelösten CSS-Variablen des Moduls und werden wie in der Ansicht über die
 * Stopps des Verlaufs gemischt.
 */
import { cellKey, scoreOf, rowSum, colSum, grandTotal, heat } from '../domain/matrix.js';

/** Die CSS-Variablen, die der Bildexport liest (Schlüssel → Variable). */
export const HEAT_VARS = Object.freeze({
  heat0: '--ce-matrix-heat-0',
  heat1: '--ce-matrix-heat-1',
  heat2: '--ce-matrix-heat-2',
  heat3: '--ce-matrix-heat-3',
  heat4: '--ce-matrix-heat-4',
  muted: '--color-text-tertiary',
});

/**
 * Eine Farbe aus `#rgb`, `#rrggbb` oder `rgb(r, g, b)` als Kanäle; sonst `null`.
 * @param {string} text @returns {[number, number, number]|null}
 */
export function parseColor(text) {
  const s = String(text ?? '').trim();
  let hit = /^#([0-9a-f]{3})$/i.exec(s);
  if (hit) return /** @type {[number, number, number]} */ ([...hit[1]].map((d) => parseInt(d + d, 16)));
  hit = /^#([0-9a-f]{6})$/i.exec(s);
  if (hit) return /** @type {[number, number, number]} */ ([0, 2, 4].map((i) => parseInt(hit[1].slice(i, i + 2), 16)));
  hit = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(s);
  if (hit) return [Number(hit[1]), Number(hit[2]), Number(hit[3])];
  return null;
}

/**
 * Fläche und Schrift einer Summenzelle aus der Lage im Verlauf; ohne
 * Spannweite oder ohne lesbare Farben durchsichtig bzw. gedämpft.
 * @param {Record<string, string>} vars aufgelöste `HEAT_VARS`
 * @returns {{ cellBg: (v: number, min: number, max: number) => string, cellFg: (v: number, min: number, max: number) => string }}
 */
export function heatColors(vars) {
  const stops = [vars.heat0, vars.heat1, vars.heat2, vars.heat3, vars.heat4].map(parseColor);
  const muted = vars.muted || 'transparent';
  /** @param {number} v @param {number} min @param {number} max @returns {[number, number, number]|null} */
  const rgb = (v, min, max) => {
    const h = heat(v, min, max);
    if (!h) return null;
    const a = stops[h.segment];
    const b = stops[h.segment + 1];
    if (!a || !b) return null;
    return /** @type {[number, number, number]} */ (a.map((x, i) => Math.round(x + (b[i] - x) * h.t)));
  };
  return {
    cellBg(v, min, max) {
      const c = rgb(v, min, max);
      return c ? `rgba(${c[0]},${c[1]},${c[2]},.18)` : 'transparent';
    },
    cellFg(v, min, max) {
      const c = rgb(v, min, max);
      return c ? `rgb(${c[0]},${c[1]},${c[2]})` : muted;
    },
  };
}

/**
 * Der Tabellen-Deskriptor wie beim Altexport: Gewichte, Köpfe, Zellen (ohne
 * Eintrag leer), Summen und Gesamtsumme, Beschriftungen und Farben.
 * @param {import('../domain/matrix.js').MatrixLike} m
 * @param {(key: string) => string} t Übersetzer des Moduls
 * @param {Record<string, string>} vars aufgelöste `HEAT_VARS`
 * @returns {import('../../../core/export-utils.js').TableDescriptor}
 */
export function toTableDescriptor(m, t, vars) {
  return {
    outputs: m.outputs.map((o) => o.name),
    inputs: m.inputs.map((i) => i.name),
    weights: m.outputs.map((o) => o.weight),
    weightLabel: t('weight'),
    cells: m.inputs.map((i) => m.outputs.map((o) => (m.scores[cellKey(i.id, o.id)] !== undefined ? scoreOf(m, i.id, o.id) : ''))),
    rowSums: m.inputs.map((i) => rowSum(m, i.id)),
    colSums: m.outputs.map((o) => colSum(m, o.id)),
    grandTotal: grandTotal(m),
    rowSumLabel: t('rowSum'),
    colSumLabel: t('colSum'),
    ...heatColors(vars),
  };
}
