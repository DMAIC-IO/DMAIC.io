/**
 * D.Mike — Attributive Regelkarte: Anzeige.
 *
 * Reine Funktionen von der Rechnung (domain/analyze.js) zu Texten, Klassen
 * und der Diagramm-Konfiguration. `t` übersetzt im Modul, `gt` global.
 */
import { uniqueViolations, signalIndices, baselineEndOf } from '../domain/analyze.js';

/**
 * Mittel einer Grenze (Liste bei je Punkt wechselnden Grenzen), ein Einzelwert
 * bleibt unverändert. Nicht-endliche Werte werden nicht herausgefiltert: sie
 * machen das Mittel nicht-endlich, wie bisher (`toFixed` zeigt dann `NaN`).
 * @param {number|number[]} v
 * @returns {number}
 */
export function meanOf(v) {
  return Array.isArray(v) ? v.reduce((s, x) => s + x, 0) / Math.max(1, v.length) : v;
}

/**
 * Kennzahlenleiste: Mittellinie, gemittelte Grenzen, verletzende Punkte, verwertete Punkte.
 * @param {any} analysis Ergebnis von analyzeState, oder null
 * @returns {{ cl: string, uclMean: string, lclMean: string, limitsLabel: string, variableLimits: boolean,
 *   violationCount: number, valid: number }|null}
 */
export function kpisOf(analysis) {
  if (!analysis?.result) return null;
  const r = analysis.result;
  return {
    cl: Number.isFinite(r.cl) ? r.cl.toFixed(4) : '–',
    uclMean: meanOf(r.ucl).toFixed(3),
    lclMean: meanOf(r.lcl).toFixed(3),
    limitsLabel: r.variableLimits ? 'UCL̄ / LCL̄' : 'UCL / LCL',
    variableLimits: Boolean(r.variableLimits),
    violationCount: signalIndices(analysis.violations).length,
    valid: analysis.valid,
  };
}

/**
 * Stabilitätsmarke; gezählt werden alle Regelverletzungen (nicht entdoppelt).
 * @param {any} analysis
 * @param {(key: string, params?: object) => string} t
 * @returns {{ stable: boolean, text: string, icon: string, cls: string }|null}
 */
export function badgeOf(analysis, t) {
  if (!analysis?.result) return null;
  const count = analysis.violations.length;
  const stable = count === 0;
  return {
    stable,
    text: stable ? t('stable') : t('unstable', { count }),
    icon: stable ? 'status.ok' : 'status.warning',
    cls: stable ? 'attr-cc__badge--stable' : 'attr-cc__badge--unstable',
  };
}

/**
 * Zeilen der Verletzungsliste.
 * @param {any} analysis
 * @param {(key: string, params?: object) => string} gt globales i18n.t
 * @returns {{ key: string, idx: string, rule: string, desc: string }[]}
 */
export function violationRowsOf(analysis, gt) {
  return uniqueViolations(analysis?.violations ?? []).map((v) => ({
    key: `${v.index}-${v.ruleId}`,
    idx: gt('common.pointLabel', { n: v.index + 1 }),
    rule: gt('common.ruleLabel', { n: v.ruleId }),
    desc: gt(`common.nelsonAttr.${v.ruleId}.short`),
  }));
}

/**
 * Die Regelkarte für x-chart. `editKey` bleibt `control-chart`, damit
 * gespeicherte Bearbeitungen der Instanz gelten.
 * @param {any} analysis
 * @param {{ chartTypeId: string, baselineCount: number|null }} model
 * @param {(key: string, params?: object) => string} t
 * @returns {{ type: 'control-chart', config: object }|null}
 */
export function controlChartOf(analysis, model, t) {
  if (!analysis?.result) return null;
  const r = analysis.result;
  return {
    type: 'control-chart',
    config: {
      editKey: 'control-chart',
      title: '',
      xLabel: t('xLabelSample'),
      yLabel: t(`yLabel_${model.chartTypeId}`),
      showLegend: false,
      showTitle: false,
      values: r.values, cl: r.cl, ucl: r.ucl, lcl: r.lcl, sigma: r.sigma,
      violationIndices: new Set(signalIndices(analysis.violations)),
      baselineEnd: baselineEndOf(model.baselineCount, r.values.length),
      usl: null, lsl: null,
      showZones: !r.variableLimits,
    },
  };
}
