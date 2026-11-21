/**
 * D.Mike — Process Capability: Rechnung. Rein.
 *
 * Aus dem Model und einem Spaltenleser (`sourceColumns(src)`) das Ergebnis
 * der Engine, die Wahl des Schätzers und ein optionaler Hinweis (i18n-Schlüssel
 * mit Parametern, nie Text). Kein DOM, kein i18n.
 */

import { validate, analyze as engineAnalyze } from '../../../engines/process-capability-engine.js';
import {
  splitSubgroups, alignValuesAndIds, validMethods, defaultMethod, SigmaWithinError,
  SUBGROUP_METHODS,
} from '../../../engines/sigma-within-engine.js';
import { subgroupAllowed } from './columns.js';
import { parseNumeric } from '../../../core/datagrid/datagrid-utils.js';

/** @typedef {{ values: (ref: object) => any[]|null, name: (ref: object) => string|null }} Read */
/** @typedef {{ key: string, params: Record<string, any> }} Hint */

/** SigmaWithinError code → hint key. */
const WITHIN_ERROR_HINT = {
  subgroupTooLarge: 'errWithinSubgroupTooLarge',
  spanTooLarge: 'errWithinSpanTooLarge',
};

/** @param {unknown} v @returns {number|null} */
const finiteOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** @param {unknown} v @returns {number|null} a number as is, anything else as the worksheet reads it */
function toNumber(v) {
  if (typeof v === 'boolean') return null;
  const n = typeof v === 'number' ? v : parseNumeric(v);
  return n === null || !Number.isFinite(n) ? null : n;
}

/** @param {any[]} arr @returns {number[]} */
function numbers(arr) {
  return arr.map(toNumber).filter((v) => v !== null);
}

/**
 * Konfidenz als Anteil (0 < c < 1) aus der Prozenteingabe; ohne brauchbaren
 * Wert 95 Prozent, sonst auf 50 bis 99,99 Prozent geklemmt.
 * @param {number|null|undefined} percent
 * @returns {number}
 */
function confidenceFraction(percent) {
  const raw = finiteOrNull(percent);
  if (raw !== null && raw > 0) return Math.max(50, Math.min(99.99, raw)) / 100;
  return 0.95;
}

/** @param {any} model @returns {'size'|'column'} Beispieldaten erzwingen die feste Größe. */
function effectiveMode(model) {
  return model.embeddedValues ? 'size' : model.params.subgroupMode;
}

