/**
 * D.Mike — Zufallsgenerator: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js, distributions.js oder der Engine.
 */

/**
 * Parameter je Verteilung im Formatstand 1.0: `[Vorgabe, min, max]`, ohne
 * Grenze `null`.
 * @type {Readonly<Record<string, Readonly<Record<string, readonly [number, number|null, number|null]>>>>}
 */
const PARAMS_1_0 = Object.freeze({
  normal: { mu: [0, null, null], sigma: [1, 0.0001, null], epsilon: [0, null, null], delta: [1, 0.01, null] },
  chisquare: { k: [5, 1, null] },
  f_dist: { d1: [5, 1, null], d2: [10, 1, null] },
  t_dist: { nu: [10, 1, null] },
  uniform: { a: [0, null, null], b: [1, null, null] },
  beta: { alpha: [2, 0.01, null], beta: [5, 0.01, null] },
  cauchy: { x0: [0, null, null], gamma: [1, 0.0001, null] },
  exponential: { lambda: [1, 0.0001, null] },
  gamma_dist: { alpha: [2, 0.01, null], beta: [1, 0.0001, null] },
  laplace: { mu: [0, null, null], b: [1, 0.0001, null] },
  gumbel_max: { mu: [0, null, null], beta: [1, 0.0001, null] },
  logistic: { mu: [0, null, null], s: [1, 0.0001, null] },
  loglogistic: { alpha: [1, 0.0001, null], beta: [1, 0.0001, null] },
  lognormal: { mu: [0, null, null], sigma: [1, 0.0001, null] },
  gumbel_min: { mu: [0, null, null], beta: [1, 0.0001, null] },
  triangular: { a: [0, null, null], c: [0.5, null, null], b: [1, null, null] },
  weibull: { alpha: [1.5, 0.0001, null], beta: [1, 0.0001, null] },
  bernoulli: { p: [0.5, 0, 1] },
  binomial: { n: [10, 1, null], p: [0.5, 0, 1] },
  geometric: { p: [0.3, 0.0001, 1] },
  negbinomial: { r: [5, 1, null], p: [0.5, 0.0001, 1] },
  hypergeometric: { N: [100, 1, null], K: [30, 0, null], n: [10, 1, null] },
  integer: { a: [1, null, null], b: [6, null, null] },
  poisson: { lambda: [5, 0.01, null] },
  mvnormal: { mu1: [0, null, null], mu2: [0, null, null], sigma1: [1, 0.0001, null], sigma2: [1, 0.0001, null], rho: [0.5, -0.999, 0.999] },
});

/** Schlüssel der attributiven Verteilung im Formatstand 1.0. */
const ATTRIBUTIVE_1_0 = 'attributive';

/** Größter Umfang im Formatstand 1.0. */
const MAX_COUNT_1_0 = 100000;

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/**
 * Eine Zahl aus Zahl oder Text wie `parseDecimalInput` (Komma oder Punkt);
 * Unlesbares `NaN`.
 * @param {unknown} v @returns {number}
 */
function readNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return NaN;
  const s = v.trim().replace(',', '.');
  return s === '' || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s) ? NaN : Number(s);
}

/**
 * Die Vorgaben einer Verteilung.
 * @param {string} dist @returns {Record<string, number>}
 */
function defaultsOf(dist) {
  return Object.fromEntries(Object.entries(PARAMS_1_0[dist]).map(([id, [d]]) => [id, d]));
}

/**
 * Ein gespeicherter Parameter: Zahl im Bereich, sonst die Vorgabe (wie
 * `resolveParams` der Altform; Werte außerhalb der Grenzen nimmt die Altform
 * nur aus Handständen an).
 * @param {unknown} raw @param {readonly [number, number|null, number|null]} spec @returns {number}
 */
function paramValue(raw, [d, min, max]) {
  const v = readNumber(raw);
  if (!Number.isFinite(v)) return d;
  if ((min !== null && v < min) || (max !== null && v > max)) return d;
  return v;
}

/**
 * Umfang wie `clampCount`: ganzzahlig (abgeschnitten), auf 1–100 000
 * begrenzt; nicht lesbar die Vorgabe.
 * @param {unknown} v @param {number} fallback @returns {number}
 */
