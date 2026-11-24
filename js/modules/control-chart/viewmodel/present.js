/**
 * D.Mike — Regelkarte für Variablen (I-MR, X̄-R, X̄-S): Anzeige
 * (viewmodel/present.js).
 *
 * Macht aus dem Rohergebnis KPI-Leiste, Kopfzeilen mit Abzeichen, die
 * Konfiguration des Regelkarten-Widgets je Teilkarte und die Zeilen der
 * Verletzungsliste: übersetzte Texte, Zahlen in der Sprache der Oberfläche
 * und Darstellungsklassen. Rechnet nichts.
 */
import { formatNumber } from '../../../core/number-format.js';
import { excludedOf, uniqueViolations } from '../domain/analyze.js';

/** @typedef {import('../domain/analyze.js').Analysis} Analysis */
/** @typedef {Extract<Analysis, { status: 'ok' }>} Ok */
/** @typedef {import('../domain/analyze.js').Violation} Violation */
/** @typedef {import('../domain/analyze.js').LimitValue} LimitValue */
/** @typedef {(key: string, params?: Record<string, unknown>) => string} Translate */

/**
 * Zahl mit `decimals` Nachkommastellen, „–“ für leer oder nicht endlich.
 * @param {unknown} v @param {string} lang @param {number} decimals @returns {string}
 */
export function fmt(v, lang, decimals) {
  return typeof v === 'number' && Number.isFinite(v) ? formatNumber(v, lang, { decimals }) : '–';
}

/** @param {LimitValue} v @returns {number|null} der letzte Eintrag einer Grenzliste */
const lastOf = (v) => (Array.isArray(v) ? v[v.length - 1] : v);

/** @param {Ok} a @returns {string[]} die Teilkarten-Ids in Zeichenreihenfolge */
const idsOf = (a) => a.ct.subcharts.map((/** @type {{ id: string }} */ s) => s.id);

/**
 * Die KPI-Leiste: CL der ersten Teilkarte (bei mehreren Stufen die der
 * letzten, mit Zusatz) samt σ̂, UCL und LCL, die Zahl der verletzenden
 * Punkte und, mit Fähigkeit, Cpk samt Cp.
 * @param {Ok} a Ergebnis
 * @param {Translate} t
 * @param {string} lang
 * @returns {{ cl: string, stageHint: string, sigmaText: string, ucl: string, lcl: string, violations: number,
 *   ofText: string, violationsClass: string, cpk: string, cpText: string, cpkClass: string }}
 */
export function kpiOf(a, t, lang) {
  const p = a.fit.subcharts[idsOf(a)[0]];
  const count = new Set(a.primaryViolations.map((v) => v.index)).size;
  const total = p.values.filter((v) => v !== null).length;
  const stages = a.fit.segments?.length ?? 0;
  const cap = /** @type {{ cp?: number|null, cpk?: number|null }|null} */ (a.capability);
  const cpk = cap ? cap.cpk : null;
  /** @type {string} */
  let cpkClass = '';
  if (cap) cpkClass = `dmike-kpi--${(cpk ?? -Infinity) >= 1.33 ? 'good' : (cpk ?? -Infinity) >= 1.0 ? 'warn' : 'bad'}`;
  return {
    cl: fmt(lastOf(p.cl), lang, 4),
    stageHint: stages > 1 ? ` (${t('stageN', { n: stages })})` : '',
    sigmaText: t('statSigma', { v: fmt(lastOf(p.sigma), lang, 4) }),
    ucl: fmt(lastOf(p.ucl), lang, 3),
    lcl: fmt(lastOf(p.lcl), lang, 3),
    violations: count,
    ofText: t('statOf', { total }),
    violationsClass: count === 0 ? 'dmike-kpi--good' : 'dmike-kpi--bad',
    cpk: cap ? fmt(cpk, lang, 3) : '',
    cpText: cap?.cp ? t('statCp', { v: fmt(cap.cp, lang, 3) }) : '',
    cpkClass,
  };
}

/**
 * Das Abzeichen einer Kopfzeile: stabil ohne Verletzung, sonst ihre Zahl.
 * @param {number} count Verletzungen der Teilkarte (je Punkt und Regel) @param {Translate} t
 * @returns {{ text: string, cls: string, icon: string }}
 */
export function badgeOf(count, t) {
  return count === 0
    ? { text: t('stable'), cls: 'control-chart__badge--stable', icon: 'status.ok' }
    : { text: t('unstable', { count }), cls: 'control-chart__badge--unstable', icon: 'status.warning' };
}

/** @param {LimitValue} v @returns {number[]} eine Grenze als Liste (eine Zahl gilt für alle Punkte) */
const asList = (v) => /** @type {number[]} */ (Array.isArray(v) ? [...v] : [v]);

