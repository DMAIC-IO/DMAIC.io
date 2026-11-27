/**
 * D.Mike — Datentransformation: die Rechnung.
 *
 * Reine Funktionen über die Werte der Quellspalte und den gespeicherten
 * Stand. Die wirksame Transformation weicht nur beim Rückfall ab: Box-Cox mit
 * einem Wert ≤ 0 rechnet mit Yeo-Johnson. Ein leeres λ wird für die Werte
 * geschätzt. `analyze` liefert das Ergebnis samt transformierter Reihe;
 * Daten außerhalb des Definitionsbereichs werfen einen Fehler mit einem
 * Textschlüssel als Meldung.
 */
import { mean, std, median, skewness, kurtosis } from '../../../engines/distribution-fit-engine.js';
import { andersonDarling } from '../../../engines/normality-test-engine.js';
import { transformOf, applyTransform, optimizeBoxCox, optimizeYeoJohnson } from './transforms.js';

/** Signifikanzniveau des Normalitätsurteils. */
export const ALPHA = 0.05;

/** Mindestzahl der Werte für eine Rechnung. */
export const MIN_VALUES = 3;

/**
 * Kennwerte einer Reihe.
 *
 * @typedef {object} Descriptives
 * @property {number|null} mean  Mittelwert
 * @property {number|null} std  Standardabweichung
 * @property {number|null} median  Median
 * @property {number|null} skewness  Schiefe
 * @property {number|null} kurtosis  Exzess-Wölbung
 * @property {number|null} min  Minimum
 * @property {number|null} max  Maximum
 * @property {number|null} adStatAdj  korrigiertes A² (A²*) Anderson-Darling
 * @property {number|null} adPValue  p-Wert Anderson-Darling
 * @property {boolean|null} normal  Urteil: normal, wenn der p-Wert mindestens α ist
 */

/**
 * Das Ergebnis einer Rechnung.
 *
 * @typedef {object} Result
 * @property {number} n  Werte
 * @property {string} transform  wirksame Transformation
 * @property {Record<string, number>} params  wirksame Parameter dieser Rechnung (geschätztes λ als Zahl)
 * @property {Descriptives} original  Kennwerte vorher
 * @property {Descriptives} transformed  Kennwerte nachher
 */

/**
 * Die wirksame Transformation: Box-Cox mit mindestens drei Werten, von denen
 * einer ≤ 0 ist, rechnet mit Yeo-Johnson; sonst die gewählte.
 * @param {string} tf gewählte Transformation @param {ReadonlyArray<number>} values
 * @returns {string}
 */
export function effectiveTransform(tf, values) {
  return tf === 'boxcox' && values.length >= MIN_VALUES && values.some((x) => x <= 0) ? 'yeojohnson' : tf;
}

/**
 * Das wirksame λ einer λ-Transformation: der gespeicherte Wert oder, wenn er
 * leer ist, die Schätzung für die Werte (ohne genug Werte die Vorgabe des
 * Registers).
 * @param {string} tf `boxcox` oder `yeojohnson` @param {number|null} stored
 * @param {ReadonlyArray<number>} values @returns {number}
 */
export function effectiveLambda(tf, stored, values) {
  if (stored !== null && stored !== undefined) return stored;
  if (values.length < MIN_VALUES) return transformOf(tf)?.params[0]?.default ?? 1;
  return tf === 'boxcox' ? optimizeBoxCox(values) : optimizeYeoJohnson(values);
}

/**
 * Die wirksamen Parameter einer Transformation als Zahlen; leer bei
 * Transformationen ohne Parameter.
 * @param {Record<string, Record<string, number|null>>} params gespeicherte Parameter je Transformation
 * @param {string} tf wirksame Transformation @param {ReadonlyArray<number>} values
 * @returns {Record<string, number>}
 */
export function effectiveParams(params, tf, values) {
  const own = params[tf];
  if (!own) return {};
  /** @type {Record<string, number>} */
  const out = {};
  for (const [k, v] of Object.entries(own)) {
    out[k] = k === 'lambda' ? effectiveLambda(tf, v, values) : /** @type {number} */ (v);
  }
  return out;
}

/** @param {number} v @returns {number|null} */
const finite = (v) => (Number.isFinite(v) ? v : null);

/**
 * Kennwerte und Anderson-Darling einer Reihe.
 * @param {ReadonlyArray<number>} arr @returns {Descriptives}
 */
export function describe(arr) {
  /** @type {{ statisticAdj: number, pValue: number }|null} */
  let ad;
  try { ad = andersonDarling([...arr]); } catch { ad = null; }
  const a = [...arr];
  return {
    mean: finite(mean(a)),
    std: finite(std(a)),
    median: finite(median(a)),
    skewness: finite(skewness(a)),
    kurtosis: finite(kurtosis(a)),
    min: finite(Math.min(...a)),
    max: finite(Math.max(...a)),
    adStatAdj: ad ? finite(ad.statisticAdj) : null,
    adPValue: ad ? finite(ad.pValue) : null,
    normal: ad ? ad.pValue >= ALPHA : null,
  };
}

/**
 * Die Rechnung: wirksame Transformation und Parameter, transformierte Reihe
 * und Kennwerte beider Reihen. `null` unter drei Werten. Wirft einen Fehler
 * mit einem Textschlüssel als Meldung, wenn die Daten nicht passen.
 * @param {ReadonlyArray<number>} values die Zahlen der Quellspalte
 * @param {{ currentTF: string, params: Record<string, Record<string, number|null>> }} m
 * @returns {{ result: Result, transformed: number[] }|null}
 */
export function analyze(values, m) {
  if (values.length < MIN_VALUES) return null;
  const transform = effectiveTransform(m.currentTF, values);
  const params = effectiveParams(m.params, transform, values);
  const transformed = applyTransform(values, transform, (k) => params[k] ?? 0);
  return {
    result: { n: values.length, transform, params, original: describe(values), transformed: describe(transformed) },
    transformed,
  };
}