function countValue(v, fallback) {
  const n = readNumber(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_COUNT_1_0, Math.max(1, Math.trunc(n)));
}

/**
 * Startwert: ganzzahlig (abgeschnitten), nicht endlich 42.
 * @param {unknown} v @returns {number}
 */
function seedValue(v) {
  const n = readNumber(v);
  return Number.isFinite(n) ? Math.trunc(n) : 42;
}

/** Die Vorgabe-Kategorien im Formatstand 1.0. */
const DEFAULT_ATTRIBUTES_1_0 = Object.freeze([
  { id: 'a1', name: 'A', weight: 1 },
  { id: 'a2', name: 'B', weight: 2 },
  { id: 'a3', name: 'C', weight: 7 },
]);

/**
 * Die Kategorien: fehlt die Liste oder ist sie leer, die Vorgaben (wie
 * `fromJSON` der Altform). Eine fehlende oder doppelte id wird fest aus der
 * Position `a<n>` vergeben (bei Kollision mit `_` ergänzt), vorhandene ids
 * bleiben; ein Name, der kein Text ist, wird `''`, ein Gewicht, das keine
 * endliche Zahl ab 0 ist, wird 0 (die Rechnung behandelte es ebenso).
 * @param {unknown} v @returns {{ id: string, name: string, weight: number }[]}
 */
function attributesValue(v) {
  if (!Array.isArray(v) || v.length === 0) return DEFAULT_ATTRIBUTES_1_0.map((a) => ({ ...a }));
  const own = v.map((a) => (isObject(a) && typeof a.id === 'string' && a.id !== '' ? a.id : null));
  const taken = new Set();
  const seen = new Set();
  /** @type {(string|null)[]} */
  const ids = own.map((id) => {
    if (id === null || seen.has(id)) return null;
    seen.add(id);
    taken.add(id);
    return id;
  });
  return v.map((a, i) => {
    let id = ids[i];
    if (id === null) {
      id = `a${i + 1}`;
      while (taken.has(id)) id += '_';
      taken.add(id);
    }
    const o = isObject(a) ? a : {};
    const w = typeof o.weight === 'number' && Number.isFinite(o.weight) ? Math.max(0, o.weight) : 0;
    return { id, name: typeof o.name === 'string' ? o.name : '', weight: w };
  });
}

/**
 * '0→1.0': jeder Stand ohne `_schema` (wie ihn das alte `State.toJSON`
 * schrieb). `currentDist` nur eine bekannte Verteilung, sonst `null`; das
 * flache `params` gehört der gespeicherten stetigen oder diskreten Verteilung
 * (je bekannter id gelesen, Unlesbares und Bereichsfremdes wird die Vorgabe),
 * alle anderen Verteilungen bekommen ihre Vorgaben; Umfang und Startwerte wie
 * beim Erzeugen der Altform; Kategorien siehe `attributesValue`. Unbekannte
 * Schlüssel entfallen.
 * @param {unknown} old gespeicherter Zustand ohne `_schema`
 * @returns {object}
 */
export function from0(old) {
  const o = isObject(old) ? old : {};
  const known = Object.hasOwn(PARAMS_1_0, o.currentDist) || o.currentDist === ATTRIBUTIVE_1_0;
  const currentDist = typeof o.currentDist === 'string' && known ? o.currentDist : null;
  const flat = isObject(o.params) ? o.params : {};
  /** @type {Record<string, Record<string, number>>} */
  const params = {};
  for (const dist of Object.keys(PARAMS_1_0)) {
    if (dist !== currentDist) { params[dist] = defaultsOf(dist); continue; }
    params[dist] = Object.fromEntries(Object.entries(PARAMS_1_0[dist])
      .map(([id, spec]) => [id, paramValue(flat[id], spec)]));
  }
  return {
    currentDist,
    params,
    count: countValue(o.count, 1000),
    seed: seedValue(o.seed),
    attributes: attributesValue(o.attributes),
    attrCount: countValue(o.attrCount, 50),
    attrSeed: seedValue(o.attrSeed),
  };
}
