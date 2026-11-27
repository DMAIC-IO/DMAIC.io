/**
 * D.Mike — Zielgrößenoptimierung: das Optimum und die Wirkungsfläche. Rein.
 *
 * `optimize` ist die Rechnung der Altform (`optimizeAndStore` ohne das
 * Speichern): Faktorgrenzen aus dem ersten Modell (ohne Angabe −1 bis 1),
 * Nelder-Mead von 8 Starts mit Startwert 42 und höchstens 400 Iterationen.
 * `contourOf` baut die Fläche des ersten Modells über zwei stetige Faktoren
 * (Altform `_computeContour`); die übrigen stehen auf den Festwerten.
 */
import { optimizeResponses, buildResponseSurface } from '../../../engines/response-optimization-engine.js';

/** Rasterpunkte je Achse der Wirkungsfläche (wie die Altform). */
export const CONTOUR_GRID = 28;

/**
 * @typedef {import('./models.js').ModelRecord} ModelRecord
 * @typedef {import('./models.js').SpecEntry} SpecEntry
 * @typedef {{ xOpt: Array<number|string|null>, yPredictions: Array<number|null>, dPerResponse: Array<number|null>,
 *   D: number, factorNames: string[], modelNames: string[], iter: number }} OptResult
 */

/**
 * Die gewählten Modelle gemeinsam optimieren. Wirft, wenn die Engine scheitert.
 * @param {ModelRecord[]} models in Optimierungsreihenfolge, mindestens eines
 * @param {Record<string, SpecEntry>} specs wirksame Vorgaben je Modell-id
 * @returns {{ modelRefs: string[], result: OptResult }}
 */
export function optimize(models, specs) {
  if (models.length === 0) throw new Error('optimize needs at least one model');
  const desirSpecs = models.map((m) => {
    const s = specs[m.id];
    return { kind: s.kind, lower: s.lower, upper: s.upper, target: s.target, weight: s.weight ?? 1 };
  });
  const factorSpec = /** @type {Array<{ name: string, low?: number|null, high?: number|null }>} */ (models[0].factorSpec ?? []);
  /** @type {Array<[number, number]>} */
  const factorBounds = factorSpec.map((f) => [f.low ?? -1, f.high ?? 1]);
  const factorNames = factorSpec.map((f) => f.name);
  const r = optimizeResponses(models, desirSpecs, factorBounds, { nStarts: 8, seed: 42, maxIter: 400 });
  return {
    modelRefs: models.map((m) => m.id),
    result: {
      xOpt: [...r.xOpt],
      yPredictions: [...r.yPredictions],
      dPerResponse: [...r.dPerResponse],
      D: r.D,
      factorNames,
      modelNames: models.map((m) => m.name),
      iter: r.iter,
    },
  };
}

/**
 * @typedef {{ id: string, levels: string[], value: string }} ContourFixing
 * @typedef {{
 *   continuous: string[], xId: string, yId: string, fixings: ContourFixing[],
 *   grid: Array<Array<number|null>>, xRange: [number, number], yRange: [number, number],
 *   point: { x: number, y: number, z: number }|null,
 * }} Contour
 */

/**
 * Die Wirkungsfläche des ersten Modells eines Ergebnisses; `null` ohne
 * Spezifikation, mit weniger als zwei stetigen Faktoren oder wenn die Fläche
 * nicht rechenbar ist. Das Raster hat Zeile 0 oben. Das Optimum ist ein Punkt,
 * wenn die kategorialen Festwerte zu ihm passen und es in der Fläche liegt.
 * @param {ModelRecord|null|undefined} record
 * @param {OptResult} result
 * @param {{ xId?: string|null, yId?: string|null, fixings?: Record<string, string> }} [choice] Achsen und Festwerte der Ansicht
 * @returns {Contour|null}
 */
export function contourOf(record, result, choice = {}) {
  const predictors = /** @type {Array<{ id: string, kind: string, levels?: string[], reference?: string }>} */ (record?.spec?.predictors ?? []);
  if (!record?.spec) return null;
  const continuous = predictors.filter((p) => p.kind === 'continuous').map((p) => p.id);
  const categorical = predictors.filter((p) => p.kind === 'categorical');
  if (continuous.length < 2) return null;
  const xId = choice.xId && continuous.includes(choice.xId) ? choice.xId : continuous[0];
  const yId = choice.yId && continuous.includes(choice.yId) ? choice.yId : continuous[1];
  const xOpt = result?.xOpt ?? [];
  const idx = (/** @type {string} */ id) => predictors.findIndex((q) => q.id === id);
  /** @type {Record<string, string>} */
  const fixed = {};
  for (const p of categorical) {
    const levels = p.levels ?? [];
    const fromUi = choice.fixings?.[p.id];
    const optVal = xOpt[idx(p.id)];
    fixed[p.id] = fromUi != null && levels.includes(fromUi) ? fromUi
      : typeof optVal === 'string' ? optVal : (p.reference ?? levels[0] ?? '');
  }
  let surface;
  try {
    surface = buildResponseSurface(record, { xId, yId, fixings: fixed, gridSize: CONTOUR_GRID });
  } catch {
    return null;
  }
  const matches = categorical.every((p) => xOpt[idx(p.id)] === fixed[p.id]);
  const xv = xOpt[idx(xId)];
  const yv = xOpt[idx(yId)];
  const inside = (/** @type {number} */ v, /** @type {[number, number]} */ [lo, hi]) => (v - lo) * (v - hi) <= 0;
  const z = result?.yPredictions?.[0];
  const point = matches && typeof xv === 'number' && typeof yv === 'number' && inside(xv, surface.xRange) && inside(yv, surface.yRange)
    ? { x: xv, y: yv, z: typeof z === 'number' && Number.isFinite(z) ? z : 0 }
    : null;
  return {
    continuous,
    xId,
    yId,
    fixings: categorical.map((p) => ({ id: p.id, levels: [...(p.levels ?? [])], value: fixed[p.id] })),
    grid: [...surface.grid].reverse().map((row) => row.map((v) => (Number.isFinite(v) ? v : null))),
    xRange: [surface.xRange[0], surface.xRange[1]],
    yRange: [surface.yRange[0], surface.yRange[1]],
    point,
  };
}
