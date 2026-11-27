/**
 * D.Mike — MSA Typ 4: Darstellung des Ergebnisses als reine Funktionen —
 * Zahlen im Format der App-Sprache, Ampelklassen, Kennzahlen je Norm,
 * Tabelle je Referenz, Deutungssatz, Fehlertext und die Konfiguration der
 * vier Diagramm-Widgets.
 */
import { formatNumber } from '../../../core/number-format.js';

/** @typedef {(key: string, params?: object) => string} Translate */
/** @typedef {import('../domain/analyze.js').Inputs} Inputs */

/** Präfix der Schlüssel der Engine; der Übersetzer des Moduls hängt ihn selbst an. */
const OWN_PREFIX = 'modules.msa-typ4.';

/** Ampelklasse je Farbe (die globalen Klassen aus css/components.css). */
const COLOR_CLASS = { green: 'dmike-kpi--good', yellow: 'dmike-kpi--warn', red: 'dmike-kpi--bad' };

/** Bezugslinie bei 0. */
const ZERO_LINE = { dir: 'h', value: 0, label: '0', dash: 'dash', width: 1, color: 'var(--color-text-secondary)' };

/**
 * Zahl mit fester Stellenzahl; Strich für fehlende und nicht endliche Werte.
 * @param {number|null|undefined} v @param {number} d Nachkommastellen @param {string} lang
 * @returns {string}
 */
export function fmt(v, d, lang) {
  return v != null && Number.isFinite(v) ? formatNumber(v, lang, { decimals: d }) : '–';
}

/**
 * p-Wert mit drei Stellen, unter 0,001 als „< 0,001“; Strich ohne Wert.
 * @param {number|null|undefined} p @param {string} lang
 * @returns {string}
 */
export function fmtP(p, lang) {
  if (p == null || !Number.isFinite(p)) return '–';
  if (p < 0.001) return `< ${fmt(0.001, 3, lang)}`;
  return fmt(p, 3, lang);
}

/**
 * Das Ergebnis, oder null bei fehlenden oder abgelehnten Eingaben.
 * @param {any} derived Wert der Ableitung `result`
 * @returns {any}
 */
export function resultOf(derived) {
  return derived && !derived.invalid && !derived.error ? derived : null;
}

/**
 * Der Fehlertext einer abgelehnten Rechnung samt Werten, sonst leer; Zahlwerte
 * im Format der App-Sprache.
 * @param {any} derived Wert der Ableitung `result`
 * @param {Translate} t
 * @param {string} lang
 * @returns {string}
 */
export function errorText(derived, t, lang) {
  const inv = derived?.invalid;
  if (!inv) return '';
  const vars = inv.vars
    ? Object.fromEntries(Object.entries(inv.vars).map(([k, v]) => [k, typeof v === 'number' ? formatNumber(v, lang) : v]))
    : undefined;
  return t(String(inv.key).replace(OWN_PREFIX, ''), vars);
}

/**
 * Ampelklasse einer Farbe; leer bei unbekannter Farbe.
 * @param {string|null|undefined} color @returns {string}
 */
export function colorClass(color) {
  return COLOR_CLASS[/** @type {keyof typeof COLOR_CLASS} */ (color)] ?? '';
}

/**
 * Das Urteil der gewählten Norm.
 * @param {any} result @param {'AIAG'|'VDA5'} norm
 * @returns {{ color: string, key: string }}
 */
function verdictOf(result, norm) {
  return norm === 'VDA5' ? result.kpi.vda5.verdict : result.kpi.aiag.verdict;
}

/**
 * Ampelklasse des Urteils der gewählten Norm; grün ohne Ergebnis.
 * @param {any} result @param {'AIAG'|'VDA5'} norm @returns {string}
 */
export function verdictClass(result, norm) {
  return colorClass(result ? verdictOf(result, norm).color : 'green');
}

/**
 * Urteilstext der gewählten Norm.
 * @param {any} result @param {'AIAG'|'VDA5'} norm @param {Translate} t @returns {string}
 */
