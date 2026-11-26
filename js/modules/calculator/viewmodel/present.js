/**
 * D.Mike — Taschenrechner: Presenter.
 *
 * Rein: welche Anzeige ein ausgeführtes Kommando hinterlässt (nur Schlüssel
 * und Zahlen), ob sie noch zum Model passt, und daraus die Texte der beiden
 * Anzeigezeilen, die Beschriftung der Kennwerttasten und das Zahlformat in
 * der App-Sprache.
 */
import { formatNumber, decimalSeparator } from '../../../core/number-format.js';

/**
 * Beschriftung eines Kennwerts über der Anzeige: ein Symbol oder ein
 * i18n-Schlüssel.
 * @typedef {{ symbol?: string, key?: string }} Label
 */

/** Statistikbereich: Beschriftung je Kennwert. @type {Record<string, Label>} */
const STAT_LABELS = {
  mean: { symbol: 'x̄' },
  median: { symbol: 'x̃' },
  mode: { key: 'statMode' },
  range: { key: 'statRange' },
  stdS: { symbol: 's' },
  stdP: { symbol: 'σ' },
  varS: { symbol: 's²' },
  varP: { symbol: 'σ²' },
  sum: { symbol: 'Σ' },
  min: { symbol: 'Min' },
  max: { symbol: 'Max' },
  count: { symbol: 'n' },
  q1: { symbol: 'Q1' },
  q3: { symbol: 'Q3' },
  iqr: { symbol: 'IQR' },
  skew: { key: 'statSkewness' },
};

/** Prozessbereich: Beschriftung je Kennwert. @type {Record<string, Label>} */
const SS_LABELS = {
  cp: { symbol: 'Cp' },
  cpk: { symbol: 'Cpk' },
  pp: { symbol: 'Pp' },
  ppk: { symbol: 'Ppk' },
  sigma: { symbol: 'Sigma' },
  dpmo: { symbol: 'DPMO' },
  yield: { symbol: 'Yield' },
  zscore: { symbol: 'Z-Score' },
  mean: { symbol: 'x̄' },
  std: { symbol: 'σ' },
  ucl: { symbol: 'UCL' },
  lcl: { symbol: 'LCL' },
};

/**
 * Tastenbeschriftung: Vorsatz (Symbol) und i18n-Schlüssel, `(…)` hängt den
 * Schlüssel in Klammern an.
 * @typedef {{ prefix?: string, key: string, paren?: boolean }} KeyLabel
 */

/** @type {Record<string, KeyLabel>} */
const STAT_KEYS = {
  mean: { prefix: 'x̄', key: 'statMean' },
  median: { prefix: 'x̃', key: 'statMedian' },
  mode: { key: 'statMode' },
  range: { key: 'statRange' },
  stdS: { prefix: 's', key: 'statSample', paren: true },
  stdP: { prefix: 'σ', key: 'statPopulation', paren: true },
  varS: { prefix: 's²', key: 'statVariance' },
  varP: { prefix: 'σ²', key: 'statVariance' },
  sum: { prefix: 'Σ', key: 'statSum' },
  min: { key: 'keyMin' },
  max: { key: 'keyMax' },
  count: { prefix: 'n', key: 'statCount' },
  q1: { key: 'keyQ1' },
  q3: { key: 'keyQ3' },
  iqr: { key: 'keyIqr' },
  skew: { key: 'statSkewness' },
};

/** @type {Record<string, KeyLabel>} */
const SS_KEYS = {
  cp: { key: 'keyCp' },
  cpk: { key: 'keyCpk' },
  pp: { key: 'keyPp' },
  ppk: { key: 'keyPpk' },
  sigma: { key: 'keySigma' },
  dpmo: { key: 'keyDpmo' },
  yield: { key: 'keyYield' },
  zscore: { key: 'keyZscore' },
  mean: { prefix: 'x̄', key: 'statMean' },
  std: { prefix: 'σ', key: 'statStdDev' },
  ucl: { key: 'keyUcl' },
  lcl: { key: 'keyLcl' },
};

/** Gründe des Statistikbereichs, die als Hinweis (ohne Fehlerfarbe) erscheinen. */
const SOFT_REASONS = ['needN2', 'needN3', 'noMode'];

/**
 * Beschriftung einer Kennwerttaste.
 * @param {'stat'|'ss'} area @param {string} type @param {(k: string) => string} t
 * @returns {string}
 */
export function keyLabel(area, type, t) {
  const l = (area === 'stat' ? STAT_KEYS : SS_KEYS)[type];
  if (!l) return '';
  const text = t(l.key);
  if (!l.prefix) return text;
  return l.paren ? `${l.prefix} (${text})` : `${l.prefix} ${text}`;
}

