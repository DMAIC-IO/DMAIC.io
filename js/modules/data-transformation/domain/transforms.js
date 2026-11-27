/**
 * D.Mike — Datentransformation: die Transformationen.
 *
 * Register `TRANSFORMS` (Kennung, Namens- und Beschreibungsschlüssel,
 * Parameter mit Vorgabe, Bereich und Schrittweite des Schiebers) und die
 * reine Rechnung (`applyTransform`, Schätzung von λ). `PARAMS_SHAPE` ist die
 * Form des Felds `params` (Regel M6: je Transformation mit Parametern ein
 * Objekt); sie steht als Literal hier, die Gleichheit mit dem Register prüft
 * ein Unit-Test. λ von Box-Cox und Yeo-Johnson ist nullbar: leer heißt
 * „geschätzt“.
 */
import { object, number } from '../../../core/model.js';
import { andersonDarling } from '../../../engines/normality-test-engine.js';

/**
 * @typedef {object} TransformParam
 * @property {string} key  Schlüssel des Parameters
 * @property {string} labelKey  Schlüssel der Beschriftung
 * @property {number} default  Wert vor der ersten Schätzung bzw. Vorgabe
 * @property {number} min  kleinster Wert
 * @property {number} max  größter Wert
 * @property {number} step  Schrittweite des Schiebers
 */

/**
 * @typedef {object} TransformDef
 * @property {string} id  Kennung
 * @property {string} nameKey  Schlüssel des Namens
 * @property {string} descKey  Schlüssel der Beschreibung
 * @property {TransformParam[]} params  Parameter in Anzeigereihenfolge
 */

/** Die Parameter der Johnson-Transformationen. */
const JOHNSON_PARAMS = Object.freeze([
  { key: 'gamma', labelKey: 'paramGamma', default: 0, min: -5, max: 5, step: 0.1 },
  { key: 'delta', labelKey: 'paramDelta', default: 1, min: 0.1, max: 10, step: 0.1 },
  { key: 'xi', labelKey: 'paramXi', default: 0, min: -100, max: 100, step: 0.5 },
  { key: 'lambdaJ', labelKey: 'paramLambdaJ', default: 1, min: 0.1, max: 100, step: 0.5 },
]);

/** @type {ReadonlyArray<TransformDef>} */
export const TRANSFORMS = Object.freeze([
  {
    id: 'boxcox', nameKey: 'tfBoxCox', descKey: 'tfBoxCoxDesc',
    params: [{ key: 'lambda', labelKey: 'paramLambda', default: 0, min: -5, max: 5, step: 0.1 }],
  },
  {
    id: 'yeojohnson', nameKey: 'tfYeoJohnson', descKey: 'tfYeoJohnsonDesc',
    params: [{ key: 'lambda', labelKey: 'paramLambda', default: 1, min: -5, max: 5, step: 0.1 }],
  },
  { id: 'johnson_su', nameKey: 'tfJohnsonSU', descKey: 'tfJohnsonSUDesc', params: [...JOHNSON_PARAMS] },
  { id: 'johnson_sb', nameKey: 'tfJohnsonSB', descKey: 'tfJohnsonSBDesc', params: [...JOHNSON_PARAMS] },
  { id: 'log', nameKey: 'tfLog', descKey: 'tfLogDesc', params: [] },
  { id: 'log10', nameKey: 'tfLog10', descKey: 'tfLog10Desc', params: [] },
  { id: 'sqrt', nameKey: 'tfSqrt', descKey: 'tfSqrtDesc', params: [] },
  { id: 'inverse', nameKey: 'tfInverse', descKey: 'tfInverseDesc', params: [] },
  { id: 'square', nameKey: 'tfSquare', descKey: 'tfSquareDesc', params: [] },
]);

/** Alle Kennungen in Registerreihenfolge. */
export const TRANSFORM_IDS = Object.freeze(TRANSFORMS.map((t) => t.id));

/** Kennungen der Transformationen mit geschätztem λ. */
export const LAMBDA_TRANSFORMS = Object.freeze(['boxcox', 'yeojohnson']);

/**
 * Die Parameter je Transformation mit Parametern: Vorgabe und Bereich wie im
 * Register; λ von Box-Cox und Yeo-Johnson ist nullbar (leer heißt geschätzt).
 */
export const PARAMS_SHAPE = Object.freeze({
  boxcox: object({
    lambda: number({ nullable: true, default: null, min: -5, max: 5 }),
  }),
  yeojohnson: object({
    lambda: number({ nullable: true, default: null, min: -5, max: 5 }),
  }),
  johnson_su: object({
    gamma: number({ default: 0, min: -5, max: 5 }),
    delta: number({ default: 1, min: 0.1, max: 10 }),
    xi: number({ default: 0, min: -100, max: 100 }),
    lambdaJ: number({ default: 1, min: 0.1, max: 100 }),
  }),
  johnson_sb: object({
    gamma: number({ default: 0, min: -5, max: 5 }),
    delta: number({ default: 1, min: 0.1, max: 10 }),
    xi: number({ default: 0, min: -100, max: 100 }),
    lambdaJ: number({ default: 1, min: 0.1, max: 100 }),
  }),
});