/** @param {any} model @returns {number} Untergruppengröße als positive ganze Zahl. */
function subgroupSizeValue(model) {
  const n = Math.trunc(Number(model.params.subgroupSize));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** @param {any} model @returns {number} Spanne der gleitenden Spannweite, 2 bis 100. */
function mrSpanValue(model) {
  const n = Number(model.params.mrSpan);
  return Number.isInteger(n) && n >= 2 && n <= 100 ? n : 2;
}

/**
 * Werte und, im Modus Spalte, die dazu ausgerichteten Untergruppen-IDs.
 * Beispieldaten haben Vorrang.
 * @param {any} model
 * @param {Read} read
 * @returns {{ values: number[], ids: string[]|null, missingIds: boolean }}
 */
function analysisInput(model, read) {
  const column = (ref) => read.values(ref) ?? [];
  if (effectiveMode(model) !== 'column') {
    if (model.embeddedValues) return { values: numbers(model.embeddedValues), ids: null, missingIds: false };
    if (!model.columnRef) return { values: [], ids: null, missingIds: false };
    return { values: numbers(column(model.columnRef)), ids: null, missingIds: false };
  }
  if (!model.columnRef) return { values: [], ids: null, missingIds: false };
  const a = model.columnRef;
  const b = model.subgroupColumnRef;
  if (!b || !subgroupAllowed(a, b)) return { values: [], ids: null, missingIds: true };
  const aligned = alignValuesAndIds(column(a).map(toNumber), column(b));
  return { values: aligned.values, ids: aligned.ids, missingIds: false };
}

/**
 * Die Werte, mit denen `analyze` rechnet: Beispieldaten, sonst die Zahlen der
 * Messspalte (im Modus Spalte die zu den IDs ausgerichteten), sonst leer.
 * @param {any} model
 * @param {Read} read
 * @returns {number[]}
 */
export function inputValues(model, read) {
  return analysisInput(model, read).values;
}

/** Offered estimators for these groups and the active one. */
function chooseMethod(groups, stored) {
  const methods = validMethods(groups);
  return { methods, method: methods.includes(stored) ? stored : defaultMethod(groups) };
}

/**
 * Die Fähigkeitsanalyse für ein Model.
 * @param {any} model
 * @param {Read} read - `sourceColumns(src)`
 * @returns {{ result: object|null, methods: string[], method: string, hint: Hint|null, empty: boolean }}
 */
export function analyze(model, read) {
  const stored = model.params.withinMethod;
  const size = subgroupSizeValue(model);
  // Without data the method list follows the settings alone (ID column →
  // subgroups, fixed size n → subgroups for n ≥ 2).
  const placeholder = [new Array(effectiveMode(model) === 'column' ? 2 : size).fill(0)];
  let { methods, method } = chooseMethod(placeholder, stored);
  const none = (extra = {}) => ({ result: null, method, methods, hint: null, empty: false, ...extra });

  if (!model.columnRef && !model.embeddedValues) return none({ empty: true });
  const { values, ids, missingIds } = analysisInput(model, read);
  let hint = missingIds ? { key: 'subgroupColumnMissing', params: {} } : null;
  if (values.length === 0) return none({ hint });

  const groups = ids ? splitSubgroups(values, { ids }) : splitSubgroups(values, { size });
  ({ methods, method } = chooseMethod(groups, stored));
  if (stored && stored !== method) {
    hint = {
      key: 'methodFallbackHint',
      params: { method: stored, kind: SUBGROUP_METHODS.includes(stored) ? 'kindSubgroups' : 'kindIndividuals', fallback: method },
    };
  }

  const p = model.params;
  const params = {
    lsl: finiteOrNull(p.lsl),
    usl: finiteOrNull(p.usl),
    target: finiteOrNull(p.target),
    confidence: confidenceFraction(p.confidence),
    withinMethod: method,
    unbiased: p.unbiased !== false,
    mrSpan: mrSpanValue(model),
  };
  if (ids) params.subgroupIds = ids;
  else params.subgroupSize = size;

  if (!validate(params, values).valid) return none({ hint });
  try {
    return { result: engineAnalyze(params, values), method, methods, hint, empty: false };
  } catch (e) {
    if (!(e instanceof SigmaWithinError)) throw e;
    return none({ hint: { key: WITHIN_ERROR_HINT[e.code] || 'errWithinMethodInvalid', params: {} } });
  }
}

/**
 * Text of an analysis hint.
 * @param {Hint|null} hint
 * @param {(key: string, params?: object) => string} t - translator relative to the module namespace
 * @returns {string}
 */
export function formatHint(hint, t) {
  if (!hint) return '';
  if (hint.key !== 'methodFallbackHint') return t(hint.key, hint.params);
  const name = (k) => t(`withinMethodNames.${k}`);
  return t(hint.key, { method: name(hint.params.method), kind: t(hint.params.kind), fallback: name(hint.params.fallback) });
}

/**
 * Vertical reference lines for the spec limits and the target.
 * @param {{hasLsl: boolean, lsl: number, hasUsl: boolean, usl: number, targetVal: number|null}} r
 * @param {(key: string) => string} t - translator for global keys (common.sym.*)
 * @returns {object[]} histogram refLines
 */
export function specRefLines(r, t) {
  const line = (value, label, color) => ({ dir: 'v', value, label, color, dash: 'dash', width: 1.5, showLabel: true });
  const out = [];
  if (r.hasLsl) out.push(line(r.lsl, t('common.sym.lsl'), 'var(--color-error)'));
  if (r.hasUsl) out.push(line(r.usl, t('common.sym.usl'), 'var(--color-error)'));
  if (r.targetVal != null) out.push(line(r.targetVal, t('common.sym.target'), 'var(--color-success)'));
  return out;
}