/**
 * Text einer Zahl im Format der App-Sprache. Ganze Zahlen gruppiert, sonst
 * `sig` signifikante Stellen, unter 1e-4 und ab `big` in Exponentenform mit
 * `expDigits` Nachkommastellen; nicht endliche Werte wörtlich.
 * @param {number} v @param {string} lang @param {number} sig @param {number} big @param {number} expDigits
 * @returns {string}
 */
function formatDigits(v, lang, sig, big, expDigits) {
  if (Number.isInteger(v)) return formatNumber(v, lang);
  if (!Number.isFinite(v)) return String(v);
  if (Math.abs(v) < 0.0001 || Math.abs(v) >= big) {
    return v.toExponential(expDigits).replace('.', decimalSeparator(lang));
  }
  return formatNumber(Number(v.toPrecision(sig)), lang);
}

/** Ein Kennwert: 8 signifikante Stellen, Exponent ab 1e8. @param {number} v @param {string} lang @returns {string} */
export const formatStat = (v, lang) => formatDigits(v, lang, 8, 1e8, 6);

/** Ein Rechenergebnis (=): 12 signifikante Stellen, Exponent ab 1e10. @param {number} v @param {string} lang @returns {string} */
export const formatCalc = (v, lang) => formatDigits(v, lang, 12, 1e10, 8);

/** Ein Wert eines Datensatzes. @param {number} v @param {string} lang @returns {string} */
export const formatValue = (v, lang) => formatNumber(v, lang);

/**
 * Was eine Anzeige gilt: Ausdruck, letztes Ergebnis, Länge beider
 * Datensätze und Bereich.
 * @typedef {{ expression: string, lastResult: number|null, n: number, nSS: number, mode: string }} Snap
 */

/**
 * @typedef {object} Top
 * @property {'none'|'expr'|'stat'|'ss'} kind  leer, „<Ausdruck> =“ oder die Beschriftung eines Kennwerts
 * @property {string} text  der Ausdruck (bei `expr`)
 * @property {string} type  der Kennwert (bei `stat`/`ss`)
 */

/**
 * @typedef {object} Main
 * @property {'expr'|'zero'|'calc'|'stat'|'modes'|'percent'|'added'|'reason'} kind
 * @property {number|null} value  die Zahl (calc, stat, percent, added)
 * @property {number[]} modes  die Modalwerte (modes)
 * @property {string} key  i18n-Schlüssel des Grunds (reason)
 * @property {boolean} error  in Fehlerfarbe
 */

/** @typedef {{ top: Top, main: Main, snap: Snap }} Display */

/** @param {any} m @returns {Snap} */
export function snapOf(m) {
  return {
    expression: m.expression,
    lastResult: m.lastResult,
    n: m.dataset.length,
    nSS: m.ssDataset.length,
    mode: m.mode,
  };
}

/**
 * Gleicher Stand für die Anzeige. Der Vergleich ist grob: ein anderer Stand
 * mit denselben Kennzahlen (etwa nach Rückgängig und neuer Eingabe) kann
 * zufällig passen — das betrifft nur die Beschriftung, nie das Model.
 * @param {Snap} a @param {Snap} b @returns {boolean}
 */
const sameSnap = (a, b) => a.expression === b.expression && a.lastResult === b.lastResult
  && a.n === b.n && a.nSS === b.nSS && a.mode === b.mode;

/** Grund neben einem nicht endlichen Wert: angezeigt wird der Wert. */
const NOT_FINITE = 'notFinite';

/** @type {Top} */
const TOP_NONE = { kind: 'none', text: '', type: '' };

/** @param {Partial<Main>} p @returns {Main} */
const main = (p) => ({ kind: 'expr', value: null, modes: [], key: '', error: false, ...p });

/**
 * Die Anzeige nach einem ausgeführten Kommando (Tabelle der Altform); ohne
 * Wirkung auf die Anzeige `null`.
 * @param {Display|null} prev die bisherige Anzeige (nur gültig, wenn sie zum Stand vor dem Kommando passte)
 * @param {string} command @param {any} args @param {any} result @param {any} m das Model danach
 * @returns {Display|null}
 */
