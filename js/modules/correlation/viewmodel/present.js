/**
 * D.Mike — Korrelation: Darstellung (viewmodel/present.js). Rein.
 *
 * Karten, Kennzahlgruppen, Tooltip-Zeilen der Empfehlung, Matrixzellen,
 * gefilterte Paare und die Konfiguration der Streudiagramme aus den
 * Ableitungen (`domain/analyze.js`) in der App-Sprache. Übersetzer und
 * Sprache kommen herein. Stellen wie die Altform: Koeffizienten 4, Lage und
 * Streuung 3, Jarque-Bera 2, Prozent 1.
 */
import { formatNumber } from '../../../core/number-format.js';
import { cellPassesFilter } from '../domain/filter.js';

/** @typedef {import('../domain/analyze.js').PairResult} PairResult */
/** @typedef {import('../domain/analyze.js').MatrixResult} MatrixResult */
/** @typedef {import('../domain/analyze.js').MatrixPair} MatrixPair */
/** @typedef {(key: string, params?: Record<string, unknown>) => string} T */

const RHO = 'ρ';
const TAU = 'τ';
const DASH = '–';
const ARROWS = '↔';
/** Präfix der Typ-Hilfen (Anker an Karten und Kennzahlen). */
const HELP = 'modules.correlation.types.';

/**
 * Zahl mit festen Stellen; Lücke als Gedankenstrich, Unendlich als Zeichen.
 * @param {number|null|undefined} v @param {string} lang @param {number} [d]
 * @returns {string}
 */
export function fmt(v, lang, d = 4) {
  if (v == null || Number.isNaN(v)) return DASH;
  if (v === Infinity) return '∞';
  if (v === -Infinity) return '−∞';
  return formatNumber(v, lang, { decimals: d });
}

/**
 * p-Wert mit 4 Stellen, kleine als „< 0,0001“.
 * @param {number|null|undefined} p @param {string} lang
 * @returns {string}
 */
export function fmtP(p, lang) {
  if (p == null || !Number.isFinite(p)) return DASH;
  return p < 0.0001 ? `< ${formatNumber(0.0001, lang, { decimals: 4 })}` : formatNumber(p, lang, { decimals: 4 });
}

/**
 * Intervall `[a; b]`; leer ohne Intervall.
 * @param {ReadonlyArray<number|null>|null|undefined} ci @param {string} lang @param {number} d
 * @returns {string}
 */
export function interval(ci, lang, d) {
  return ci ? `[${fmt(ci[0], lang, d)}; ${fmt(ci[1], lang, d)}]` : '';
}

/**
 * Das Konfidenzniveau als Prozentzahl mit bis zu zwei Stellen („97,5“).
 * @param {number} conf @param {string} lang
 * @returns {string}
 */
export function confPercent(conf, lang) {
  return formatNumber(Math.round(conf * 10000) / 100, lang);
}

/**
 * Anzeigenamen der Koeffizienten.
 * @param {T} t @returns {Record<'pearson'|'spearman'|'kendall', string>}
 */
export function methodNames(t) {
  return { pearson: t('pearsonR'), spearman: `Spearman ${RHO}`, kendall: `Kendall ${TAU}` };
}

/**
 * Farbe eines Koeffizienten (stark positiv/negativ, mittel, schwach).
 * @param {number|null} r @returns {string}
 */
export function corrColor(r) {
  if (r == null || Number.isNaN(r)) return 'var(--color-text-tertiary)';
  const a = Math.abs(r);
  if (a >= 0.7) return r > 0 ? 'var(--color-success)' : 'var(--color-error)';
  if (a >= 0.4) return 'var(--color-warning)';
  return 'var(--color-text-tertiary)';
}

/**
 * Deutung eines Koeffizienten.
 * @param {number} r @param {T} t @returns {string}
 */
function interpret(r, t) {
  const a = Math.abs(r);
  const dir = r >= 0 ? 'pos' : 'neg';
  if (a >= 0.9) return t(`interpVeryStrong_${dir}`);
  if (a >= 0.7) return t(`interpStrong_${dir}`);
  if (a >= 0.5) return t(`interpModerate_${dir}`);
  if (a >= 0.3) return t(`interpWeak_${dir}`);
  return t('interpVeryWeak');
}

/**
 * Platzhalter eines Grunds in der App-Sprache: `delta` mit 3 Stellen,
 * `pct` ganzzahlig (die Engine liefert sie als Text), Zahlen ohne Stellen.
 * @param {Record<string, unknown>|undefined} params @param {string} lang
 * @returns {Record<string, string>}
 */
