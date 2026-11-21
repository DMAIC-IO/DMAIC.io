/**
 * D.Mike — Process Capability: Spaltenfilter. Rein.
 *
 * Der Filter der ID-Spalte steht an einer Stelle, Picker und Ableitung der
 * wählbaren Spalten nutzen ihn gemeinsam.
 */
/**
 * @typedef {{ instanceId: string, sheetId: string, columnId: string }} ColumnRef
 */

/**
 * Darf `col` die ID-Spalte zur Messspalte `valueRef` sein? Ja, wenn sie auf
 * demselben Blatt liegt und eine andere Spalte ist.
 * @param {ColumnRef|null} valueRef
 * @param {{ instanceId: string, sheetId: string, columnId: string }} col
 * @returns {boolean}
 */
export function subgroupAllowed(valueRef, col) {
  return Boolean(valueRef)
    && col.instanceId === valueRef.instanceId
    && col.sheetId === valueRef.sheetId
    && col.columnId !== valueRef.columnId;
}
