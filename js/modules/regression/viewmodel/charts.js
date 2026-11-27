/**
 * D.Mike — Regression: Konfiguration der Diagramme.
 *
 * Reine Funktionen: aus dem vollen Ergebnis der Rechnung (`analyze.js`) je
 * Reiter die Konfiguration des Diagramm-Widgets, wie die Altform sie dem
 * chartManager gab. Kurven, Bänder und Effektlinien rechnet die Engine
 * (`regression-engine.js`); hier wird nur abgetastet und beschriftet. Farben
 * gehen als `var(--…)` ins Widget, der Typ löst sie beim Zeichnen auf.
 */
import {
  regressionCurvePoints, confidenceBand, predictionBand, normalQuantile, predictMulti,
} from '../../../engines/regression-engine.js';
import { formatNumber } from '../../../core/number-format.js';

/** @typedef {(key: string, params?: object) => string} T */

/** Stützstellen je Effektlinie (Altform). */
const STEPS = 50;
/** Farben der drei Stufen im Wechselwirkungsdiagramm (Altform). */
const LEVEL_COLORS = ['var(--color-chart-1)', 'var(--color-chart-3)', 'var(--color-error)'];
/** Schriftgrößen der Effektdiagramme (Altform). */
const CELL_SIZES = { titleSize: 13, labelSize: 11, tickSize: 10 };

/**
 * Eine unsichtbare Linienreihe (nur die Verbindungslinie wird gezeichnet).
 * @param {string} name @param {number[]} x @param {number[]} y
 * @param {{ dash: string, width: number, color: string, foreground?: boolean }} line
 */
const lineSeries = (name, x, y, line) => ({
  name, color: 'transparent', stroke: 'transparent', markerSize: 0, x, y,
  connectLine: { show: true, ...line },
});

/**
 * Konfidenzniveau als ganze Prozentzahl für Reihennamen („CI 95%“).
 * @param {number} conf @param {string} lang @returns {string}
 */
const pct = (conf, lang) => formatNumber(conf * 100, lang, { decimals: 0 });

/**
 * Reiter „Regression“ bzw. „Ist vs. Soll“.
 * @param {any} r volles Ergebnis
 * @param {{ showCI: boolean, showPI: boolean, t: T, lang: string }} o
 * @returns {object}
 */
export function scatterConfig(r, { showCI, showPI, t, lang }) {
  if (r.multiX && r.xCount > 1) {
    const nameY = r._nameY || 'Y';
    const lo = Math.min(...r.yHat, ...r.ys);
    const hi = Math.max(...r.yHat, ...r.ys);
    return {
      title: t('tabActualVsPredicted'),
      xLabel: `${nameY} (${t('fittedValues')})`,
      yLabel: `${nameY} (${t('dataPoints')})`,
      showLegend: true,
      series: [
        { name: '', color: 'transparent', markerSize: 0, x: [lo, hi], y: [lo, hi],
          connectLine: { show: true, dash: 'dash', width: 1.5, color: 'var(--color-chart-2)' } },
        { name: t('dataPoints'), color: 'var(--color-chart-1)', markerSize: 4, strokeWidth: 0.75,
          x: [...r.yHat], y: [...r.ys], symbol: 'circle' },
      ],
    };
  }
  const nameX = r._nameX || (r._xNames ? r._xNames[0] : 'X');
  const nameY = r._nameY || 'Y';
  const xs = r.multiX ? r.xMatrix[0] : r.xs;
  /** @type {object[]} */
  const series = [{
    name: t('dataPoints'), color: 'var(--color-chart-1)', markerSize: 4, strokeWidth: 0.75,
    x: [...xs], y: [...r.ys], symbol: 'circle',
  }];
  const curve = typeof r.reg?.predict === 'function' ? regressionCurvePoints(r) : [];
  if (curve.length > 0) {
    series.push(lineSeries(t('regressionLine'), curve.map((p) => p.x), curve.map((p) => p.y),
      { dash: 'solid', width: 2, color: 'var(--color-error)', foreground: true }));
    /** @param {(r: any, x: number) => any} band @param {string} label @param {string} dash @param {string} color */
    const bands = (band, label, dash, color) => {
      const upper = [];
      const lower = [];
      for (const pt of curve) {
        const b = band(r, pt.x);
        if (b) { upper.push({ x: pt.x, y: b.upper }); lower.push({ x: pt.x, y: b.lower }); }
      }
      if (upper.length === 0) return;
      const line = { dash, width: 1.2, color };
      series.push(lineSeries(`${label} ${pct(r.confLevel, lang)}%`, upper.map((p) => p.x), upper.map((p) => p.y), line));
      series.push(lineSeries('', lower.map((p) => p.x), lower.map((p) => p.y), line));
    };
    if (showCI && r.multiX) bands(confidenceBand, 'CI', 'dash', 'var(--color-chart-2)');
    if (showPI && r.multiX) bands(predictionBand, 'PI', 'dot', 'var(--color-chart-4)');
  }
  return { title: `${nameX} → ${nameY}`, xLabel: nameX, yLabel: nameY, showLegend: true, series };
}

