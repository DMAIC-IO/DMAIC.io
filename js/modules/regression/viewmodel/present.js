/**
 * D.Mike — Regression: Anzeige.
 *
 * Reine Funktionen für Kennzahlen, ANOVA- und Koeffiziententabelle, den
 * Hinweis der Versuchsvorgabe und die Prognose in der App-Sprache. Die
 * Zahlen kommen aus dem vollen Ergebnis der Rechnung (`analyze.js`); hier
 * wird nur formatiert, sortiert und mit Klassen versehen. Kein DOM.
 */
import { formatNumber, decimalSeparator } from '../../../core/number-format.js';
import { anovaOf } from '../domain/analyze.js';

/** @typedef {(key: string, params?: object) => string} T */

/** Strich für fehlende Werte (Altform). */
export const EN_DASH = '–';
/** Das Zeichen der Vorhersage. */
export const Y_HAT = 'Ŷ';

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
  return p < 0.0001 ? `< ${formatNumber(0.0001, lang, { decimals: 4 })}` : formatNumber(p, lang, { decimals: 4 });
}

/**
 * Klasse einer R²-Kennzahl.
 * @param {number} v @returns {string}
 */
const r2Class = (v) => (v >= 0.8 ? 'dmike-kpi--good' : v >= 0.5 ? 'dmike-kpi--warn' : 'dmike-kpi--bad');

/**
 * Die Kennzahlen des gezeigten Modells, je Schlüssel Wert, Klasse und
 * Tooltip; `r2pred` ist `null` ohne vorhergesagtes R².
 * @param {any} r @param {number} alpha @param {T} t @param {string} lang
 * @returns {Record<string, { value: string, mod: string, tip: string }|null>}
 */
export function kpisOf(r, alpha, t, lang) {
  const r2 = r2Class(r.R2);
  const pClass = r.fPVal < alpha ? 'dmike-kpi--good' : r.fPVal < alpha * 2 ? 'dmike-kpi--warn' : 'dmike-kpi--bad';
  const r2p = r.R2pred ?? null;
  return {
    r2: { value: fmt(r.R2, lang), mod: r2, tip: t('tipR2') },
    adjR2: { value: fmt(r.adjR2, lang), mod: r2, tip: t('tipAdjR2') },
    r2pred: r2p != null ? { value: fmt(r2p, lang), mod: r2Class(r2p), tip: t('tipPredR2') } : null,
    se: { value: fmt(r.Se, lang), mod: '', tip: t('tipStdError') },
    f: { value: fmt(r.Fstat, lang, 2), mod: '', tip: t('tipFStat') },
    p: { value: fmtP(r.fPVal, lang), mod: pClass, tip: t('tipPValueF') },
    dw: { value: fmt(r.dw, lang, 3), mod: '', tip: t('tipDurbinWatson') },
  };
}

/**
 * Die Reiter zum Ergebnis; Haupteffekte und Wechselwirkungen nur bei
 * mehreren X.
 * @param {any} r @param {T} t @returns {Array<{ id: string, label: string }>}
 */
export function tabsOf(r, t) {
  const multi = Boolean(r.multiX && r.xCount > 1);
  const tabs = [
    { id: 'scatter', label: multi ? t('tabActualVsPredicted') : t('tabRegression') },
    { id: 'residuals', label: t('tabResiduals') },
    { id: 'order', label: t('tabOrder') },
    { id: 'qq', label: t('tabQQ') },
    { id: 'histogram', label: t('tabHistogram') },
    { id: 'ss-pie', label: t('tabSSPie') },
  ];
  if (multi) tabs.push({ id: 'main-effects', label: t('tabMainEffects') }, { id: 'interaction', label: t('tabInteraction') });
  return tabs;
}

/**
 * Klassen einer Zeile mit p-Wert.
 * @param {number|null|undefined} p @param {number} alpha
 * @returns {{ pSig: string, trClass: string }}
 */
function sigClasses(p, alpha) {
  if (p == null || !Number.isFinite(p)) return { pSig: '', trClass: '' };
  return p < alpha ? { pSig: 'reg__td--sig', trClass: 'reg__tr--sig' } : { pSig: 'reg__td--not-sig', trClass: 'reg__tr--not-sig' };
}

/**
 * Die ANOVA-Tabelle als Texte.
 * @param {any} r @param {number} alpha @param {string} lang
 */
export function anovaView(r, alpha, lang) {
  const a = anovaOf(r);
  if (!a) return null;
  const reg = sigClasses(a.regression.p, alpha);
  const prefix = r.blocks?.length > 0 ? 'b' : 'c';
  const int = (/** @type {number|null|undefined} */ v) => (v == null ? '' : formatNumber(v, lang));
  return {
    regRowClass: reg.trClass, pSig: reg.pSig,
    ssr: fmt(a.regression.ss, lang), dfReg: int(a.regression.df), msr: fmt(a.regression.ms, lang),
    fstat: fmt(a.regression.f, lang), fp: fmtP(a.regression.p, lang),
    sse: fmt(a.error.ss, lang), dfRes: int(a.error.df), mse: fmt(a.error.ms, lang),
    sst: fmt(a.total.ss, lang), dfTot: int(a.total.df),
    termRows: a.terms.map((row) => {
      const c = sigClasses(row.p, alpha);
      return {
        id: `${prefix}-${row.term}`, label: row.term,
        ss: fmt(row.ss, lang), df: int(row.df), ms: fmt(row.ms, lang), f: fmt(row.f, lang),
        p: Number.isFinite(row.p) ? fmtP(row.p, lang) : EN_DASH,
        pSig: c.pSig, trClass: `${c.trClass} reg__tr--term`.trim(),
      };
    }),
  };
}