function reasonParams(params, lang) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [k, v] of Object.entries(params ?? {})) {
    const n = Number(v);
    if (k === 'delta') out[k] = formatNumber(n, lang, { decimals: 3 });
    else if (k === 'pct') out[k] = formatNumber(n, lang, { decimals: 0 });
    else out[k] = Number.isFinite(n) ? formatNumber(n, lang) : String(v);
  }
  return out;
}

/** Position auf der Skala −1…1 in Prozent. @param {number} v @returns {number} */
const toPos = (v) => ((v + 1) / 2) * 100;

/**
 * @typedef {object} Card
 * @property {string} method
 * @property {string} label
 * @property {string} help
 * @property {string} color
 * @property {string} recClass
 * @property {string} headerStyle
 * @property {string} tagStyle
 * @property {string} rText
 * @property {string} interp
 * @property {Array<{ label: string, help: string, value: string }>} stats
 * @property {string} ciFillStyle
 * @property {string} ciPointStyle
 * @property {string} ciLow
 * @property {string} ciHigh
 */

/**
 * @typedef {object} PairView
 * @property {Card[]} cards
 * @property {Array<{ iconName: string|null, text: string }>} tooltip
 * @property {Array<{ title: string, rows: Array<{ label: string, help: string, value: string, style: string }> }>} statGroups
 */

/**
 * Die paarweise Anzeige: drei Karten, Tooltip der Empfehlung, zwei
 * Kennzahlgruppen.
 * @param {PairResult} res @param {T} t @param {string} lang
 * @returns {PairView}
 */
export function pairView(res, t, lang) {
  const { pearson, spearman, kendall, recommendation, descriptive, diagnostics, n, df } = res;
  const names = methodNames(t);
  const tooltip = [{ iconName: null, text: `${t('recommendation')}: ${names[recommendation.best]}` }];
  for (const r of recommendation.reasons) {
    tooltip.push({ iconName: r.ok ? 'status.ok' : 'status.warning', text: t(r.key, reasonParams(/** @type {any} */ (r.params), lang)) });
  }
  /**
   * @param {'pearson'|'spearman'|'kendall'} method @param {string} help @param {number} rVal
   * @param {Card['stats']} stats @param {ReadonlyArray<number|null>} ci
   * @returns {Card}
   */
  const card = (method, help, rVal, stats, ci) => {
    const color = corrColor(rVal);
    const lo = Number(ci[0]);
    const hi = Number(ci[1]);
    return {
      method,
      label: names[method],
      help,
      color,
      recClass: recommendation.best === method ? 'result-card--recommended' : '',
      headerStyle: `color:${color}`,
      tagStyle: `background:color-mix(in srgb, ${color} 8%, transparent);color:${color}`,
      rText: fmt(rVal, lang),
      interp: interpret(rVal, t),
      stats,
      ciFillStyle: `background:${color};left:${toPos(lo)}%;width:${toPos(hi) - toPos(lo)}%`,
      ciPointStyle: `left:${toPos(rVal)}%`,
      ciLow: fmt(ci[0], lang),
      ciHigh: fmt(ci[1], lang),
    };
  };
  /** @param {number|null} r2 @returns {string} */
  const share = (r2) => `${fmt(r2, lang)} (${fmt(r2 == null ? null : r2 * 100, lang, 1)} %)`;
  const cards = [
    card('pearson', `${HELP}LinearStat.r`, /** @type {number} */ (pearson.r), [
      { label: t('pValue'), help: `${HELP}LinearStat.p`, value: fmtP(pearson.p, lang) },
      { label: t('tStat'), help: `${HELP}LinearStat.t`, value: fmt(pearson.t, lang) },
      { label: t('common.sym.r2'), help: `${HELP}LinearStat.r2`, value: share(pearson.r2) },
    ], pearson.ci),
    card('spearman', `${HELP}LinearStat.r`, /** @type {number} */ (spearman.r), [
      { label: t('pValue'), help: `${HELP}LinearStat.p`, value: fmtP(spearman.p, lang) },
      { label: t('tStat'), help: `${HELP}LinearStat.t`, value: fmt(spearman.t, lang) },
      { label: `${RHO}²`, help: `${HELP}LinearStat.r2`, value: share(spearman.r2) },
    ], spearman.ci),
    card('kendall', `${HELP}KendallStat.tau`, /** @type {number} */ (kendall.tau), [
      { label: t('pValue'), help: `${HELP}KendallStat.p`, value: fmtP(kendall.p, lang) },
      { label: t('zStat'), help: `${HELP}KendallStat.z`, value: fmt(kendall.z, lang) },
      { label: t('concordant'), help: `${HELP}KendallStat.concordant`, value: formatNumber(kendall.concordant, lang) },
      { label: t('discordant'), help: `${HELP}KendallStat.discordant`, value: formatNumber(kendall.discordant, lang) },
    ], kendall.ci),
  ];
  const ok = 'color:var(--color-success)';
  const warn = 'color:var(--color-warning)';
  const mono = /** @type {number} */ (diagnostics.mono);
  const monoStyle = mono >= 0.85 ? ok : mono >= 0.7 ? warn : 'color:var(--color-error)';
  /** @param {import('../domain/analyze.js').Normality} nm @returns {string} */
  const norm = (nm) => `${nm.label} (JB=${fmt(nm.jb, lang, 2)})`;
  const statGroups = [
    {
      title: t('descriptiveStats'),
      rows: [
        { label: t('common.sym.n'), help: `${HELP}PairResult.n`, value: formatNumber(n, lang), style: '' },
        { label: t('degreesOfFreedom'), help: `${HELP}PairResult.df`, value: formatNumber(df, lang), style: '' },
        { label: t('meanX'), help: `${HELP}Descriptive.meanX`, value: fmt(descriptive.meanX, lang, 3), style: '' },
        { label: t('meanY'), help: `${HELP}Descriptive.meanY`, value: fmt(descriptive.meanY, lang, 3), style: '' },
        { label: t('stdDevX'), help: `${HELP}Descriptive.stdX`, value: fmt(descriptive.stdX, lang, 3), style: '' },
        { label: t('stdDevY'), help: `${HELP}Descriptive.stdY`, value: fmt(descriptive.stdY, lang, 3), style: '' },
        { label: t('covariance'), help: `${HELP}Descriptive.cov`, value: fmt(descriptive.cov, lang, 3), style: '' },
      ],
    },
    {
      title: t('diagnostics'),
      rows: [
        { label: t('normalityX'), help: `${HELP}Diagnostics.normX`, value: norm(diagnostics.normX), style: diagnostics.normX.normal ? ok : warn },
        { label: t('normalityY'), help: `${HELP}Diagnostics.normY`, value: norm(diagnostics.normY), style: diagnostics.normY.normal ? ok : warn },
        { label: t('skewnessX'), help: `${HELP}Diagnostics.skewX`, value: fmt(diagnostics.skewX, lang, 3), style: '' },
        { label: t('skewnessY'), help: `${HELP}Diagnostics.skewY`, value: fmt(diagnostics.skewY, lang, 3), style: '' },
        { label: t('kurtosisX'), help: `${HELP}Diagnostics.kurtX`, value: fmt(diagnostics.kurtX, lang, 3), style: '' },
        { label: t('kurtosisY'), help: `${HELP}Diagnostics.kurtY`, value: fmt(diagnostics.kurtY, lang, 3), style: '' },
        { label: t('monotonicityIndex'), help: `${HELP}Diagnostics.mono`, value: `${fmt(mono * 100, lang, 1)} %`, style: monoStyle },
        {
          label: t('outliers'), help: `${HELP}Diagnostics.outliers`,
          value: diagnostics.outliers === 0 ? t('none') : formatNumber(diagnostics.outliers, lang),
          style: diagnostics.outliers === 0 ? ok : warn,
        },
      ],
    },
  ];
  return { cards, tooltip, statGroups };
}