/** Nulllinie der Residuendiagramme. */
const ZERO_LINE = Object.freeze([{ dir: 'h', value: 0, dash: 'dash', width: 1, color: 'var(--color-error)', label: '0' }]);

/**
 * Reiter „Residuen“: Residuen gegen angepasste Werte.
 * @param {any} r @param {T} t @returns {object}
 */
export function residualsConfig(r, t) {
  return {
    title: t('residualsVsFitted'), xLabel: t('fittedValues'), yLabel: t('residuals'), showLegend: false,
    moduleRefLines: ZERO_LINE.map((l) => ({ ...l })),
    series: [{ name: t('residuals'), color: 'var(--color-chart-3)', markerSize: 4, strokeWidth: 0.75, x: [...r.yHat], y: [...r.residuals], symbol: 'circle' }],
  };
}

/**
 * Reiter „Reihenfolge“: Residuen in Beobachtungsfolge.
 * @param {any} r @param {T} t @returns {object}
 */
export function orderConfig(r, t) {
  return {
    title: t('residualsVsOrder'), xLabel: t('observationNr'), yLabel: t('residuals'), showLegend: false,
    moduleRefLines: ZERO_LINE.map((l) => ({ ...l })),
    series: [{
      name: t('residuals'), color: 'var(--color-chart-4)', markerSize: 4, strokeWidth: 0.75,
      x: r.residuals.map((/** @type {number} */ _, /** @type {number} */ i) => i + 1), y: [...r.residuals], symbol: 'circle',
      connectLine: { show: true, dash: 'solid', width: 1, color: 'var(--color-chart-4)' },
    }],
  };
}

/**
 * Reiter „Q-Q-Plot“: standardisierte Residuen gegen Normalquantile.
 * @param {any} r @param {T} t @returns {object}
 */
export function qqConfig(r, t) {
  const sorted = [...r.residuals].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
  const theoretical = sorted.map((_, i) => normalQuantile((i + 0.5) / n));
  const standardized = sorted.map((v) => (sd > 0 ? (v - mean) / sd : 0));
  const lo = Math.min(Math.min(...theoretical), Math.min(...standardized));
  const hi = Math.max(Math.max(...theoretical), Math.max(...standardized));
  return {
    title: t('qqTitle'), xLabel: t('theoreticalQuantiles'), yLabel: t('standardizedResiduals'), showLegend: false,
    series: [
      { name: '', color: 'transparent', markerSize: 0, x: [lo, hi], y: [lo, hi],
        connectLine: { show: true, dash: 'dash', width: 1.5, color: 'var(--color-chart-2)' } },
      { name: t('residuals'), color: 'var(--color-chart-5)', markerSize: 4, strokeWidth: 0.75, x: theoretical, y: standardized, symbol: 'circle' },
    ],
  };
}

/**
 * Reiter „Histogramm“ der Residuen mit Normalkurve.
 * @param {any} r @param {T} t @returns {object}
 */
export function histogramConfig(r, t) {
  return {
    title: t('histTitle'), xLabel: t('residuals'), yLabel: t('frequency'), showLegend: false,
    showNormalCurve: true, data: [...r.residuals],
  };
}

