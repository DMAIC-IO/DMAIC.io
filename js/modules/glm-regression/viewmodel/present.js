/**
 * D.Mike — GLM-Regression: Anzeige.
 *
 * Reine Funktionen für Zusammenfassung, Kennzahlen, Güte, Koeffizienten-,
 * VIF- und Überdispersionstabelle, Konfusionstafel und Prognose in der
 * App-Sprache (Altform `buildResultView`, `classView`, `_showPrediction`).
 * Die Zahlen kommen aus dem vollen Ergebnis der Rechnung (`analyze.js`);
 * hier wird nur formatiert und mit Klassen versehen. Kein DOM.
 */
import { formatNumber, decimalSeparator } from '../../../core/number-format.js';
import { overdispersionOf } from '../domain/analyze.js';

/** @typedef {(key: string, params?: object) => string} T */

/** Strich für fehlende Werte (Altform). */
export const EN_DASH = '–';

/**
 * Eine Zahl mit `d` Nachkommastellen; Beträge ab 10⁶ oder unter 10⁻⁴ (außer 0)
 * in Exponentialschreibweise (Altform `fmt`); Dezimalzeichen der Sprache.
 * @param {number|null|undefined} v @param {string} lang @param {number} [d]
 * @returns {string}
 */
export function fmt(v, lang, d = 4) {
  if (v == null || !Number.isFinite(v)) return EN_DASH;
  const abs = Math.abs(v);
  if (abs !== 0 && (abs >= 1e6 || abs < 1e-4)) return v.toExponential(d).replace('.', decimalSeparator(lang));
  return formatNumber(v, lang, { decimals: d });
}

/**
 * Ein p-Wert mit vier Stellen, unter 0,0001 als „< 0,0001“.
 * @param {number} p @param {string} lang @returns {string}
 */
export function fmtP(p, lang) {
  if (!Number.isFinite(p)) return EN_DASH;
  return p < 0.0001 ? `< ${formatNumber(0.0001, lang, { decimals: 4 })}` : formatNumber(p, lang, { decimals: 4 });
}

/**
 * Klasse der Signifikanz (Altform `sigClass`).
 * @param {number} p @returns {string}
 */
export function sigClass(p) {
  if (p < 0.001) return 'glm__sig--high';
  if (p < 0.01) return 'glm__sig--med';
  if (p < 0.05) return 'glm__sig--low';
  return 'glm__sig--none';
}

/**
 * Sterne der Signifikanz (Altform `sigStars`).
 * @param {number} p @returns {string}
 */
export function sigStars(p) {
  if (p < 0.001) return '***';
  if (p < 0.01) return '**';
  if (p < 0.05) return '*';
  return '';
}

/**
 * Die Zeilen der Modellzusammenfassung als Werte.
 * @param {any} r @param {T} t @param {string} lang
 * @returns {{ family: string, link: string, n: string, iterations: string, theta: string|null }}
 */
export function summaryOf(r, t, lang) {
  return {
    family: t(`family_${r.family.name}`),
    link: r.family.link,
    n: formatNumber(r.n, lang),
    iterations: formatNumber(r.iterations, lang),
    theta: r.family.theta != null ? fmt(r.family.theta, lang, 3) : null,
  };
}

/**
 * Klasse einer Kennzahl nach zwei Schwellen.
 * @param {number} v @param {number} good @param {number} warn @returns {string}
 */
const band = (v, good, warn) => (v >= good ? 'dmike-kpi--good' : v >= warn ? 'dmike-kpi--warn' : 'dmike-kpi--bad');

/**
 * Die Kennzahlen (Altform `kpis`), je Schlüssel Wert und Klasse; `auc` nur binomial.
 * @param {any} r @param {string} lang
 * @returns {Record<string, { value: string, mod: string }|null>}
 */
export function kpisOf(r, lang) {
  const mcf = r.pseudoR2.mcfadden;
  const nag = r.pseudoR2.nagelkerke;
  return {
    mcfadden: { value: fmt(mcf, lang), mod: band(mcf, 0.4, 0.2) },
    nagelkerke: { value: fmt(nag, lang), mod: band(nag, 0.8, 0.5) },
    aic: { value: fmt(r.aic, lang, 2), mod: '' },
    bic: { value: fmt(r.bic, lang, 2), mod: '' },
    auc: r.family.name === 'binomial' && r._roc ? { value: fmt(r._roc.auc, lang), mod: band(r._roc.auc, 0.8, 0.6) } : null,
  };
}

/**
 * Die Modellgüte (Altform `qualityItems`) als Werte; HL und χ²/df nur, wo es sie gibt.
 * @param {any} r @param {string} lang
 * @returns {{ deviance: string, nullDeviance: string, logLikelihood: string, coxSnell: string,
 *   hosmerLemeshow: string|null, overdispersionRatio: string|null }}
 */
export function qualityOf(r, lang) {
  const od = overdispersionOf(r._overdispersion);
  return {
    deviance: fmt(r.deviance, lang),
    nullDeviance: fmt(r.nullDeviance, lang),
    logLikelihood: fmt(r.logLikelihood, lang),
    coxSnell: fmt(r.pseudoR2.coxSnell, lang),
    hosmerLemeshow: r.family.name === 'binomial' && r._hl
      ? `χ² = ${fmt(r._hl.statistic, lang, 3)}, p = ${fmtP(r._hl.pValue, lang)}` : null,
    overdispersionRatio: od ? fmt(od.ratio, lang, 3) : null,
  };
}

