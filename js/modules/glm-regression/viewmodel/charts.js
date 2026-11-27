/**
 * D.Mike — GLM-Regression: Konfiguration der Diagramme.
 *
 * Reine Funktionen: aus dem vollen Ergebnis der Rechnung (`analyze.js`) die
 * Konfiguration des `scatter-chart`-Widgets, wie die Altform sie dem
 * chartManager gab (Residuen, Normal-Q-Q, Cook-Distanzen, ROC). Farben gehen
 * als `var(--…)` ins Widget, der Typ löst sie beim Zeichnen auf.
 */
import { normalOrderStats } from '../../../engines/glm-engine.js';
import { fmt } from './present.js';

/** @typedef {(key: string, params?: object) => string} T */

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
 * Diagnostik: Devianz-Residuen gegen angepasste Werte, Nulllinie.
 * @param {any} r @param {T} t @returns {object}
 */
export function residualsConfig(r, t) {
  return {
    title: t('residualsVsFitted'),
    xLabel: t('fittedValues'),
    yLabel: t('devianceResiduals'),
    series: [{
      x: [...r.fittedValues], y: [...r.devianceResiduals], name: t('devianceResiduals'),
      color: 'var(--color-chart-1)', markerSize: 5, strokeWidth: 0.75, symbol: 'circle',
    }],
    moduleRefLines: [{ dir: 'h', value: 0, dash: 'dash', color: 'var(--color-text-secondary)', width: 1 }],
  };
}

/**
 * Diagnostik: Normal-Q-Q-Plot der Devianz-Residuen mit Winkelhalbierender.
 * @param {any} r @param {T} t @returns {object}
 */
export function qqConfig(r, t) {
  const sorted = [...r.devianceResiduals].sort((a, b) => a - b);
  const theoretical = normalOrderStats(sorted.length);
  const lo = Math.min(theoretical[0], sorted[0]);
  const hi = Math.max(theoretical[theoretical.length - 1], sorted[sorted.length - 1]);
  return {
    title: t('qqTitle'),
    xLabel: t('theoreticalQuantiles'),
    yLabel: t('devianceResiduals'),
    series: [
      { x: theoretical, y: sorted, name: t('devianceResiduals'), color: 'var(--color-chart-1)', markerSize: 5, strokeWidth: 0.75, symbol: 'circle' },
      lineSeries(t('referenceLine'), [lo, hi], [lo, hi], { dash: 'dash', width: 1.5, color: 'var(--color-error)', foreground: true }),
    ],
  };
}

/**
 * Diagnostik: Cook-Distanzen je Beobachtung mit der Schwelle 4/n.
 * @param {any} r @param {T} t @param {string} lang @returns {object}
 */
export function cooksConfig(r, t, lang) {
  const cooks = r._cooks ?? [];
  const threshold = 4 / r.n;
  return {
    title: t('cooksTitle'),
    xLabel: t('observationNr'),
    yLabel: t('cooksDistance'),
    yMin: 0,
    series: [{
      x: cooks.map((/** @type {number} */ _, /** @type {number} */ i) => i + 1), y: [...cooks], name: t('cooksDistance'),
      color: 'var(--color-chart-2)', markerSize: 4, strokeWidth: 0.75, symbol: 'circle',
    }],
    moduleRefLines: [{ dir: 'h', value: threshold, dash: 'dash', color: 'var(--color-warning)', width: 1.5, label: `4/n = ${fmt(threshold, lang)}` }],
  };
}

/**
 * ROC-Kurve mit Zufallsklassifikator; Titel mit AUC.
 * @param {any} r @param {T} t @param {string} lang @returns {object}
 */
export function rocConfig(r, t, lang) {
  const roc = r._roc;
  if (!roc) return { series: [] };
  return {
    title: `${t('rocCurve')} (${t('common.sym.auc')} = ${fmt(roc.auc, lang)})`,
    xLabel: t('falsePositiveRate'),
    yLabel: t('truePositiveRate'),
    xMin: 0, xMax: 1, yMin: 0, yMax: 1,
    series: [
      lineSeries('ROC', [...roc.fpr], [...roc.tpr], { dash: 'solid', width: 2, color: 'var(--color-chart-1)', foreground: true }),
      lineSeries(t('randomClassifier'), [0, 1], [0, 1], { dash: 'dash', width: 1.5, color: 'var(--color-text-secondary)' }),
    ],
  };
}
