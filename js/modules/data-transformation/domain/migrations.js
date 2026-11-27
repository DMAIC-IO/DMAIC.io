/**
 * D.Mike — Datentransformation: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js oder transforms.js.
 */

/** Kennungen der Transformationen im Formatstand 1.0. */
const TRANSFORM_IDS_1_0 = Object.freeze([
  'boxcox', 'yeojohnson', 'johnson_su', 'johnson_sb', 'log', 'log10', 'sqrt', 'inverse', 'square',
]);

/** Die Johnson-Parameter im Formatstand 1.0 (Vorgaben). */
const JOHNSON_1_0 = Object.freeze({ gamma: 0, delta: 1, xi: 0, lambdaJ: 1 });

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/**
 * Ein Spaltenbezug wie `columnRefFromJSON` der Altform: nur mit allen drei
 * ids, je als Text; fremde Eigenschaften entfallen; sonst `null`.
 * @param {unknown} d @returns {{ instanceId: string, sheetId: string, columnId: string }|null}
 */
function columnRefValue(d) {
  if (!isObject(d)) return null;
  if (d.instanceId == null || d.sheetId == null || d.columnId == null) return null;
  return { instanceId: String(d.instanceId), sheetId: String(d.sheetId), columnId: String(d.columnId) };
}

/**
 * '0→1.0': jeder Stand ohne `_schema` (wie ihn das alte `State.toJSON`
 * schrieb: `currentTF`, `columnRef`, `exampleWorksheetId`). Eine unbekannte
 * Transformation wird `boxcox`; ein gespeichertes `yeojohnson` aus dem alten
 * Rückfall bleibt. Die Altform speicherte keine Parameter: alle bekommen ihre
 * Vorgaben, λ leer (geschätzt). Unbekannte Schlüssel entfallen.
 * @param {unknown} old gespeicherter Zustand ohne `_schema`
 * @returns {object}
 */
export function from0(old) {
  const o = isObject(old) ? old : {};
  return {
    currentTF: TRANSFORM_IDS_1_0.includes(o.currentTF) ? o.currentTF : 'boxcox',
    columnRef: columnRefValue(o.columnRef),
    params: {
      boxcox: { lambda: null },
      yeojohnson: { lambda: null },
      johnson_su: { ...JOHNSON_1_0 },
      johnson_sb: { ...JOHNSON_1_0 },
    },
    exampleWorksheetId: typeof o.exampleWorksheetId === 'string' ? o.exampleWorksheetId : null,
  };
}
