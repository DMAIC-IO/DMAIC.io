/**
 * D.Mike — MSA Typ 4: Migrationen des gespeicherten Zustands.
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
 * Wert einer Textauswahl: gilt, wenn seine Textform in der Liste steht.
 * @param {unknown} v
 * @param {string[]} options
 * @param {string} fallback
 * @returns {string}
 */
function optionFrom(v, options, fallback) {
  const s = v == null ? '' : String(v);
  return options.includes(s) ? s : fallback;
}

/**
 * α aus Zahl oder Text: trifft der Wert eine der Stufen 0,01, 0,05 oder 0,1
 * (auf 1e-9), gilt die Stufe, sonst 0,05. Text wie „0.10“ oder „0,1“ zählt.
 * @param {unknown} v
 * @returns {number}
 */
function alphaFrom(v) {
  const n = numFrom(v);
  if (n === null) return 0.05;
  return [0.01, 0.05, 0.1].find((o) => Math.abs(n - o) < 1e-9) ?? 0.05;
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
 * '0→1.0': Altform ohne `_schema`. Grenzen und σP als Text (alt auch Zahlen
 * und `NaN`) werden Zahlen bzw. `null`; α wird eine der drei Stufen (sonst
 * 0,05); Norm und Bezugsstreuung gelten nur aus ihrer Liste; eine leere oder
 * fehlende Einheit wird „mm“. Alles andere entfällt.
 * @param {Record<string, any>} json Kopie des gespeicherten Zustands
 * @returns {Record<string, any>} Zustand im Formatstand 1.0
 */
export function from0(json) {
  const p = json.params && typeof json.params === 'object' ? json.params : {};
  const tol = p.tolerance && typeof p.tolerance === 'object' ? p.tolerance : {};
  return {
    params: {
      name: typeof p.name === 'string' ? p.name : '',
      unit: typeof p.unit === 'string' && p.unit ? p.unit : 'mm',
      norm: optionFrom(p.norm, ['AIAG', 'VDA5'], 'AIAG'),
      pvMode: optionFrom(p.pvMode, ['tolerance', 'sixSigma'], 'tolerance'),
      tolerance: { LSL: numFrom(tol.LSL), USL: numFrom(tol.USL) },
      sigmaP: numFrom(p.sigmaP),
      alpha: alphaFrom(p.alpha),
    },
    refColumn: refFrom(json.refColumn),
    measColumn: refFrom(json.measColumn),
    exampleWorksheetId: typeof json.exampleWorksheetId === 'string' ? json.exampleWorksheetId : null,
  };
}