/**
 * Konfiguration des Regelkarten-Widgets für eine Teilkarte: Punkte, Grenzen
 * als Listen, die verletzenden Punkte (sortiert), die ausgeschlossenen Punkte
 * (bei X̄ je Untergruppe), das Ende der Phase I (nur ohne Stufen und vor dem
 * letzten Punkt), die Stufengrenzen (nur mit Stufen) und die
 * Spezifikationsgrenzen an der ersten Teilkarte. Farben sind Vorgaben des Typs.
 * @param {Ok} a
 * @param {number} k Position der Teilkarte (0 erste, 1 zweite)
 * @param {{ annotations: object, usl: number|null, lsl: number|null }} model
 * @param {Translate} t
 * @param {string} lang
 * @returns {object}
 */
export function chartConfig(a, k, model, t, lang) {
  const sc = a.ct.subcharts[k];
  const data = a.fit.subcharts[sc.id];
  const imr = a.ct.id === 'i-mr';
  const n = a.n;
  const usingStages = a.stages.length > 0;
  const violations = k === 0 ? a.primaryViolations : a.secondaryViolations;
  const excluded = excludedOf(model.annotations);
  const blEnd = imr ? a.baselineEnd : Math.ceil(a.baselineEnd / n);
  /** @type {Record<string, unknown>} */
  const config = {
    title: '',
    xLabel: t('xLabelSample'),
    yLabel: sc.yLabel[lang] || sc.yLabel.de || '',
    showLegend: false,
    showTitle: false,
    values: [...data.values],
    cl: asList(data.cl),
    ucl: asList(data.ucl),
    lcl: asList(data.lcl),
    sigma: asList(data.sigma),
    violationIndices: [...new Set(violations.map((v) => v.index))].sort((x, y) => x - y),
    excludedIndices: [...new Set(imr ? excluded : excluded.map((i) => Math.floor(i / n)))].sort((x, y) => x - y),
    baselineEnd: !usingStages && blEnd < data.values.length ? blEnd : null,
    usl: k === 0 ? model.usl ?? null : null,
    lsl: k === 0 ? model.lsl ?? null : null,
  };
  if (usingStages) config.stageBoundaries = imr ? [...a.stages] : a.stages.map((b) => Math.ceil(b / n));
  return config;
}

/**
 * Je Teilkarte Kopfzeile, Abzeichen, Konfiguration und Altschlüssel (die Id
 * der Teilkarte), als Objekt in Zeichenreihenfolge (`{ i, mr }`,
 * `{ xbar, r }` oder `{ xbar, s }`).
 * @param {Ok} a
 * @param {{ annotations: object, usl: number|null, lsl: number|null }} model
 * @param {string} col Name der Messwertspalte
 * @param {Translate} t
 * @param {string} lang
 * @returns {Record<string, { title: string, badge: ReturnType<typeof badgeOf>, config: object, legacyEditKey: string }>}
 */
export function chartViewsOf(a, model, col, t, lang) {
  return Object.fromEntries(idsOf(a).map((id, k) => [id, {
    title: t(`subchart_${id}`, { col }),
    badge: badgeOf((k === 0 ? a.primaryViolations : a.secondaryViolations).length, t),
    config: chartConfig(a, k, model, t, lang),
    legacyEditKey: id,
  }]));
}

/**
 * Eine Zeile der Verletzungsliste.
 * @typedef {object} ViolationRow
 * @property {number} index Punkt, ab 0
 * @property {number} ruleId Nelson-Regel
 * @property {string} idx Beschriftung des Punkts
 * @property {string} rule Beschriftung der Regel
 * @property {string} desc Kurztext der Regel
 * @property {boolean} hasAnn der Punkt hat eine Anmerkung
 * @property {string} annText Kommentar, „⊘“ bei Ausschluss
 * @property {boolean} annExcluded der Punkt ist ausgeschlossen
 */

/**
 * Die Verletzungsliste der ersten Teilkarte: je Paar aus Punkt und Regel eine
 * Zeile, nach Punkt sortiert, mit der Anmerkung des Punkts.
 * @param {Ok} a
 * @param {Record<string, { comment: string, excluded: boolean }>} annotations
 * @param {Translate} gt globaler Übersetzer (`common.*`)
 * @returns {ViolationRow[]}
 */
export function violationRowsOf(a, annotations, gt) {
  return uniqueViolations(a.primaryViolations).map((v) => {
    const ann = annotations[v.index];
    return {
      index: v.index,
      ruleId: v.ruleId,
      idx: gt('common.pointLabel', { n: v.index + 1 }),
      rule: gt('common.ruleLabel', { n: v.ruleId }),
      desc: gt(`common.nelson.${v.ruleId}.short`),
      hasAnn: Boolean(ann),
      annText: ann ? (ann.comment || '') + (ann.excluded ? ' ⊘' : '') : '',
      annExcluded: Boolean(ann?.excluded),
    };
  });
}