/**
 * Die Einträge des SS-Kreises: je Term ohne Achsenabschnitt der Beitrag
 * t²·MSE, zuletzt die Residuen (Altform).
 * @param {any} r @param {T} t
 * @returns {Array<{ label: string, ss: number, color: string }>}
 */
export function ssItemsOf(r, t) {
  const items = [];
  for (const c of r.coefDetails || []) {
    if (c.term === 'Intercept') continue;
    items.push({ label: c.term, ss: c.t != null ? c.t ** 2 * r.MSE : 0 });
  }
  items.push({ label: t('sourceResiduals'), ss: r.SSE });
  return items.map((it, i) => ({ ...it, color: `var(--color-chart-${(i % 10) + 1})` }));
}

/**
 * Der SS-Kreis über die sichtbaren Einträge.
 * @param {Array<{ label: string, ss: number, color: string }>} items
 * @param {readonly number[]} hidden Indizes ausgeblendeter Einträge
 * @returns {object}
 */
export function pieConfig(items, hidden) {
  return {
    showLegend: false, showTitle: false,
    slices: items.filter((_, i) => !hidden.includes(i)).map((it) => ({ name: it.label, value: it.ss, color: it.color })),
  };
}

/**
 * Die Balken der sichtbaren Einträge, absteigend nach Beitrag, je Balken
 * die Farbe seines Kreisstücks.
 * @param {Array<{ label: string, ss: number, color: string }>} items
 * @param {readonly number[]} hidden @param {T} t
 * @returns {object}
 */
export function barConfig(items, hidden, t) {
  const visible = items.filter((_, i) => !hidden.includes(i)).sort((a, b) => b.ss - a.ss);
  return {
    categories: visible.map((v) => v.label),
    groups: [{ name: t('ssLabel'), values: visible.map((v) => v.ss), colors: visible.map((v) => v.color) }],
    yLabel: t('ssLabel'), showLegend: false, categoryGap: 0.35,
  };
}

/**
 * Mittelwerte der X-Spalten.
 * @param {any} r @returns {number[]}
 */
const xMeansOf = (r) => r.xMatrix.map((/** @type {number[]} */ col) => col.reduce((s, v) => s + v, 0) / col.length);

/**
 * Indizes der X mit mindestens einem eingeschlossenen Term (Altform).
 * @param {any} r @returns {number[]}
 */
function activePredictors(r) {
  const excluded = new Set(r.excludeTerms || []);
  const names = r._xNames || [];
  const terms = r.allTerms || [];
  return names.map((/** @type {string} */ name, /** @type {number} */ xi) => (terms.some((/** @type {string} */ term) => term !== 'Intercept' && term.includes(name) && !excluded.has(term)) ? xi : -1))
    .filter((/** @type {number} */ xi) => xi >= 0);
}

/**
 * Indizes der X, die in einer eingeschlossenen Wechselwirkung stehen (Altform).
 * @param {any} r @returns {Set<number>}
 */
function interactionPredictors(r) {
  const excluded = new Set(r.excludeTerms || []);
  const names = r._xNames || [];
  /** @type {Set<number>} */
  const out = new Set();
  for (const term of r.allTerms || []) {
    if (term === 'Intercept' || excluded.has(term) || !term.includes('·')) continue;
    names.forEach((/** @type {string} */ name, /** @type {number} */ xi) => { if (term.includes(name)) out.add(xi); });
  }
  return out;
}

/**
 * Die Linie der Vorhersage über X `xi` (übrige X auf festen Werten).
 * @param {any} r @param {number} xi @param {number[]} base
 * @returns {{ x: number[], y: number[] }|null} `null`, wenn die Engine nicht vorhersagen kann
 */
function effectLine(r, xi, base) {
  const col = r.xMatrix[xi];
  const lo = Math.min(...col);
  const hi = Math.max(...col);
  const step = (hi - lo) / (STEPS - 1);
  const x = [];
  const y = [];
  try {
    for (let s = 0; s < STEPS; s++) {
      const v = lo + s * step;
      const vals = [...base];
      vals[xi] = v;
      x.push(v);
      y.push(predictMulti(r, vals).yHat);
    }
  } catch {
    return null;
  }
  return y.every((v) => Number.isFinite(v)) ? { x, y } : null;
}

