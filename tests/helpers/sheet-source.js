/**
 * Test-Helfer: ein `Source` über ein lebendes Arbeitsblatt. `sheet` ist ein
 * (ggf. reaktives) Objekt Spalten-Id → Werte; jedes Lesen baut den Stand neu
 * aus ihm, so wirken Änderungen und gelöschte Spalten sofort. Nur für Tests.
 */
import { storedSource } from './stored-source.js';

/**
 * @param {Record<string, any[]>} sheet Spalten-Id → Werte
 * @param {{ instanceId?: string, sheetId?: string, names?: Record<string, string>, types?: Record<string, string> }} [opts]
 *   `types`: Spaltenart je Spalten-Id (sonst `numeric`)
 * @returns {import('../../js/core/source-reader.js').Source}
 */
export function sheetSource(sheet, { instanceId = 'ws1', sheetId = 's1', names = {}, types = {} } = {}) {
  const state = {
    get columns() {
      return Object.keys(sheet).map((id) => ({ id, name: names[id] ?? id, values: sheet[id], ...(types[id] ? { type: types[id] } : {}) }));
    },
  };
  return storedSource({ [instanceId]: { sheets: [{ id: sheetId, name: 'S', state }] } });
}

/**
 * Leser, der außer `read`/`list` jedes Glied mit Wurf meldet.
 * @param {import('../../js/core/source-reader.js').Source} src
 * @returns {import('../../js/core/source-reader.js').Source}
 */
export function spySource(src) {
  return new Proxy({}, { get(_t, k) {
    if (k === 'read') return (...a) => src.read(...a);
    if (k === 'list') return () => src.list();
    throw new Error(`derived greift auf src.${String(k)} zu`);
  } });
}