/**
 * Eine Zeile der Koeffiziententabelle.
 * @typedef {object} CoefRow
 * @property {string} key
 * @property {string} label
 * @property {string} dataTerm  Term für `setTerm`
 * @property {boolean} checked
 * @property {boolean} cbDisabled
 * @property {string} trClass
 * @property {string} termClass
 * @property {boolean} blockHeader
 * @property {string} [blockDf]
 * @property {string} coef
 * @property {string} ci
 * @property {string} se
 * @property {string} t
 * @property {string} p
 * @property {string} pSig
 * @property {string} vif
 * @property {string} vifFull
 * @property {string} vifClass
 */

/**
 * Die Koeffiziententabelle wie die Altform (`coefView`): Blöcke bei
 * kategorialen Prädiktoren, ausgeschlossene Terme am Ende, wahlweise nach
 * p-Wert absteigend.
 * @param {any} r @param {number} alpha @param {boolean} sortByP @param {string} lang
 * @returns {{ rows: CoefRow[], canExclude: boolean, hasDetails: boolean, hasVIF: boolean }}
 */
export function coefView(r, alpha, sortByP, lang) {
  if (!r) return { rows: [], canExclude: false, hasDetails: false, hasVIF: false };
  const hasDetails = r.coefDetails[0]?.se != null;
  const hasVIF = Boolean(r.vif && r.vif.length > 0);
  const canExclude = Boolean(r.allTerms);
  const excluded = new Set(r.excludeTerms || []);
  const hasBlocks = Array.isArray(r.blockMap) && r.blockMap.length > 0;
  /** @type {Record<string, number|null>} */ const vifMap = {};
  /** @type {Record<string, number|null>} */ const vifFullMap = {};
  if (hasVIF && r.xNames) r.xNames.forEach((/** @type {string} */ n, /** @type {number} */ i) => { vifMap[n] = r.vif[i]; });
  if (r.vifFull && r.xNames) r.xNames.forEach((/** @type {string} */ n, /** @type {number} */ i) => { vifFullMap[n] = r.vifFull[i]; });

  /** @param {string} label @param {any} c @param {{ isIntercept?: boolean, blockTermId?: string|null, indented?: boolean, key: string }} o @returns {CoefRow} */
  const mkRow = (label, c, { isIntercept = false, blockTermId = null, indented = false, key }) => {
    const sig = hasDetails ? sigClasses(c?.pval, alpha) : { pSig: '', trClass: '' };
    const v = hasVIF ? (vifMap[label] ?? null) : null;
    const vf = hasVIF ? (vifFullMap[label] ?? null) : null;
    return {
      key, label, dataTerm: blockTermId ?? label,
      checked: true, cbDisabled: Boolean(isIntercept || indented),
      trClass: sig.trClass, termClass: indented ? 'reg__td--term-indent' : '', blockHeader: false,
      coef: fmt(c?.coeff, lang),
      ci: hasDetails && c?.ciLow != null && c?.ciHigh != null ? `[${fmt(c.ciLow, lang)}; ${fmt(c.ciHigh, lang)}]` : '',
      se: hasDetails ? fmt(c?.se, lang) : '', t: hasDetails ? fmt(c?.t, lang) : '',
      p: hasDetails ? (c?.pval != null ? fmtP(c.pval, lang) : EN_DASH) : '', pSig: sig.pSig,
      vif: hasVIF ? (v != null ? fmt(v, lang, 2) : EN_DASH) : '',
      vifFull: vf != null && v != null && Math.abs(vf - v) > 0.005 ? `(${fmt(vf, lang, 2)})` : '',
      vifClass: v != null && v > 10 ? 'reg__td--not-sig' : (v != null && v > 5 ? 'reg__td--vif-warn' : ''),
    };
  };
  /** @param {string} termId @returns {CoefRow} */
  const mkExcluded = (termId) => ({
    key: `ex-${termId}`, label: termId, dataTerm: termId, checked: false, cbDisabled: false,
    trClass: 'reg__tr--excluded', termClass: '', blockHeader: false,
    coef: '', ci: '', se: '', t: '', p: '', pSig: '', vif: '', vifFull: '', vifClass: '',
  });

  /** @type {CoefRow[]} */
  const rows = [];
  if (hasBlocks) {
    /** @type {Map<string, any[]>} */
    const byBlock = new Map([['Intercept', [r.coefDetails[0]]]]);
    for (const cd of r.coefDetails.slice(1)) {
      if (!byBlock.has(cd.blockId)) byBlock.set(cd.blockId, []);
      /** @type {any[]} */ (byBlock.get(cd.blockId)).push(cd);
    }
    const blockById = new Map(r.blockMap.map((/** @type {any} */ b) => [b.id, b]));
    const summaryById = new Map((r.blocks || []).map((/** @type {any} */ b) => [b.id, b]));
    /** @type {any[]} */ const groups = [];
    /** @type {string[]} */ const excludedIds = [];
    for (const termId of r.allTerms || []) {
      if (termId !== 'Intercept' && excluded.has(termId)) { excludedIds.push(termId); continue; }
      const coefs = byBlock.get(termId) || [];
      if (coefs.length === 0) continue;
      if (coefs.length === 1) groups.push({ kind: 'single', termId, coef: coefs[0], isIntercept: termId === 'Intercept' });
      else groups.push({ kind: 'block', termId, coefs, block: blockById.get(termId), summary: summaryById.get(termId) });
    }
    if (sortByP && hasDetails) {
      const sortKey = (/** @type {any} */ g) => (g.kind === 'block' ? g.summary?.pValue ?? -1 : g.coef?.pval ?? -1);
      groups.sort((a, b) => {
        if (a.isIntercept) return -1;
        if (b.isIntercept) return 1;
        return sortKey(b) - sortKey(a);
      });
    }
    for (const g of groups) {
      if (g.kind === 'single') {
        rows.push(mkRow(g.termId, g.coef, { isIntercept: g.isIntercept, key: `s-${g.termId}` }));
        continue;
      }
      const s = g.summary;
      const c = sigClasses(s?.pValue, alpha);
      rows.push({
        key: `bh-${g.termId}`, label: g.termId, dataTerm: g.termId, checked: true, cbDisabled: false,
        trClass: `reg__tr--block ${c.trClass}`.trim(), termClass: 'reg__td--block-header', blockHeader: true,
        blockDf: `df=${formatNumber(g.block?.df ?? g.coefs.length, lang)}`,
        coef: EN_DASH, ci: '', se: '', t: s ? fmt(s.fStat, lang) : '',
        p: s && Number.isFinite(s.pValue) ? fmtP(s.pValue, lang) : EN_DASH, pSig: c.pSig,
        vif: '', vifFull: '', vifClass: '',
      });
      for (const cd of g.coefs) {
        const label = cd.columnName ?? cd.term;
        rows.push(mkRow(label, cd, { blockTermId: g.termId, indented: true, key: `sub-${g.termId}-${label}` }));
      }
    }
    for (const id of excludedIds) rows.push(mkExcluded(id));
  } else {
    const coefMap = new Map(r.coefDetails.map((/** @type {any} */ c) => [c.term, c]));
    const list = (r.allTerms || r.coefDetails.map((/** @type {any} */ c) => c.term)).map((/** @type {string} */ term) => ({
      term, isExcluded: excluded.has(term), isIntercept: term === 'Intercept', coef: coefMap.get(term) || null,
    }));
    if (sortByP && hasDetails) {
      list.sort((/** @type {any} */ a, /** @type {any} */ b) => {
        if (a.isIntercept) return -1;
        if (b.isIntercept) return 1;
        if (a.isExcluded !== b.isExcluded) return a.isExcluded ? 1 : -1;
        return (b.coef?.pval ?? -1) - (a.coef?.pval ?? -1);
      });
    }
    for (const row of list) {
      rows.push(row.isExcluded ? mkExcluded(row.term) : mkRow(row.term, row.coef, { isIntercept: row.isIntercept, key: `l-${row.term}` }));
    }
  }
  return { rows, canExclude, hasDetails, hasVIF };
}

