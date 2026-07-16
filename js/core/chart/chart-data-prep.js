/**
 * D.Mike — Shared Chart Data Prep (chart-data-prep.js)
 *
 * Reusable, byte-faithful building blocks shared by category-aggregation chart
 * models (currently Bar and Pareto). Pure functions — NO view logic, NO i18n,
 * NO chartManager / DOM access. Each consuming model keeps its own bespoke
 * projection (Pass 3) and config handling; only the genuinely-identical pieces
 * live here:
 *
 *   - PALETTE        — the 12-color series palette (mirrors the legacy palette 1:1)
 *   - refFromJSON    — clone-or-null for a worksheet column reference
 *   - cleanCat       — category coercion (null/'' → '' else String)
 *   - toNum          — numeric coercion (parseFloat, NaN for empty/invalid)
 *   - crossTabMatrix — the legacy three-pass cross-tab Pass-1 (level discovery)
 *                      + Pass-2 (matrix[x][g] = { sum, count } fill)
 *   - columnRefFromJSON — strict {instanceId,sheetId,columnId} validator shared
 *                      by the scatter-style plot models (Probability-Plot, XY-Plot)
 */

/** Bar / stack colors — mirrors the legacy PALETTE 1:1. */
export const PALETTE = [
  'rgba(44,95,138,1)', 'rgba(39,174,96,1)', 'rgba(231,76,60,1)',
  'rgba(243,156,18,1)', 'rgba(142,68,173,1)', 'rgba(52,152,219,1)',
  'rgba(230,126,34,1)', 'rgba(26,188,156,1)', 'rgba(241,196,15,1)',
  'rgba(192,57,43,1)', 'rgba(44,62,80,1)', 'rgba(127,140,141,1)',
];

/** Restore a worksheet column reference verbatim (clone), or null. */
export function refFromJSON(d) {
  return d && typeof d === 'object' ? { ...d } : null;
}

/** Mirror legacy `cleanCat`: null/'' → '' else String(v). */
export function cleanCat(v) {
  return v == null || v === '' ? '' : String(v);
}

/** Mirror legacy `toNum`: parseFloat, NaN for empty/invalid. */
export function toNum(v) {
  if (v == null || v === '') return NaN;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Validate and coerce a strict column reference object.
 * @param {*} d
 * @returns {{ instanceId: string, sheetId: string, columnId: string }|null}
 */
export function columnRefFromJSON(d) {
  if (!d || typeof d !== 'object') return null;
  if (d.instanceId == null || d.sheetId == null || d.columnId == null) return null;
  return {
    instanceId: String(d.instanceId),
    sheetId: String(d.sheetId),
    columnId: String(d.columnId),
  };
}

/**
 * Legacy three-pass cross-tab: Pass 1 (discover ordered X / G levels) and
 * Pass 2 (aggregate into matrix[x][g] = { sum, count }). The per-model
 * projection (Pass 3) stays in the model.
 *
 * Returns `null` when there is no X column, no values, or no non-blank X-level
 * — callers map that to their own empty shape. When non-null, `groupNames` is
 * the discovered G levels (first-seen order) or `['__single__']` when no G
 * column is selected.
 *
 * @param {(ref:object|null)=>any[]|null} getValues - raw values for a column ref
 * @param {{xRef:object|null, yRef:object|null, gRef:object|null}} refs
 * @returns {{xLevels:string[], groupNames:string[], matrix:Object}|null}
 */
export function crossTabMatrix(getValues, { xRef, yRef, gRef }) {
  if (!xRef) return null;

  const xVals = getValues(xRef);
  if (!xVals || xVals.length === 0) return null;

  const yVals = yRef ? getValues(yRef) : null;
  const gVals = gRef ? getValues(gRef) : null;

  // ── Pass 1: discover ordered category levels (X) and group levels (G).
  const xLevels = [];
  const xSeen = new Set();
  const gLevels = [];
  const gSeen = new Set();
  const n = Math.min(
    xVals.length,
    yVals ? yVals.length : Infinity,
    gVals ? gVals.length : Infinity,
  );

  for (let i = 0; i < n; i++) {
    const xc = cleanCat(xVals[i]);
    if (xc === '') continue;
    if (!xSeen.has(xc)) { xSeen.add(xc); xLevels.push(xc); }
    if (gVals) {
      const gc = cleanCat(gVals[i]);
      if (gc === '' || gSeen.has(gc)) continue;
      gSeen.add(gc); gLevels.push(gc);
    }
  }
  if (xLevels.length === 0) return null;

  // ── Pass 2: aggregate values into matrix[x][g] { sum, count }.
  const groupNames = gVals ? gLevels : ['__single__'];
  const matrix = {};
  for (const x of xLevels) {
    matrix[x] = {};
    for (const g of groupNames) matrix[x][g] = { sum: 0, count: 0 };
  }

  for (let i = 0; i < n; i++) {
    const x = cleanCat(xVals[i]);
    if (x === '' || !matrix[x]) continue;
    const g = gVals ? cleanCat(gVals[i]) : '__single__';
    if (g === '' || !matrix[x][g]) continue;
    if (yVals) {
      const y = toNum(yVals[i]);
      if (!Number.isFinite(y)) continue;
      matrix[x][g].sum += y;
      matrix[x][g].count += 1;
    } else {
      matrix[x][g].count += 1;
    }
  }

  return { xLevels, groupNames, matrix };
}