export function nextDisplay(prev, command, args, result, m) {
  const top = prev?.top ?? TOP_NONE;
  /** @param {Top} tp @param {Main} mn @returns {Display} */
  const out = (tp, mn) => ({ top: tp, main: mn, snap: snapOf(m) });
  switch (command) {
    case 'inputText': case 'inputFn': case 'backspace': case 'memRecall':
      return out(top, main({ kind: 'expr' }));
    case 'clear': case 'clearData': case 'clearSSData':
      return out(TOP_NONE, main({ kind: 'zero' }));
    case 'switchMode':
      return result === true ? out(TOP_NONE, main({ kind: 'zero' })) : null;
    case 'calculate':
      if (result?.reason && result.reason !== NOT_FINITE) return out(top, main({ kind: 'reason', key: 'error', error: true }));
      return out({ kind: 'expr', text: result.expression, type: '' }, main({ kind: 'calc', value: result.value }));
    case 'calcStat': case 'calcSS': {
      const kind = command === 'calcStat' ? 'stat' : 'ss';
      const labelTop = /** @type {Top} */ ({ kind, text: '', type: args?.type ?? '' });
      if (result?.reason && result.reason !== NOT_FINITE) {
        const soft = kind === 'stat' && SOFT_REASONS.includes(result.reason);
        return soft
          ? out(labelTop, main({ kind: 'reason', key: result.reason }))
          : out(top, main({ kind: 'reason', key: result.reason, error: true }));
      }
      if (result?.modes) return out(labelTop, main({ kind: 'modes', modes: [...result.modes] }));
      if (result?.percent !== null && result?.percent !== undefined) {
        return out(labelTop, main({ kind: 'percent', value: result.percent }));
      }
      return out(labelTop, main({ kind: 'stat', value: result.value }));
    }
    case 'addData': case 'addSSData': case 'addDataValue': case 'addSSDataValue':
      return result === null || result === undefined ? null : out(TOP_NONE, main({ kind: 'added', value: result }));
    case 'removeLast': case 'removeLastSS':
      return out(top, main({ kind: 'reason', key: 'removed' }));
    default:
      return null;
  }
}

/**
 * Die Anzeige, wenn sie noch zum Model passt, sonst `null` (Rückgängig,
 * Neuladen, Schreiben von außen: dann gilt die Anzeige beim Einhängen).
 * @param {Display|null} d @param {any} m @returns {Display|null}
 */
export function currentDisplay(d, m) {
  return d && sameSnap(d.snap, snapOf(m)) ? d : null;
}

/**
 * Zeile über der Anzeige.
 * @param {Display|null} d gültige Anzeige oder null @param {(k: string) => string} t
 * @returns {string}
 */
export function topText(d, t) {
  const top = d?.top;
  if (!top || top.kind === 'none') return '';
  if (top.kind === 'expr') return `${top.text} =`;
  const l = (top.kind === 'stat' ? STAT_LABELS : SS_LABELS)[top.type];
  if (!l) return '';
  return l.symbol ?? t(/** @type {string} */ (l.key));
}

/**
 * Hauptzeile der Anzeige.
 * @param {Display|null} d gültige Anzeige oder null @param {any} m @param {(k: string) => string} t @param {string} lang
 * @returns {string}
 */
export function mainText(d, m, t, lang) {
  const mn = d?.main;
  if (!mn || mn.kind === 'expr') return fallbackText(m, lang);
  switch (mn.kind) {
    case 'zero': return '0';
    case 'calc': return formatCalc(/** @type {number} */ (mn.value), lang);
    case 'stat': return formatStat(/** @type {number} */ (mn.value), lang);
    case 'modes': return mn.modes.map((v) => formatValue(v, lang)).join('; ');
    case 'percent': return `${formatNumber(/** @type {number} */ (mn.value), lang, { decimals: 4 })}%`;
    case 'added': return formatValue(/** @type {number} */ (mn.value), lang);
    case 'reason': return t(mn.key);
    default: return fallbackText(m, lang);
  }
}

/**
 * Ohne eigene Anzeige: der Ausdruck, bei leerer Zeile das letzte Ergebnis
 * (womit weitergerechnet wird, etwa nach Wiederholen oder Neuladen), sonst 0.
 * @param {any} m @param {string} lang @returns {string}
 */
function fallbackText(m, lang) {
  if (m.expression) return m.expression;
  return m.lastResult !== null && m.lastResult !== undefined ? formatCalc(m.lastResult, lang) : '0';
}

/** @param {Display|null} d @returns {boolean} Hauptzeile in Fehlerfarbe */
export const isError = (d) => Boolean(d?.main.error);

/** @param {Display|null} d @returns {string|null} Icon vor der Hauptzeile (Wert übernommen) */
export const mainIcon = (d) => (d?.main.kind === 'added' ? 'status.ok' : null);