/**
 * @typedef {object} MatrixCell
 * @property {'empty'|'diag'|'value'} kind
 * @property {string} cls
 * @property {string} style
 * @property {string} title
 * @property {string} val
 * @property {string} pStr
 * @property {string} ciStr
 */

/**
 * @typedef {object} PlotPair
 * @property {number} i
 * @property {number} j
 * @property {string} key  Schlüssel `<i>-<j>` (Editor-Einstellungen, Auswahl)
 * @property {string} legacyEditKey  alter `chartEdits`-Schlüssel `pair:<i>-<j>`
 * @property {string} titleText
 * @property {string} color
 * @property {string} rLabel
 * @property {string} pLabel
 * @property {string} ciLabel
 * @property {object} config  Konfiguration des Streudiagramms
 */

/**
 * @typedef {object} MatrixView
 * @property {string[]} names
 * @property {MatrixCell[][]} rows
 * @property {Record<string, PlotPair>} pairs  gefilterte Paare nach Schlüssel, in Matrixfolge
 */

/**
 * Die Matrixanzeige für einen Koeffizienten und die Filter.
 * @param {MatrixResult} mr @param {ReadonlyArray<MatrixPair>} rawPairs
 * @param {{ method: 'pearson'|'spearman'|'kendall', minR: number|null, maxP: number|null, conf: number }} opts
 * @param {T} t @param {string} lang
 * @returns {MatrixView}
 */
