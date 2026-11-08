/**
 * D.Mike — Diagramm-Vorschlag: Beispielformen. Rein.
 */
import { refsFromSelection } from '../domain/migrations.js';

/**
 * Beispiel in die eigene Form übersetzen: `selection` wird zu `columns`
 * (Spaltenbezüge), `selectedChartType` zu `pick`. Daten mit `columns` bleiben.
 * @param {Record<string, any>} data
 * @param {{ id?: string }} [meta]
 * @returns {Record<string, any>}
 */
export function fromExample(data, meta) {
  void meta;
  if (Array.isArray(data.columns)) return data;
  const { selection, selectedChartType, ...rest } = data;
  return {
    ...rest,
    columns: refsFromSelection(selection),
    pick: typeof selectedChartType === 'string' ? selectedChartType : null,
  };
}
