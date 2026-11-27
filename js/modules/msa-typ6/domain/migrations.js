/**
 * D.Mike — MSA Typ 6: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen festen Formatstand und importiert
 * darum nichts aus model.js.
 */
import { roundTo } from '../../../core/number-format.js';

/**
 * Wert einer festen Liste, sonst die Vorgabe.
 * @param {unknown} v @param {string[]} allowed @param {string} fallback
 * @returns {string}
 */
function pick(v, allowed, fallback) {
  return typeof v === 'string' && allowed.includes(v) ? v : fallback;
}

/**
 * Endliche Zahl wie die Altform (`Number(v)`; leer und `null` gelten nicht),
 * sonst `null`.
 * @param {unknown} v @returns {number|null}
 */
function finiteOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Basis-Untergruppen: positive Ganzzahl (`Number(v)`), sonst 20.
 * @param {unknown} v @returns {number}
 */
function baselineKFrom(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 20;
}

/**
 * Regelauswahl: kein Array → 1–6; sonst die gültigen Regeln (Texte über
 * `Number`), ohne Doppelte, aufsteigend; `[]` bleibt `[]`.
 * @param {unknown} v @returns {number[]}
 */
function rulesFrom(v) {
  if (!Array.isArray(v)) return [1, 2, 3, 4, 5, 6];
  const ids = [...new Set(v.map((r) => Number(r)).filter((r) => [1, 2, 3, 4, 5, 6, 7, 8].includes(r)))];
  return ids.sort((a, b) => a - b);
}

/**
 * α: Zahl auf zwei Stellen gerundet, Text wörtlich; gilt nur
 * '0.01', '0.05' oder '0.10', sonst 0,05.
 * @param {unknown} v @returns {number}
 */
function alphaFrom(v) {
  if (v == null) return 0.05;
  const n = typeof v === 'number' ? roundTo(v, 2) : ({ '0.01': 0.01, '0.05': 0.05, '0.10': 0.1 })[String(v)];
  return [0.01, 0.05, 0.1].includes(n) ? n : 0.05;
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
 * '0→1.0': Altform ohne `_schema`, genau wie das alte `State.fromJSON`.
 * `sourceTyp1InstanceId` wandert aus `params` nach oben; α wird Zahl.
 * Alles andere entfällt.
 * @param {Record<string, any>} json Kopie des gespeicherten Zustands
 * @returns {Record<string, any>} Zustand im Formatstand 1.0
 */
export function from0(json) {
  const p = json.params && typeof json.params === 'object' ? json.params : {};
  const c = json.columns && typeof json.columns === 'object' ? json.columns : {};
  return {
    params: {
      measurementName: typeof p.measurementName === 'string' ? p.measurementName : '',
      unit: typeof p.unit === 'string' && p.unit ? p.unit : 'mm',
      chartType: pick(p.chartType, ['i-mr', 'xbar-r'], 'i-mr'),
      limitsMode: pick(p.limitsMode, ['from-study', 'given'], 'from-study'),
      baselineK: baselineKFrom(p.baselineK),
      mu0: finiteOrNull(p.mu0),
      sigma0: finiteOrNull(p.sigma0),
      enabledRules: rulesFrom(p.enabledRules),
      alpha: alphaFrom(p.alpha),
    },
    columns: {
      timestamp: refFrom(c.timestamp),
      value: refFrom(c.value),
      subgroup: refFrom(c.subgroup),
    },
    sourceTyp1InstanceId: typeof p.sourceTyp1InstanceId === 'string' ? p.sourceTyp1InstanceId : null,
    exampleWorksheetId: typeof json.exampleWorksheetId === 'string' ? json.exampleWorksheetId : null,
  };
}