export function matrixView(mr, rawPairs, { method, minR, maxP }, t, lang) {
  const { names, nMatrix } = mr;
  const mat = mr.matrix[method];
  const ciMat = /** @type {any} */ (mr.ciMatrix)[method];
  const pMat = /** @type {any} */ (mr.pMatrix)[method];
  const k = names.length;
  /** @type {MatrixCell[][]} */
  const rows = [];
  const blank = { val: '', pStr: '', ciStr: '', title: '', style: '' };
  for (let i = 0; i < k; i++) {
    /** @type {MatrixCell[]} */
    const row = [];
    for (let j = 0; j < k; j++) {
      if (j > i) { row.push({ ...blank, kind: 'empty', cls: 'corr__matrix-cell corr__matrix-cell--empty' }); continue; }
      if (i === j) { row.push({ ...blank, kind: 'diag', cls: 'corr__matrix-cell corr__matrix-cell--diag' }); continue; }
      const r = mat[i][j];
      const p = pMat[i][j];
      const passes = cellPassesFilter(r, p, minR, maxP);
      const ci = ciMat[i][j];
      row.push({
        kind: 'value',
        cls: `corr__matrix-cell${passes ? '' : ' corr__matrix-cell--dimmed'}`,
        style: `background:${passes ? cellBackground(r) : 'transparent'};color:${corrColor(r)}`,
        title: `n = ${formatNumber(nMatrix[i][j], lang)}`,
        val: fmt(r, lang),
        pStr: p != null ? fmtP(p, lang) : '',
        ciStr: interval(ci, lang, 3),
      });
    }
    rows.push(row);
  }
  /** @type {Record<string, PlotPair>} */
  const pairs = {};
  for (const raw of rawPairs) {
    const r = mat[raw.i][raw.j];
    const p = pMat[raw.i][raw.j];
    if (raw.x.length < 4 || !cellPassesFilter(r, p, minR, maxP)) continue;
    const key = `${raw.i}-${raw.j}`;
    pairs[key] = {
      i: raw.i, j: raw.j, key, legacyEditKey: `pair:${key}`,
      titleText: `${names[raw.i]} ${ARROWS} ${names[raw.j]}`,
      color: corrColor(r),
      rLabel: fmt(r, lang, 3),
      pLabel: p != null ? fmtP(p, lang) : DASH,
      ciLabel: interval(ciMat[raw.i][raw.j], lang, 3),
      config: scatterConfig(raw.x, raw.y, { xLabel: names[raw.i], yLabel: names[raw.j], showLegend: false, dataName: t('dataPoints'), lineName: '' }),
    };
  }
  return { names, rows, pairs };
}

/**
 * Hintergrund einer Matrixzelle: Grün oder Rot, Deckung |r|·25 %.
 * @param {number|null} r @returns {string}
 */
function cellBackground(r) {
  if (r == null || Number.isNaN(r)) return 'transparent';
  const pct = Math.round(Math.abs(r) * 25 * 1000) / 1000;
  return `color-mix(in srgb, var(${r > 0 ? '--corr-cell-pos' : '--corr-cell-neg'}) ${pct}%, transparent)`;
}

/**
 * Regressionsgerade nach kleinsten Quadraten über die Spannweite von x.
 * @param {ReadonlyArray<number>} x @param {ReadonlyArray<number>} y
 * @returns {{ slope: number, intercept: number, xMin: number, xMax: number }}
 */
export function regression(x, y) {
  let sumX = 0, sumY = 0;
  for (let n = 0; n < x.length; n++) { sumX += x[n]; sumY += y[n]; }
  const mx = sumX / x.length, my = sumY / x.length;
  let num = 0, den = 0;
  for (let n = 0; n < x.length; n++) {
    num += (x[n] - mx) * (y[n] - my);
    den += (x[n] - mx) * (x[n] - mx);
  }
  const slope = den ? num / den : 0;
  return { slope, intercept: my - slope * mx, xMin: Math.min(...x), xMax: Math.max(...x) };
}

/**
 * Konfiguration eines Streudiagramms mit Regressionsgerade über den Punkten.
 * @param {ReadonlyArray<number>} x @param {ReadonlyArray<number>} y
 * @param {{ xLabel: string, yLabel: string, showLegend: boolean, dataName: string, lineName: string }} o
 * @returns {object}
 */
export function scatterConfig(x, y, o) {
  const { slope, intercept, xMin, xMax } = regression(x, y);
  return {
    xLabel: o.xLabel || 'X',
    yLabel: o.yLabel || 'Y',
    showLegend: o.showLegend,
    series: [
      { name: o.dataName, color: 'var(--color-chart-1)', markerSize: 4, strokeWidth: 0.75, x: [...x], y: [...y], symbol: 'circle' },
      {
        name: o.lineName, color: 'transparent', stroke: 'transparent', markerSize: 0,
        x: [xMin, xMax], y: [slope * xMin + intercept, slope * xMax + intercept],
        connectLine: { show: true, dash: 'solid', width: 2, color: 'var(--color-error)', foreground: true },
      },
    ],
  };
}
