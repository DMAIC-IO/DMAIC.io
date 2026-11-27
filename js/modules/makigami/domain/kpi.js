/**
 * D.Mike — Makigami: Kennzahlen und unlesbare Dauertexte.
 *
 * `analyze(m)` rechnet beides in einem Durchgang und merkt sich das Ergebnis
 * je Model, solange Dauertexte und Einheiten gleich bleiben. `derived` und
 * die Markierung der Felder lesen dasselbe Ergebnis.
 */
import { parseDuration } from './duration.js';

/**
 * Die Kennzahlen des Prozesses, alle Zeiten in Sekunden.
 *
 * @typedef {object} MakigamiKpi
 * @property {number} process  Summe der lesbaren Bearbeitungszeiten in Sekunden
 * @property {number} wait  Summe der lesbaren Wartezeiten in Sekunden
 * @property {number} lead  Lead Time: Bearbeitung plus Warten, in Sekunden
 * @property {number|null} pce  Prozess-Zykluseffizienz als Anteil 0–1; null ohne Lead Time
 */

/**
 * Ein nicht lesbarer Dauertext.
 *
 * @typedef {object} TimeIssue
 * @property {string} stepId  id des Schritts
 * @property {'processTime'|'waitTime'} field  welches Zeitfeld
 */

/**
 * @typedef {{ steps: ReadonlyArray<{ id: string, processTime: string, waitTime: string }>,
 *   timeUnits: ReadonlyArray<{ label: string, factorSeconds: number }> }} KpiInput
 */

/** @typedef {{ kpi: MakigamiKpi, invalid: TimeIssue[] }} Analysis */

/** Model → { sig, result } des letzten Aufrufs. @type {WeakMap<object, { sig: string, result: Analysis }>} */
const memo = new WeakMap();

/** Zahl der Rechenläufe (für Tests des Merkers). */
let runs = 0;

/** @returns {number} Rechenläufe seit dem Laden */
export function analysisRuns() { return runs; }

/** @type {ReadonlyArray<'processTime'|'waitTime'>} */
const TIME_FIELDS = Object.freeze(['processTime', 'waitTime']);

/**
 * Kennzahlen und unlesbare Dauertexte; gleiche Eingaben liefern dasselbe
 * Objekt. Unlesbare Texte zählen nicht mit.
 * @param {KpiInput} m
 * @returns {Analysis}
 */
export function analyze(m) {
  const sig = JSON.stringify([
    m.steps.map((s) => [s.id, s.processTime, s.waitTime]),
    m.timeUnits.map((u) => [u.label, u.factorSeconds]),
  ]);
  const hit = memo.get(m);
  if (hit && hit.sig === sig) return hit.result;
  runs += 1;
  let process = 0;
  let wait = 0;
  /** @type {TimeIssue[]} */
  const invalid = [];
  for (const s of m.steps) {
    for (const field of TIME_FIELDS) {
      const r = parseDuration(s[field], m.timeUnits);
      if (!r.valid) invalid.push({ stepId: s.id, field });
      else if (field === 'processTime') process += r.seconds;
      else wait += r.seconds;
    }
  }
  const lead = process + wait;
  const result = { kpi: { process, wait, lead, pce: lead > 0 ? process / lead : null }, invalid };
  memo.set(m, { sig, result });
  return result;
}