/**
 * Die Zeilen des Hinweises einer Versuchsvorgabe.
 * @param {{ aliased: Array<{ term: string, with: string[] }>, saturated: string[] }|null} n @param {T} t
 * @returns {string[]}
 */
export function designNoticeLines(n, t) {
  if (!n) return [];
  const lines = n.aliased.map((a) => t('designNoticeAliased', { term: a.term, with: a.with.join(', ') }));
  if (n.saturated.length > 0) lines.push(t('designNoticeSaturated', { terms: n.saturated.join(', ') }));
  return lines;
}

/**
 * Die Zeile „Ŷ(…) = …“ einer Vorhersage.
 * @param {Array<{ id: string, label: string, kind: string }>} predictors
 * @param {Record<string, number|string>} values die gelesenen Werte je id
 * @param {number} yHat @param {string} lang @returns {string}
 */
export function predictLine(predictors, values, yHat, lang) {
  const parts = predictors.map((p) => {
    if (p.kind === 'categorical') return `${p.label}=${values[p.id]}`;
    const v = fmt(/** @type {number} */ (values[p.id]), lang, 3);
    return p.kind === 'single' ? v : `${p.label}=${v}`;
  });
  return `${Y_HAT}(${parts.join(', ')}) = ${fmt(yHat, lang)}`;
}