/**
 * Die Koeffiziententabelle (Altform `coefRows`); Verhältnis nur binomial bzw. bei Zähldaten.
 * @param {any} r @param {T} t @param {string} lang
 * @returns {{ ratioHeader: string, rows: Array<{ term: string, coef: string, se: string, z: string, p: string,
 *   pClass: string, ratio: string, stars: string }> }}
 */
export function coefView(r, t, lang) {
  const isBinomial = r.family.name === 'binomial';
  const isCount = r.family.name === 'poisson' || r.family.name === 'negbin';
  const ratioHeader = isBinomial ? t('oddsRatioShort') : (isCount ? t('rateRatioShort') : '');
  const rows = r.terms.map((/** @type {string} */ term, /** @type {number} */ j) => {
    let ratio = '';
    const o = isBinomial ? r.oddsRatios?.[j] : (isCount ? r.rateRatios?.[j] : null);
    if (o) ratio = j === 0 ? EN_DASH : `${fmt(isBinomial ? o.or : o.rr, lang)} [${fmt(o.lower, lang)}; ${fmt(o.upper, lang)}]`;
    return {
      term,
      coef: `${fmt(r.coefficients[j], lang)} [${fmt(r.ciLower[j], lang)}; ${fmt(r.ciUpper[j], lang)}]`,
      se: fmt(r.stdErrors[j], lang),
      z: fmt(r.zValues[j], lang),
      p: fmtP(r.pValues[j], lang),
      pClass: sigClass(r.pValues[j]),
      ratio,
      stars: sigStars(r.pValues[j]),
    };
  });
  return { ratioHeader, rows };
}

/**
 * Die VIF-Tabelle (Altform `vifRows`); leer ohne VIF.
 * @param {any} r @param {string} lang
 * @returns {Array<{ term: string, vif: string, warnIcon: boolean, warnText: string, warnClass: string }>}
 */
export function vifRows(r, lang) {
  if (!Array.isArray(r._vifs) || r._vifs.length === 0) return [];
  return r._vifs.map((/** @type {number} */ vif, /** @type {number} */ j) => ({
    term: r.terms[j + 1],
    vif: fmt(vif, lang, 2),
    warnIcon: vif > 10,
    warnText: vif > 10 ? '' : vif > 5 ? '!' : '',
    warnClass: vif > 10 ? 'glm__sig--high' : vif > 5 ? 'glm__sig--low' : '',
  }));
}

/**
 * Die Überdispersionsprüfung (Altform `overdispersion`); `null` ohne Poisson-Prüfung.
 * @param {any} r @param {string} lang
 * @returns {{ pearsonChi2: string, df: string, ratio: string, overdispersed: boolean }|null}
 */
export function overdispersionView(r, lang) {
  const od = overdispersionOf(r._overdispersion);
  if (!od) return null;
  return {
    pearsonChi2: fmt(od.pearsonChi2, lang, 3),
    df: od.df == null ? EN_DASH : formatNumber(od.df, lang),
    ratio: fmt(od.ratio, lang, 3),
    overdispersed: od.overdispersed,
  };
}

/**
 * Die Konfusionstafel als Texte (Altform `classView`); leer ohne Tafel.
 * @param {import('../domain/model.js').Classification|null} c @param {string} lang
 * @returns {{ tp: string, fn: string, fp: string, tn: string, sensitivity: string, specificity: string, accuracy: string, precision: string }}
 */
export function classView(c, lang) {
  if (!c) return { tp: '', fn: '', fp: '', tn: '', sensitivity: '', specificity: '', accuracy: '', precision: '' };
  const count = (/** @type {number} */ v) => formatNumber(v, lang);
  return {
    tp: count(c.tp), fn: count(c.fn), fp: count(c.fp), tn: count(c.tn),
    sensitivity: fmt(c.sensitivity, lang), specificity: fmt(c.specificity, lang),
    accuracy: fmt(c.accuracy, lang), precision: fmt(c.precision, lang),
  };
}

/**
 * Die Prognose als Texte (Altform `predictResult`).
 * @param {{ linear: number, response: number, ciLower: number|null, ciUpper: number|null }} pred
 * @param {any} r @param {T} t @param {string} lang
 * @returns {{ linear: string, respLabel: string, response: string, ciLabel: string, ci: string, ciHint: string }}
 */
export function predictView(pred, r, t, lang) {
  const level = formatNumber(r.confLevel * 100, lang, { decimals: 0 });
  const hasCi = pred.ciLower !== null && pred.ciUpper !== null;
  return {
    linear: fmt(pred.linear, lang, 6),
    respLabel: r.family.name === 'binomial' ? t('probability') : t('expectedCount'),
    response: fmt(pred.response, lang, 6),
    ciLabel: t('predictCi', { level }),
    ci: hasCi ? `[${fmt(pred.ciLower, lang, 6)}; ${fmt(pred.ciUpper, lang, 6)}]` : EN_DASH,
    ciHint: hasCi ? '' : t('predictCiUnavailable'),
  };
}
