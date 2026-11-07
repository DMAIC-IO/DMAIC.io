/**
 * D.Mike — Worksheet Column Access Core (worksheet-columns.js)
 *
 * The single shared implementation of the "turn a worksheet column reference
 * into data" core that several analysis modules need:
 *
 *   1. resolveColumnRef — resolve a `{instanceId, sheetId, columnId}` ref against
 *      a stateManager to the live column object (or null if any hop is missing).
 *   2. getColumnRawValues — the column's raw cell-value array (or []).
 *   3. coerceNumeric — the plain, type-agnostic cell→number coercion shared by
 *      consumers that just want "a number or nothing" (empty/null/unparseable
 *      → null; numeric strings are parsed). NOTE: this is the *plain* coercion.
 *      Modules with type-aware coercion (e.g. correlation's date/time handling)
 *      keep their own variant — those semantics genuinely differ and are not
 *      forced into this helper.
 *
 * This is the low-level data-access layer that sits *under* the per-module
 * row-filter / alignment logic (correlation's pairwise null-alignment,
 * glm's drop-missing-predictor filter, …). Each module keeps its own filter;
 * only this common core is shared.
 *
 * `column-picker.js`'s `getColumnValues` / `getColumnName` build on this so the
 * worksheet-resolution walk exists in exactly one place.
 */

/**
 * Resolve a column reference to the live worksheet column object.
 * Returns null when the worksheet instance, sheet, or column is missing.
 * @param {object} stateManager
 * @param {{ instanceId: string, sheetId: string, columnId: string }|null} ref
 * @returns {object|null} the column object (`{ id, name, shortName, type, values, … }`) or null
 */
export function resolveColumnRef(stateManager, ref) {
  if (!ref || !stateManager) return null;
  const ws = stateManager.getModuleState(ref.instanceId);
  if (!ws?.sheets) return null;
  const sheet = ws.sheets.find(s => s.id === ref.sheetId);
  if (!sheet?.state?.columns) return null;
  return sheet.state.columns.find(c => c.id === ref.columnId) || null;
}

/**
 * Read the raw cell values of a column reference.
 * @param {object} stateManager
 * @param {{ instanceId: string, sheetId: string, columnId: string }|null} ref
 * @returns {any[]} the column's `values` array, or [] if unresolved/empty
 */
export function getColumnRawValues(stateManager, ref) {
  const col = resolveColumnRef(stateManager, ref);
  return col ? (col.values || []) : [];
}

/**
 * Plain, type-agnostic cell→number coercion.
 * empty / whitespace-only / null / non-finite → null; numeric strings are parsed.
 * @param {*} val
 * @returns {number|null}
 */
export function coerceNumeric(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'number' && !isNaN(val)) return val;
  // Number(' ') is 0 — a blanked cell must not become a measurement.
  if (typeof val === 'string' && val.trim() === '') return null;
  const n = Number(val);
  return isFinite(n) ? n : null;
}

/**
 * Serialize a column reference to a pipe-delimited key.
 * @param {{ instanceId: string, sheetId: string, columnId: string }|null} ref
 * @returns {string}
 */
export function refToKey(ref) {
  return ref ? `${ref.instanceId}|${ref.sheetId}|${ref.columnId}` : '';
}

/**
 * Eine gefundene Spalte als wählbarer Eintrag: Schlüssel (`refToKey`) und Anzeigename.
 * @param {{ instanceId: string, sheetId: string, columnId: string, columnName?: string, shortName?: string }} col
 * @returns {{ key: string, name: string }}
 */
export function columnOption(col) {
  const key = refToKey(col);
  return { key, name: col.columnName || col.shortName || key };
}

/**
 * Alle Arbeitsblattspalten des Projekts, die zum Filter passen.
 * @param {{ get: (path: string) => any, getModuleState: (id: string) => any }} stateManager
 * @param {{ types?: string[]|Set<string>, minCount?: number, maxCount?: number }} [filter]
 * @returns {{ instanceId: string, sheetId: string, sheetName: string, columnId: string,
 *   columnName: string, shortName: string, type: string, valueCount: number }[]}
 */
export function discoverColumns(stateManager, filter) {
  const typeSet = filter?.types
    ? (filter.types instanceof Set ? filter.types : new Set(filter.types))
    : null;
  const minCount = filter?.minCount || 0;
  const maxCount = filter?.maxCount ?? Infinity;
  const columns = [];

  for (const phase of Object.keys(stateManager.get('phases') || {})) {
    const instances = stateManager.get(`phases.${phase}`) ?? [];
    for (const inst of instances) {
      if (inst.moduleId !== 'worksheet') continue;
      const ws = stateManager.getModuleState(inst.instanceId);
      if (!ws?.sheets) continue;
      for (const sheet of ws.sheets) {
        if (!sheet.state?.columns) continue;
        for (const col of sheet.state.columns) {
          if (typeSet && !typeSet.has(col.type)) continue;
          const nonNull = (col.values || []).filter(v => v != null).length;
          if (nonNull < minCount || nonNull > maxCount) continue;
          columns.push({
            instanceId: inst.instanceId,
            sheetId: sheet.id,
            sheetName: sheet.name,
            columnId: col.id,
            columnName: col.name || '',
            shortName: col.shortName || '?',
            type: col.type,
            valueCount: nonNull,
          });
        }
      }
    }
  }
  return columns;
}
