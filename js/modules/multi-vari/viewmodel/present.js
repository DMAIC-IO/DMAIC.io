/**
 * D.Mike — Multi-Vari: Lauf und Anzeige (rein, ohne DOM).
 *
 * `analysisRun` ist der Lauf des auto-Tasks `analysis`: Stand lesen,
 * abbrechbar warten, rechnen. `buildStrips` macht aus dem Ergebnis und den
 * Anzeigeschaltern die Konfiguration je Diagrammstreifen; die übrigen
 * Funktionen liefern Texte und Kennzahlen der Ansicht.
 */
import {
  analyze, vcTermRows, pickLargestTerm, interpretationKey, intOrDash as dashInt,
  totalSdValue, totalPercentValue, isUnbalanced, hasClampedTerm,
} from '../domain/analysis.js';
import { formatNumber } from '../../../core/number-format.js';

/** Wartezeit vor dem Rechnen: eine schnelle Folge von Änderungen rechnet einmal. */
export const RERUN_DELAY = 120;

/** Alter `chartEdits`-Schlüssel des ersten Streifens. */
const LEGACY_EDIT_KEY = 'multi-vari';

/** @typedef {(key: string, params?: object) => string} Translate */
/** @typedef {{ values: any[]|null, name: string|null }} ColumnInput */

/**
 * Das gerechnete Ergebnis.
 * @typedef {object} Result
 * @property {Strip[]} strips  Diagrammzeilen
 * @property {string[]} seriesLevels  Stufen des Serienfaktors
 * @property {string[]} factorNames  Faktoren in Rollenreihenfolge
 * @property {number|null} grandMean  Gesamtmittelwert
 * @property {number} n  verwertete Messwerte
 * @property {number} droppedRows  verworfene Zeilen
 * @property {string[]} warnings  Warnkennungen
 * @property {number} yMin  kleinster Wert
 * @property {number} yMax  größter Wert
 * @property {boolean} balanced  ausgewogener Plan
 * @property {number} panelCount  Panels
 * @property {Array<{ code: string, column: string, count: number, max: number }>} limits  überschrittene Darstellungsgrenzen
 * @property {boolean} renderable  darstellbar
 * @property {object|null} vc  Varianzkomponenten
 */

/**
 * @typedef {object} Strip
 * @property {number} idx  Zeilennummer
 * @property {string} rowLevel  Stufe des Panelzeilenfaktors
 * @property {object[]} panels  Panels
 */

/**
 * Der Wert des Laufs `analysis`.
 * @typedef {object} Analysis
 * @property {Result|null} result  Ergebnis, oder null ohne Messwertspalte bzw. bei einem Fehler vor der Zerlegung
 * @property {'errNeedFactors'|'errNoData'|'errCompute'|null} error  Fehlerschlüssel
 * @property {string|null} message  Text der Engine bei errCompute
 */

/**
 * Stand des Laufs: belegte Bezüge, Spalten, Modellform und Schätzer. Die
 * Anzeigeschalter gehören nicht dazu.
 * @param {import('../domain/model.types.js').StateModel} model
 * @param {(ref: object) => ColumnInput} column
 * @returns {Parameters<typeof analyze>[0]}
 */
export function readInputs(model, column) {
  const read = (ref) => {
    const c = column(ref);
    return { values: c.values ?? [], name: c.name ?? '?' };
  };
  return {
    measurement: model.measurement ? read(model.measurement) : null,
    factors: model.factors.filter((f) => f.ref).map((f) => read(f.ref)),
    modelForm: model.modelForm,
    estimator: model.estimator,
  };
}

/**
 * Abbrechbare Pause.
 * @param {number} ms @param {AbortSignal} signal @returns {Promise<void>}
 */
export function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
    function onAbort() { clearTimeout(timer); reject(signal.reason); }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Der Lauf des auto-Tasks `analysis`. `this` ist das Viewmodel; es liest
 * Spalten über `this.column(ref)` (dahinter `ctx.data`). Alles, was vor dem
 * ersten `await` gelesen wird, startet den Lauf bei einer Änderung neu.
 * @param {typeof analyze} [compute] die Rechnung
 * @returns {(this: any, args: object, ctl: { signal: AbortSignal }) => Promise<Analysis>}
 */
export function analysisRun(compute = analyze) {
  return async function run(_args, { signal }) {
    const input = readInputs(this.model, (ref) => this.column(ref));
    await pause(RERUN_DELAY, signal);
    signal.throwIfAborted();
    const { result, error, message } = compute(input);
    return { result, error, message: message ?? null };
  };
}

/** @param {number} i Streifenindex @returns {string} alter `chartEdits`-Schlüssel */
const legacyEditKey = (i) => (i === 0 ? LEGACY_EDIT_KEY : `${LEGACY_EDIT_KEY}#${i + 1}`);