export function verdictText(result, norm, t) {
  return t(String(verdictOf(result, norm).key).replace(OWN_PREFIX, ''));
}

/**
 * Die Kacheln nach AIAG: %Linearität (Ampel des Urteils), Steigung und
 * Achsenabschnitt (rot, wenn signifikant) samt p-Wert.
 * @param {any} r @param {Translate} t @param {string} lang
 */
export function kpiAiag(r, t, lang) {
  const k = r.kpi.aiag;
  const sig = (/** @type {boolean} */ s) => (s ? 'dmike-kpi--bad' : 'dmike-kpi--good');
  return {
    linClass: colorClass(k.verdict.color),
    lin: `${fmt(k.percentLinearity, 2, lang)} %`,
    verdict: verdictText(r, 'AIAG', t),
    slopeClass: sig(k.slopeSignificant),
    slope: fmt(r.regression.slope, 4, lang),
    slopeP: `p = ${fmtP(r.regression.pSlope, lang)}`,
    interceptClass: sig(k.interceptSignificant),
    intercept: fmt(r.regression.intercept, 4, lang),
    interceptP: `p = ${fmtP(r.regression.pIntercept, lang)}`,
  };
}

/**
 * Die Kacheln nach VDA 5: u_BI, U und Q_MS,BI, alle in der Ampel des Urteils.
 * @param {any} r @param {Translate} t @param {string} lang
 */
export function kpiVda(r, t, lang) {
  const k = r.kpi.vda5;
  return {
    cls: colorClass(k.verdict.color),
    uBi: fmt(k.u_BI, 4, lang),
    u: fmt(k.U, 4, lang),
    qMsBi: `${fmt(k.Q_MS_BI, 2, lang)} %`,
    verdict: verdictText(r, 'VDA5', t),
  };
}

/**
 * Größter %Bias (aus dem AIAG-Block, auch bei VDA 5).
 * @param {any} r @param {string} lang @returns {string}
 */
export function maxBiasText(r, lang) {
  return `${fmt(r.kpi.aiag.maxPercentBias, 2, lang)} %`;
}

/**
 * Der Deutungssatz; die Kennzahlen im Zahlformat der Sprache, nicht endliche
 * als Strich. Der p-Wert der Steigung steht im Satz „unauffällig“.
 * @param {any} r @param {Translate} t @param {string} lang @returns {string}
 */
export function interpretationText(r, t, lang) {
  const key = String(r.interpretation.textKey).replace(OWN_PREFIX, '');
  return t(key, {
    pctLin: fmt(r.kpi.aiag.percentLinearity, 2, lang),
    maxPctBias: fmt(r.kpi.aiag.maxPercentBias, 2, lang),
    qMsBi: fmt(r.kpi.vda5.Q_MS_BI, 2, lang),
    pSlope: fmtP(r.regression.pSlope, lang),
  });
}

/**
 * Zeilen der Tabelle je Referenz.
 * @param {any} r @param {string} lang
 * @returns {{ key: string, rowClass: string, xRef: string, n: number, mean: string, bias: string, percentBias: string, tStat: string, pValue: string }[]}
 */
export function tableRows(r, lang) {
  return r.perReference.map((/** @type {any} */ p) => ({
    key: String(p.xRef),
    rowClass: `msa-typ4__row--${p.verdict}`,
    xRef: fmt(p.xRef, 3, lang),
    n: p.n,
    mean: fmt(p.mean, 4, lang),
    bias: fmt(p.bias, 4, lang),
    percentBias: `${fmt(p.percentBias, 2, lang)} %`,
    tStat: fmt(p.tStat, 2, lang),
    pValue: fmtP(p.pValue, lang),
  }));
}

/**
 * Linearitätsplot: Einzel-Bias je Messung, Regressionsgerade mit
 * Konfidenzband (Fehlerbalken der Fit-Reihe als Band), Bezugslinie bei 0.
 * @param {Inputs|null} inputs
 * @param {{ x: number[], y: number[], yPlus: number[], yMinus: number[] }|null} band
 * @param {Translate} t
 * @returns {object|null}
 */