/**
 * Die Definition einer Transformation.
 * @param {string} id @returns {TransformDef|undefined}
 */
export function transformOf(id) {
  return TRANSFORMS.find((t) => t.id === id);
}

/**
 * Box-Cox eines Werts.
 * @param {number} x @param {number} lam @returns {number}
 */
function boxCox(x, lam) {
  return Math.abs(lam) < 1e-8 ? Math.log(x) : (Math.pow(x, lam) - 1) / lam;
}

/**
 * Yeo-Johnson eines Werts.
 * @param {number} x @param {number} lam @returns {number}
 */
function yeoJohnson(x, lam) {
  if (x >= 0) return Math.abs(lam) < 1e-8 ? Math.log(x + 1) : (Math.pow(x + 1, lam) - 1) / lam;
  return Math.abs(lam - 2) < 1e-8 ? -Math.log(-x + 1) : -(Math.pow(-x + 1, 2 - lam) - 1) / (2 - lam);
}

/**
 * Eine Transformation auf eine Reihe anwenden. Daten außerhalb des
 * Definitionsbereichs werfen einen Fehler, dessen Meldung ein Textschlüssel
 * ist (`errBoxCoxPositive`, `errLogPositive`, …).
 * @param {ReadonlyArray<number>} data
 * @param {string} tfId
 * @param {(key: string) => number} paramFn liefert einen Parameter als Zahl
 * @returns {number[]}
 */
export function applyTransform(data, tfId, paramFn) {
  const lam = paramFn('lambda');
  switch (tfId) {
    case 'boxcox':
      if (data.some((x) => x <= 0)) throw new Error('errBoxCoxPositive');
      return data.map((x) => boxCox(x, lam));
    case 'yeojohnson':
      return data.map((x) => yeoJohnson(x, lam));
    case 'johnson_su': {
      const g = paramFn('gamma'), d = paramFn('delta'), xi = paramFn('xi'), la = paramFn('lambdaJ');
      return data.map((x) => g + d * Math.asinh((x - xi) / la));
    }
    case 'johnson_sb': {
      const g = paramFn('gamma'), d = paramFn('delta'), xi = paramFn('xi'), la = paramFn('lambdaJ');
      return data.map((x) => {
        const z = (x - xi) / la;
        if (z <= 0 || z >= 1) throw new Error('errJohnsonSBRange');
        return g + d * Math.log(z / (1 - z));
      });
    }
    case 'log':
      if (data.some((x) => x <= 0)) throw new Error('errLogPositive');
      return data.map((x) => Math.log(x));
    case 'log10':
      if (data.some((x) => x <= 0)) throw new Error('errLog10Positive');
      return data.map((x) => Math.log10(x));
    case 'sqrt':
      if (data.some((x) => x < 0)) throw new Error('errSqrtNonNeg');
      return data.map((x) => Math.sqrt(x));
    case 'inverse':
      if (data.some((x) => x === 0)) throw new Error('errInverseZero');
      return data.map((x) => 1 / x);
    case 'square':
      return data.map((x) => x * x);
    default:
      throw new Error('Unknown transform');
  }
}

/**
 * λ mit dem kleinsten korrigierten Anderson-Darling-A² im Raster −3…3
 * (Schritt 0,05), auf 0,01 gerundet; 1 ohne gültigen Rasterpunkt.
 * @param {ReadonlyArray<number>} data @param {(x: number, l: number) => number} fn
 * @returns {number}
 */
function gridLambda(data, fn) {
  let bestLam = 1, bestAD = Infinity;
  for (let l = -3; l <= 3; l += 0.05) {
    const t = data.map((x) => fn(x, l));
    try {
      const ad = andersonDarling(t);
      if (ad.statisticAdj < bestAD) { bestAD = ad.statisticAdj; bestLam = l; }
    } catch { /* ungültiger Rasterpunkt */ }
  }
  return Math.round(bestLam * 100) / 100;
}

/**
 * Das geschätzte λ von Box-Cox; 1, wenn ein Wert ≤ 0 ist.
 * @param {ReadonlyArray<number>} data @returns {number}
 */
export function optimizeBoxCox(data) {
  if (data.some((x) => x <= 0)) return 1;
  return gridLambda(data, boxCox);
}

/**
 * Das geschätzte λ von Yeo-Johnson.
 * @param {ReadonlyArray<number>} data @returns {number}
 */
export function optimizeYeoJohnson(data) {
  return gridLambda(data, yeoJohnson);
}
