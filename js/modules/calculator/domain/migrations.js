/**
 * D.Mike — Taschenrechner: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js oder calc.js.
 */
import { parseDecimalInput } from '../../../core/parse-decimal.js';

/** Rechenbereiche im Formatstand 1.0. */
const MODES_1_0 = ['sci', 'stats', 'sixsigma'];

/** Winkeleinheiten im Formatstand 1.0. */
const ANGLE_MODES_1_0 = ['DEG', 'RAD'];

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** @param {unknown} v @returns {v is number} */
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);

/** @param {unknown} v @returns {number[]} nur die endlichen Zahlen einer Liste */
const numbers = (v) => (Array.isArray(v) ? v.filter(isFiniteNumber) : []);

/**
 * Eine Spezifikationsgrenze: fehlend oder leer wird `null`, eine Zahl bleibt,
 * ein Text wird über `parseDecimalInput` gelesen; was keine endliche Zahl
 * ergibt, wird `null`.
 * @param {unknown} v @returns {number|null}
 */
function limit(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = parseDecimalInput(String(v));
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/**
 * '0→1.0': jeder Stand ohne `_schema` (wie ihn das alte `State.toJSON`
 * schrieb). Der Bereich `ss` älterer Stände wird `sixsigma`, jeder andere
 * unbekannte Bereich `sci`; `lastResult` und `memory` nur als endliche Zahl
 * (sonst `null` bzw. 0); die Datensätze nur ihre Zahlen; die Grenzen als
 * Zahl oder `null`. Unbekannte Schlüssel entfallen.
 * @param {unknown} old gespeicherter Zustand ohne `_schema`
 * @returns {{ mode: string, expression: string, lastResult: number|null, memory: number, angleMode: string, dataset: number[], ssDataset: number[], lsl: number|null, usl: number|null }}
 */
export function from0(old) {
  const o = isObject(old) ? old : {};
  let mode = 'sci';
  if (o.mode === 'ss') mode = 'sixsigma';
  else if (MODES_1_0.includes(o.mode)) mode = o.mode;
  return {
    mode,
    expression: typeof o.expression === 'string' ? o.expression : '',
    lastResult: isFiniteNumber(o.lastResult) ? o.lastResult : null,
    memory: isFiniteNumber(o.memory) ? o.memory : 0,
    angleMode: ANGLE_MODES_1_0.includes(o.angleMode) ? o.angleMode : 'DEG',
    dataset: numbers(o.dataset),
    ssDataset: numbers(o.ssDataset),
    lsl: limit(o.lsl),
    usl: limit(o.usl),
  };
}