export function linearityChart(inputs, band, t) {
  if (!inputs || !band) return null;
  const { reference: ref, measured: meas } = inputs;
  return {
    showLegend: true,
    xLabel: t('labels.referenceColumn'),
    yLabel: t('table.bias'),
    series: [
      {
        name: t('table.bias'),
        color: 'var(--color-accent)',
        x: [...ref], y: ref.map((x, i) => meas[i] - x),
        symbol: 'circle', strokeWidth: 1.5,
      },
      {
        name: t('charts.fitSeries'),
        color: 'var(--color-info)',
        x: [...band.x], y: [...band.y],
        markerSize: 0,
        connectLine: { show: true, width: 1.5, dash: 'solid', color: 'var(--color-info)' },
        errorBars: {
          show: true, bandShow: true, yMode: 'absolute',
          yPlus: [...band.yPlus], yMinus: [...band.yMinus],
          bandColor: 'var(--color-accent-light)',
        },
      },
    ],
    moduleRefLines: [ZERO_LINE],
  };
}

/**
 * %Bias je Referenz mit Vorzeichen des Bias, Linien bei 0 und ±5 %.
 * @param {any} r @param {Translate} t
 * @returns {object|null}
 */
export function pctBiasChart(r, t) {
  if (!r || !r.perReference.length) return null;
  return {
    showLegend: true,
    xLabel: t('labels.referenceColumn'),
    yLabel: t('table.percentBias'),
    series: [{
      name: t('table.percentBias'),
      color: 'var(--color-warning)',
      x: r.perReference.map((/** @type {any} */ p) => p.xRef),
      y: r.perReference.map((/** @type {any} */ p) => (Number.isFinite(p.percentBias) ? p.percentBias * Math.sign(p.bias) : 0)),
      symbol: 'circle', strokeWidth: 1.5,
    }],
    moduleRefLines: [
      ZERO_LINE,
      { dir: 'h', value: 5, label: '+5 %', dash: 'dot', width: 1.2, color: 'var(--color-success)' },
      { dir: 'h', value: -5, label: '−5 %', dash: 'dot', width: 1.2, color: 'var(--color-success)' },
    ],
  };
}

/**
 * Messwerte je Referenz und die Mittelwerte als Rauten.
 * @param {any} r @param {Inputs|null} inputs @param {Translate} t
 * @returns {object|null}
 */
export function perRefChart(r, inputs, t) {
  if (!r || !inputs) return null;
  return {
    showLegend: true,
    xLabel: t('labels.referenceColumn'),
    yLabel: t('labels.measuredColumn'),
    series: [
      {
        name: t('labels.measuredColumn'),
        color: 'var(--color-accent)',
        x: [...inputs.reference], y: [...inputs.measured],
        symbol: 'circle', strokeWidth: 1.5,
      },
      {
        name: t('table.mean'),
        color: 'var(--color-text-primary)',
        x: r.perReference.map((/** @type {any} */ p) => p.xRef),
        y: r.perReference.map((/** @type {any} */ p) => p.mean),
        symbol: 'diamond', strokeWidth: 1.5, markerSize: 10,
      },
    ],
  };
}

/**
 * Residuen (Bias minus ŷ) über ŷ, Bezugslinie bei 0.
 * @param {any} r @param {Inputs|null} inputs @param {Translate} t
 * @returns {object|null}
 */
export function residualChart(r, inputs, t) {
  if (!r || !inputs) return null;
  const { slope, intercept } = r.regression;
  const yhat = inputs.reference.map((x) => slope * x + intercept);
  return {
    showLegend: true,
    xLabel: 'ŷ',
    yLabel: t('charts.residuals'),
    series: [{
      name: t('charts.residuals'),
      color: 'var(--color-accent)',
      x: yhat,
      y: inputs.reference.map((x, i) => (inputs.measured[i] - x) - yhat[i]),
      symbol: 'circle', strokeWidth: 1.5,
    }],
    moduleRefLines: [ZERO_LINE],
  };
}
