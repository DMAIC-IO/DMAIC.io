/**
 * D.Mike — Zielgrößenoptimierung: Migrationen. Rein.
 *
 * `'0→1.0'` übernimmt die Altform `{ specs, optId }`: jede Vorgabe als ganzer
 * Eintrag wie das alte `SpecEntry.fromJSON` (so fallen Altwerte nicht auf die
 * Saat aus den Modelldaten zurück), dazu die Optimierung `{ modelRefs,
 * result }`, die die Projektmigration aus `state.optimizations[optId]` in den
 * Zustand gelegt hat. `optId` und die immer leeren `ciAtOpt`/`paretoFront`
 * entfallen.
 */

const KINDS = ['max', 'min', 'target'];

/** @param {unknown} v @returns {v is string} */
const isText = (v) => typeof v === 'string';
/** @param {unknown} v @returns {v is Record<string, any>} */
const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
/** @param {unknown} v @returns {v is number} */
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);
/** @param {unknown} v @returns {number|null} */
const numOrNull = (v) => (isFiniteNumber(v) ? v : null);

/**
 * Eine Vorgabe wie das alte `SpecEntry.fromJSON`: ungültige Werte nehmen die
 * Vorgabe, ein fehlender Zielwert die Mitte der Grenzen.
 * @param {unknown} d
 * @returns {{ selected: boolean, kind: string, lower: number, upper: number, target: number, weight: number }}
 */
export function specFromLegacy(d) {
  const e = isObj(d) ? d : {};
  const lower = isFiniteNumber(e.lower) ? e.lower : 0;
  const upper = isFiniteNumber(e.upper) ? e.upper : 1;
  return {
    selected: typeof e.selected === 'boolean' ? e.selected : false,
    kind: KINDS.includes(e.kind) ? e.kind : 'max',
    lower,
    upper,
    target: isFiniteNumber(e.target) ? e.target : (lower + upper) / 2,
    weight: isFiniteNumber(e.weight) && e.weight > 0 ? e.weight : 1,
  };
}

/**
 * Das gespeicherte Optimum ohne die toten Schlüssel; `null`, wenn die Form
 * nicht stimmt.
 * @param {unknown} r
 * @returns {Record<string, any>|null}
 */
function resultOf(r) {
  if (!isObj(r) || !Array.isArray(r.xOpt) || !isFiniteNumber(r.D)) return null;
  const nums = (/** @type {unknown} */ v) => (Array.isArray(v) ? v.map(numOrNull) : []);
  const texts = (/** @type {unknown} */ v) => (Array.isArray(v) ? v.map((x) => (isText(x) ? x : String(x ?? ''))) : []);
  return {
    xOpt: r.xOpt.map((x) => (isFiniteNumber(x) || isText(x) ? x : null)),
    yPredictions: nums(r.yPredictions),
    dPerResponse: nums(r.dPerResponse),
    D: r.D,
    factorNames: texts(r.factorNames),
    modelNames: texts(r.modelNames),
    iter: isFiniteNumber(r.iter) ? r.iter : 0,
  };
}

/**
 * Die Optimierung `{ modelRefs, result }`; `null` ohne gültiges Ergebnis.
 * @param {unknown} v
 * @returns {{ modelRefs: string[], result: Record<string, any> }|null}
 */
export function optimizationFromLegacy(v) {
  if (!isObj(v)) return null;
  const result = resultOf(v.result);
  if (!result) return null;
  return { modelRefs: Array.isArray(v.modelRefs) ? v.modelRefs.filter(isText) : [], result };
}

/**
 * '0→1.0': Altform `{ specs, optId, optimization? }` → Zielform.
 * @param {Record<string, any>} json
 * @returns {Record<string, any>}
 */
export function from0(json) {
  /** @type {Record<string, any>} */
  const specs = {};
  if (isObj(json.specs)) {
    for (const [id, raw] of Object.entries(json.specs)) {
      if (id === '__proto__') continue;
      specs[id] = specFromLegacy(raw);
    }
  }
  return { specs, optimization: optimizationFromLegacy(json.optimization) };
}
