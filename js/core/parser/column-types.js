/**
 * Spaltentyp-Erkennung als reine Funktion.
 *
 * Regel: Schwelle 70 %, Vorrang Währung > Prozent > Datum > Uhrzeit > Zahl,
 * Rückfall auf Zahl ab 70 % Zahlenwerten. Nicht passende Werte in
 * Zahlentypen werden `null`.
 */
import {
  detectInputType, parseCellInput, parseNumeric, isNumericType,
} from '../datagrid/datagrid-utils.js';

const THRESHOLD = 0.7;

/**
 * Erkennt den Typ einer Spalte und wandelt die Werte entsprechend um.
 * Die Eingaben werden nicht verändert.
 *
 * @param {any[]} values Zellwerte (Text, Zahlen oder `null`)
 * @param {{ format?: object }} [opts] Ausgangsformat der Spalte
 * @returns {{ type: string, values: any[], format: object } | null}
 *   `null`, wenn kein Wert ungleich `null` vorhanden ist.
 */
export function detectColumnType(values, { format = {} } = {}) {
  const vals = values.filter(v => v != null);
  if (vals.length === 0) return null;

  const counts = { numeric: 0, currency: 0, percent: 0, date: 0, time: 0, text: 0 };
  for (const v of vals) {
    const detected = detectInputType(String(v));
    if (detected) counts[detected.type]++;
    else counts.text++;
  }

  const total = vals.length;
  let bestType = 'text';
  let bestRatio = 0;
  for (const [type, count] of Object.entries(counts)) {
    if (type === 'text') continue;
    const ratio = count / total;
    if (ratio > bestRatio && ratio >= THRESHOLD) {
      bestType = type;
      bestRatio = ratio;
    }
  }

  if (bestType === 'text') {
    const numericCount = vals.filter(v => typeof v === 'number' || parseNumeric(v) !== null).length;
    if (numericCount / total >= THRESHOLD) bestType = 'numeric';
  }

  const outFormat = { ...format };
  let outValues;

  if (isNumericType(bestType)) {
    outValues = values.map(v => {
      if (v == null) return null;
      const d = detectInputType(String(v));
      if (d && typeof d.value === 'number') return d.value;
      const n = parseNumeric(v);
      return n !== null ? n : null;
    });
    if (bestType === 'currency' && !outFormat.decimals) outFormat.decimals = 2;
    if (bestType === 'percent' && !outFormat.decimals) outFormat.decimals = 1;
  } else if (bestType === 'date' || bestType === 'time') {
    outValues = values.map(v => (v == null ? null : parseCellInput({ type: bestType }, String(v))));
  } else {
    outValues = values.map(v => (v == null ? null : String(v)));
  }

  return { type: bestType, values: outValues, format: outFormat };
}