/**
 * Konfiguration je Diagrammstreifen. Alle Streifen teilen y-Domäne und
 * Referenzlinie; nur der letzte trägt die X-Beschriftung. Über einer
 * Größengrenze (`renderable === false`) gibt es keine Streifen.
 * @param {Result|null} result
 * @param {{ showPoints: boolean, connectMeans: boolean, showGroupMean: boolean, showRefLine: boolean, yLabel: string, refLabel: string }} opts
 * @returns {Array<{ key: string, legacyEditKey: string, config: object }>}
 */
export function buildStrips(result, opts) {
  if (!result || result.renderable === false) return [];
  const axisName = result.factorNames[0] || '';
  const last = result.strips.length - 1;
  return result.strips.map((strip, i) => ({
    key: String(strip.idx),
    legacyEditKey: legacyEditKey(i),
    config: {
      title: '',
      showTitle: false,
      xLabel: i === last ? axisName : '',
      showXLabel: i === last,
      yLabel: opts.yLabel,
      showLegend: true,
      panels: strip.panels,
      seriesLevels: result.seriesLevels,
      rowLabel: strip.rowLevel,
      refValue: opts.showRefLine ? result.grandMean : null,
      refLabel: opts.refLabel,
      sharedYMin: result.yMin,
      sharedYMax: result.yMax,
      showPoints: opts.showPoints,
      connectMeans: opts.connectMeans,
      showGroupMean: opts.showGroupMean,
    },
  }));
}

/**
 * Fehlertext unter den Eingaben. Wirft die Gruppierung, steht der Text der
 * Engine allein; scheitert nur die Zerlegung oder wirft der Lauf, steht er in
 * `errCompute`.
 * @param {Analysis|null} value Wert des Laufs
 * @param {string|null} runError Fehler des Laufs
 * @param {Translate} t
 * @returns {string}
 */
export function errorTextOf(value, runError, t) {
  if (runError) return t('errCompute', { msg: runError });
  if (!value?.error) return '';
  if (value.error !== 'errCompute') return t(value.error);
  return value.result ? t('errCompute', { msg: value.message ?? '' }) : (value.message ?? '');
}

/** @param {number} v @param {string} lang @returns {string} vier Nachkommastellen oder Gedankenstrich */
export const fmt = (v, lang) => (Number.isFinite(v) ? formatNumber(v, lang, { decimals: 4 }) : '–');

/** @param {number} v @param {string} lang @returns {string} eine Nachkommastelle oder Gedankenstrich */
export const pct = (v, lang) => (Number.isFinite(v) ? formatNumber(v, lang, { decimals: 1 }) : '–');

/** @param {number} v @returns {string} Ganzzahl oder Gedankenstrich */
export const intOrDash = (v) => dashInt(v);

/** @param {{ id: string, label: string }} term @param {Translate} t @returns {string} */
export const termLabel = (term, t) => (term.id === 'Error' ? t('termError') : term.label);

/**
 * Warnkennungen der Engines plus `droppedRows`, wenn Zeilen verworfen wurden.
 * @param {Result|null} result @returns {string[]}
 */
export function warningCodes(result) {
  if (!result) return [];
  return result.droppedRows > 0 ? [...result.warnings, 'droppedRows'] : result.warnings;
}

/**
 * Text einer Warnung; Größengrenzen nennen die Spalte, die sie sprengt.
 * @param {Result|null} result @param {string} code @param {Translate} t @returns {string}
 */
export function warningText(result, code, t) {
  if (code === 'droppedRows') return t('warnDroppedRows', { count: result?.droppedRows ?? 0 });
  const limit = (result?.limits || []).find((l) => l.code === code);
  if (limit) return t(`warn_${code}`, { col: limit.column, count: limit.count, max: limit.max });
  return t(`warn_${code}`);
}

/**
 * Kennzahlen und Tabelle der Varianzkomponenten für die Ansicht.
 * @param {Result|null} result @param {Translate} t @param {string} lang Sprache der Zahlen
 * @returns {{ terms: object[], largest: object|null, largestPercent: string, largestLabel: string,
 *   interpretation: string, totalVariance: string, totalSd: string, totalPercent: string,
 *   unbalanced: boolean, clamped: boolean }}
 */
export function vcView(result, t, lang) {
  const terms = vcTermRows(result);
  const vc = result?.vc;
  const largest = pickLargestTerm(vc?.terms);
  const largestLabel = largest ? termLabel(largest, t) : '';
  return {
    terms,
    largest,
    largestPercent: largest ? `${pct(largest.percent, lang)} %` : '–',
    largestLabel,
    interpretation: largest ? t(interpretationKey(largest), { term: largestLabel, percent: pct(largest.percent, lang) }) : '',
    totalVariance: fmt(vc?.totalVariance, lang),
    totalSd: fmt(totalSdValue(vc), lang),
    totalPercent: pct(totalPercentValue(vc), lang),
    unbalanced: isUnbalanced(result),
    clamped: hasClampedTerm(terms),
  };
}
