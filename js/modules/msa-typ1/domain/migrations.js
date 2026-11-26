/**
 * D.Mike — MSA Typ 1: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen festen Formatstand und importiert
 * darum nichts aus model.js.
 */
import { parseDecimalInput } from '../../../core/parse-decimal.js';

/**
 * Zahl eines alten Parameters: Zahl bleibt, lesbarer Text (Dezimalkomma,
 * Tausenderpunkt) wird Zahl; leer, `NaN` und Unlesbares werden `null`.
 * @param {unknown} v
 * @returns {number|null}
 */
function numFrom(v) {
  const n = parseDecimalInput(/** @type {any} */ (v));
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/**
 * Wert einer Auswahlliste: gilt, wenn seine Textform in der Liste steht.
 * @param {unknown} v
 * @param {number[]} options
 * @param {number} fallback
 * @returns {number}
 */
function optionFrom(v, options, fallback) {
  const s = v == null ? '' : String(v);
  return options.find((o) => String(o) === s) ?? fallback;
}

/**
 * Spaltenbezug aus persistiertem JSON, oder null.
 * @param {any} d
 * @returns {{ instanceId: string, sheetId: string, columnId: string }|null}
 */
function refFrom(d) {
  if (!d || typeof d !== 'object') return null;
  if (d.instanceId == null || d.sheetId == null || d.columnId == null) return null;
  return { instanceId: String(d.instanceId), sheetId: String(d.sheetId), columnId: String(d.columnId) };
}

/**
 * '0→1.0': Altform ohne `_schema`. `params` mit Texten (alt auch Zahlen und
 * `NaN`) wird zu Zahlen bzw. `null`; k₁/k₂ gelten nur aus ihrer Liste, sonst
 * 0,2 bzw. 3; eine leere oder fehlende Einheit wird „mm“. Alles andere
 * (`lastResult`, Schlüssel früherer Formen) entfällt.
 * @param {Record<string, any>} json Kopie des gespeicherten Zustands
 * @returns {Record<string, any>} Zustand im Formatstand 1.0
 */
export function from0(json) {
  const p = json.params && typeof json.params === 'object' ? json.params : {};
  return {
    params: {
      name: typeof p.name === 'string' ? p.name : '',
      unit: typeof p.unit === 'string' && p.unit ? p.unit : 'mm',
      ref: numFrom(p.ref),
      lsl: numFrom(p.lsl),
      usl: numFrom(p.usl),
      k1: optionFrom(p.k1, [0.2, 0.15, 0.1], 0.2),
      k2: optionFrom(p.k2, [3, 4, 6], 3),
    },
    columnRef: refFrom(json.columnRef),
    exampleWorksheetId: typeof json.exampleWorksheetId === 'string' ? json.exampleWorksheetId : null,
  };
}
