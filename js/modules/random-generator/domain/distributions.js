/**
 * D.Mike — Zufallsgenerator: die Verteilungen.
 *
 * `PARAMS_SHAPE` ist die Form des Felds `params` (Regel M6: je Verteilung
 * ein Objekt mit ihren Parametern, Vorgabe und Grenzen wie im Register der
 * Engine). Sie steht als Literal hier, weil das Schema nichts aus der Engine
 * übernehmen darf; die Gleichheit mit dem Register prüft ein Unit-Test.
 * Name, Formel, Kategorie und Ziehung liefert weiter die Engine.
 */
import { object, number } from '../../../core/model.js';
import { DISTRIBUTIONS } from '../../../engines/random-variates-engine.js';

/** Schlüssel der attributiven (kategorialen) Verteilung. */
export const ATTRIBUTIVE_KEY = 'attributive';

/** Die stetigen und diskreten Verteilungen in Registerreihenfolge. */
export const NUMERIC_KEYS = Object.freeze(Object.keys(DISTRIBUTIONS));

/** Alle wählbaren Verteilungen, die attributive am Ende. */
export const DIST_KEYS = Object.freeze([...NUMERIC_KEYS, ATTRIBUTIVE_KEY]);

/** Die Parameter je Verteilung: Vorgabe und Grenzen wie im Register. */
export const PARAMS_SHAPE = Object.freeze({
  normal: object({
    mu: number({ default: 0 }),
    sigma: number({ default: 1, min: 0.0001 }),
    epsilon: number({ default: 0 }),
    delta: number({ default: 1, min: 0.01 }),
  }),
  chisquare: object({
    k: number({ default: 5, min: 1 }),
  }),
  f_dist: object({
    d1: number({ default: 5, min: 1 }),
    d2: number({ default: 10, min: 1 }),
  }),
  t_dist: object({
    nu: number({ default: 10, min: 1 }),
  }),
  uniform: object({
    a: number({ default: 0 }),
    b: number({ default: 1 }),
  }),
  beta: object({
    alpha: number({ default: 2, min: 0.01 }),
    beta: number({ default: 5, min: 0.01 }),
  }),
  cauchy: object({
    x0: number({ default: 0 }),
    gamma: number({ default: 1, min: 0.0001 }),
  }),
  exponential: object({
    lambda: number({ default: 1, min: 0.0001 }),
  }),
  gamma_dist: object({
    alpha: number({ default: 2, min: 0.01 }),
    beta: number({ default: 1, min: 0.0001 }),
  }),
  laplace: object({
    mu: number({ default: 0 }),
    b: number({ default: 1, min: 0.0001 }),
  }),
  gumbel_max: object({
    mu: number({ default: 0 }),
    beta: number({ default: 1, min: 0.0001 }),
  }),
  logistic: object({
    mu: number({ default: 0 }),
    s: number({ default: 1, min: 0.0001 }),
  }),
  loglogistic: object({
    alpha: number({ default: 1, min: 0.0001 }),
    beta: number({ default: 1, min: 0.0001 }),
  }),
  lognormal: object({
    mu: number({ default: 0 }),
    sigma: number({ default: 1, min: 0.0001 }),
  }),
  gumbel_min: object({
    mu: number({ default: 0 }),
    beta: number({ default: 1, min: 0.0001 }),
  }),
  triangular: object({
    a: number({ default: 0 }),
    c: number({ default: 0.5 }),
    b: number({ default: 1 }),
  }),
  weibull: object({
    alpha: number({ default: 1.5, min: 0.0001 }),
    beta: number({ default: 1, min: 0.0001 }),
  }),
  bernoulli: object({
    p: number({ default: 0.5, min: 0, max: 1 }),
  }),
  binomial: object({
    n: number({ default: 10, min: 1 }),
    p: number({ default: 0.5, min: 0, max: 1 }),
  }),
  geometric: object({
    p: number({ default: 0.3, min: 0.0001, max: 1 }),
  }),
  negbinomial: object({
    r: number({ default: 5, min: 1 }),
    p: number({ default: 0.5, min: 0.0001, max: 1 }),
  }),
  hypergeometric: object({
    N: number({ default: 100, min: 1 }),
    K: number({ default: 30, min: 0 }),
    n: number({ default: 10, min: 1 }),
  }),
  integer: object({
    a: number({ default: 1 }),
    b: number({ default: 6 }),
  }),
  poisson: object({
    lambda: number({ default: 5, min: 0.01 }),
  }),
  mvnormal: object({
    mu1: number({ default: 0 }),
    mu2: number({ default: 0 }),
    sigma1: number({ default: 1, min: 0.0001 }),
    sigma2: number({ default: 1, min: 0.0001 }),
    rho: number({ default: 0.5, min: -0.999, max: 0.999 }),
  }),
});

/**
 * Ist `key` eine stetige oder diskrete Verteilung?
 * @param {unknown} key @returns {boolean}
 */
export function isNumericDist(key) {
  return typeof key === 'string' && Object.hasOwn(DISTRIBUTIONS, key);
}

/**
 * Der Registereintrag einer Verteilung (Name, Formel, Parameter, Ziehung)
 * oder `null`.
 * @param {unknown} key
 * @returns {import('../../../engines/random-variates-engine.js').Distribution|null}
 */
export function distOf(key) {
  return isNumericDist(key) ? DISTRIBUTIONS[/** @type {string} */ (key)] : null;
}

/**
 * Die Seitenleiste: je Kategorie (`catContinuous`, `catDiscrete`) ihre
 * Verteilungen in Registerreihenfolge.
 * @returns {{ key: string, dists: string[] }[]}
 */
export function categories() {
  /** @type {Map<string, string[]>} */
  const cats = new Map();
  for (const key of NUMERIC_KEYS) {
    const cat = DISTRIBUTIONS[key].categoryKey;
    if (!cats.has(cat)) cats.set(cat, []);
    cats.get(cat)?.push(key);
  }
  return [...cats].map(([key, dists]) => ({ key, dists }));
}