/**
 * Schlüssel einer Diagrammzelle wie die Altform (`allocateKey`): der erste
 * ohne Zusatz, ab dem zweiten `#2`, `#3`, ….
 * @param {string} base @param {number} i @returns {string}
 */
export const legacyCellKey = (base, i) => (i === 0 ? base : `${base}#${i + 1}`);

/**
 * Eine Zelle der Effektdiagramme: Schlüssel im Model (Index als Text),
 * Altschlüssel der `chartEdits` und Konfiguration.
 * @typedef {{ key: string, legacyKey: string, config: object }} Cell
 */

/**
 * Reiter „Haupteffekte“: je X ohne Wechselwirkung eine Zelle.
 * @param {any} r @param {T} t @returns {Cell[]}
 */
export function mainEffectsCells(r, t) {
  if (!r.multiX || typeof r.reg?.predict !== 'function') return [];
  const means = xMeansOf(r);
  const yMean = r.ys.reduce((/** @type {number} */ s, /** @type {number} */ v) => s + v, 0) / r.ys.length;
  const names = r._xNames || [];
  const active = new Set(activePredictors(r));
  const inter = interactionPredictors(r);
  /** @type {Cell[]} */
  const cells = [];
  for (let xi = 0; xi < r.xCount; xi++) {
    if (!active.has(xi) || inter.has(xi)) continue;
    const line = effectLine(r, xi, means);
    if (!line) continue;
    const name = names[xi] || `X${xi + 1}`;
    const i = cells.length;
    cells.push({
      key: String(i),
      legacyKey: legacyCellKey('main-effects:scatter', i),
      config: {
        title: name, xLabel: name, yLabel: t('meanResponse'), ...CELL_SIZES, showLegend: false,
        moduleRefLines: [{ dir: 'h', value: yMean, dash: 'dash', width: 1, color: 'var(--color-text-tertiary)', label: '' }],
        series: [{ name, color: 'var(--color-chart-1)', markerSize: 0, x: line.x, y: line.y,
          connectLine: { show: true, dash: 'solid', width: 2.5, color: 'var(--color-chart-1)' } }],
      },
    });
  }
  return cells;
}

/**
 * Reiter „Wechselwirkungen“: je geordnetem Paar aktiver X eine Zelle mit
 * drei Linien (Stufe niedrig, Mitte, hoch des zweiten X).
 * @param {any} r @param {T} t @returns {Cell[]}
 */
export function interactionCells(r, t) {
  if (!r.multiX || r.xCount < 2 || typeof r.reg?.predict !== 'function') return [];
  const means = xMeansOf(r);
  const names = r._xNames || [];
  const active = new Set(activePredictors(r));
  /** @type {Cell[]} */
  const cells = [];
  for (let i = 0; i < r.xCount; i++) {
    if (!active.has(i)) continue;
    for (let j = 0; j < r.xCount; j++) {
      if (i === j || !active.has(j)) continue;
      const colJ = r.xMatrix[j];
      const levels = [
        { val: Math.min(...colJ), label: `${names[j]} ${t('levelLow')}` },
        { val: means[j], label: `${names[j]} ${t('levelMid')}` },
        { val: Math.max(...colJ), label: `${names[j]} ${t('levelHigh')}` },
      ];
      const series = [];
      for (const [li, lev] of levels.entries()) {
        const base = [...means];
        base[j] = lev.val;
        const line = effectLine(r, i, base);
        if (!line) break;
        series.push({ name: lev.label, color: LEVEL_COLORS[li], markerSize: 0, x: line.x, y: line.y,
          connectLine: { show: true, dash: 'solid', width: 2, color: LEVEL_COLORS[li] } });
      }
      if (series.length !== levels.length) continue;
      const k = cells.length;
      cells.push({
        key: String(k),
        legacyKey: legacyCellKey('interaction:scatter', k),
        config: { title: `${names[i]} × ${names[j]}`, xLabel: names[i], yLabel: t('meanResponse'), ...CELL_SIZES, showLegend: true, series },
      });
    }
  }
  return cells;
}
