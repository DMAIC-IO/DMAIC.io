/**
 * D.Mike — Diagramm-Vorschlag: Migrationen. Rein.
 */

/**
 * Spaltenbezüge aus einer Auswahl `{ sourceInstanceId, sourceSheetId, columns }`.
 * Ohne Instanz oder Blatt ist die Auswahl leer.
 * @param {unknown} selection
 * @returns {Array<{ instanceId: string, sheetId: string, columnId: string }>}
 */
export function refsFromSelection(selection) {
  const s = /** @type {any} */ (selection);
  if (!s || typeof s !== 'object') return [];
  if (typeof s.sourceInstanceId !== 'string' || !s.sourceInstanceId) return [];
  if (typeof s.sourceSheetId !== 'string' || !s.sourceSheetId) return [];
  if (!Array.isArray(s.columns)) return [];
  const out = [];
  for (const c of s.columns) {
    if (!c || typeof c.id !== 'string' || !c.id) continue;
    out.push({ instanceId: s.sourceInstanceId, sheetId: s.sourceSheetId, columnId: c.id });
  }
  return out;
}

/**
 * '0→1.0': Altstände ohne `_schema` — gespeicherte Altform, Vorbelegung des
 * Arbeitsblatts und Beispiele mit `__source__`.
 * @param {Record<string, any>} json
 * @returns {{ columns: object[], pick: string|null, exampleWorksheetId: string|null }}
 */
export function from0(json) {
  const old = json && typeof json === 'object' ? json : {};
  return {
    columns: refsFromSelection(old.selection),
    pick: typeof old.selectedChartType === 'string' ? old.selectedChartType : null,
    exampleWorksheetId: typeof old.exampleWorksheetId === 'string' ? old.exampleWorksheetId : null,
  };
}
