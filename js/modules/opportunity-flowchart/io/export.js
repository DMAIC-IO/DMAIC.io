/**
 * D.Mike — Opportunity-Flowchart: JSON-Export. Reine Funktion; den Download
 * baut das Viewmodel.
 */

/**
 * Schritte mit Unterschritten, ohne Schemakennung und ohne Ansichtszustand.
 * @param {{ toJSON(): { steps: object[] } }} model
 * @returns {{ steps: object[] }}
 */
export function toJsonTree(model) {
  return { steps: JSON.parse(JSON.stringify(model.toJSON().steps)) };
}
