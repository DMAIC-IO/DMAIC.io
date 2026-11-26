/**
 * D.Mike — Stichprobenumfang: Rechnung.
 *
 * Aus dem Stand des Models der erforderliche Umfang, die Effektgröße und die
 * Power-Kurve. Fehlt eine Effektangabe der gewählten Variante oder ist sie
 * nicht größer als 0, gibt es kein Ergebnis (`null`). Rein, ohne DOM und
 * i18n; die letzte Rechnung wird gemerkt, so rechnen Ansicht und Ableitung
 * je Änderung einmal.
 */
import { findRequiredN } from '../../../engines/hypothesis-test-engine.js';
import { VARIANTS, variantOf, algoIdOf } from './variants.js';

/** Obergrenze der Suche nach n (und der Kurve). */
export const N_CAP = 5000;

/** Stützstellen der Kurve, soweit sie unter dem Kurvenende liegen. */
const LANDMARKS = Object.freeze([4, 5, 10, 15, 20, 30, 50, 75, 100, 150, 200, 300, 500, 750, 1000]);

/**
 * @typedef {object} Inputs
 * @property {'variance'|'mean'} category
 * @property {'one'|'two'} testType
 * @property {'two-sided'|'greater'|'less'} direction
 * @property {number} alpha
 * @property {number} power
 * @property {Record<string, Record<string, number|null>>} effect
 */

/**
 * @typedef {object} Analysis
 * @property {number} nRequired Umfang je Gruppe (höchstens `N_CAP`)
 * @property {number} totalN Gesamtumfang
 * @property {number} alpha
 * @property {number} power
 * @property {'varianceRatio'|'cohensD'} effectKey
 * @property {number} effectValue
 * @property {'chi-square-variance'|'f-test'|'one-sample-t-test'|'two-sample-t-test'} algoId
 * @property {boolean} isTwo
 * @property {Array<{ n: number, power: number }>} curve Power je n
 */

/**
 * Die Power-Kurve über n: dichte Punkte bis `min(5000, max(2·n, 30))`, dazu
 * die Lösung, Stützstellen und halbes/dreiviertel n.
 * @param {(n: number) => number} powerFn
 * @param {number} nReq
 * @returns {Array<{ n: number, power: number }>}
 */
export function powerCurve(powerFn, nReq) {
  const nMax = Math.min(N_CAP, Math.max(nReq * 2, 30));
  const nSet = new Set();
  const step = Math.max(1, Math.round(nMax / 80));
  for (let n = 4; n <= nMax; n += step) nSet.add(n);
  if (nReq < N_CAP) nSet.add(nReq);
  nSet.add(nMax);
  for (const n of LANDMARKS) if (n <= nMax) nSet.add(n);
  if (nReq > 5 && nReq < N_CAP) {
    nSet.add(Math.max(4, Math.round(nReq * 0.5)));
    nSet.add(Math.max(4, Math.round(nReq * 0.75)));
  }
  return [...nSet].sort((a, b) => a - b).map((n) => ({ n, power: powerFn(n) }));
}

/**
 * Der benötigte Stichprobenumfang mit Kennzahlen, wie ihn `read().result`
 * liefert.
 *
 * @typedef {object} Result
 * @property {number} nRequired  Umfang je Gruppe
 * @property {number} totalN  Gesamtumfang
 * @property {number} alpha  Signifikanzniveau
 * @property {number} power  Ziel-Teststärke
 * @property {string} effectLabel  Name der Effektgröße
 * @property {number} effectValue  Effektgröße
 * @property {'chi-square-variance'|'f-test'|'one-sample-t-test'|'two-sample-t-test'} algoId  Verfahren
 */

/** @type {{ key: string, value: Analysis|null }|null} */
let memo = null;

/**
 * Die Rechnung zum Stand; `null`, solange eine Effektangabe der gewählten
 * Variante fehlt oder nicht größer als 0 ist.
 * @param {Inputs} m
 * @returns {Analysis|null}
 */
export function analyze(m) {
  const id = variantOf(m.category, m.testType);
  const variant = VARIANTS[id];
  const src = m.effect?.[id] ?? {};
  /** @type {Record<string, number>} */
  const p = {};
  for (const k of variant.params) {
    const v = src[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null;
    p[k] = v;
  }
  const isTwo = m.testType === 'two';
  const key = JSON.stringify([id, isTwo, m.direction, m.alpha, m.power, p]);
  if (memo && memo.key === key) return memo.value;
  const powerFn = variant.powerFn(p, isTwo, m.alpha, m.direction);
  const nRequired = findRequiredN(m.power, powerFn);
  /** @type {Analysis} */
  const value = {
    nRequired,
    totalN: isTwo ? nRequired * 2 : nRequired,
    alpha: m.alpha,
    power: m.power,
    effectKey: variant.effectKey,
    effectValue: variant.effectValue(p),
    algoId: algoIdOf(m.category, m.testType),
    isTwo,
    curve: powerCurve(powerFn, nRequired),
  };
  memo = { key, value };
  return value;
}
