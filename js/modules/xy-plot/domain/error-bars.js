/**
 * D.Mike — XY-Plot: Fehlerbalken je Datenreihe. Rein.
 *
 * Gespeichert an der Zeile der Datensätze (`datasets[i].errorBars`):
 * `{ mode: 'none' }`, `{ mode: 'constant', constant: { yPlus: 1, … } }` oder
 * `{ mode: 'columns', columns: { yPlus: ref, … } }`. Eine fehlende Richtung
 * oder `null` heißt „kein Balken“; ein negativer Betrag zählt als Betrag.
 */
import { object, oneOf, number, columnRef } from '../../../core/model.js';

/** Die vier Richtungen, in Anzeigereihenfolge. */
export const ERROR_BAR_KEYS = Object.freeze(['xPlus', 'xMinus', 'yPlus', 'yMinus']);

/** Spaltentypen mit reinen Zahlen: Prozent und Währung sind ebenfalls Zahlen. */
export const NUMBER_TYPES = Object.freeze(['numeric', 'currency', 'percent']);

const amount = number({ nullable: true, optional: true });
const column = columnRef({ types: NUMBER_TYPES, minCount: 1, optional: true });

/** Feldart der Fehlerbalken einer Reihe. */
export const ErrorBarsSpec = object({
  mode: oneOf(['none', 'constant', 'columns']),
  constant: object(Object.fromEntries(ERROR_BAR_KEYS.map((k) => [k, amount])), { optional: true }),
  columns: object(Object.fromEntries(ERROR_BAR_KEYS.map((k) => [k, column])), { optional: true }),
}, { variantKey: 'mode' });

/**
 * Ein Zellwert als Fehlerbetrag; leer oder nicht numerisch → `null`.
 * @param {unknown} v @returns {number|null}
 */
function toErrorValue(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Die Konfiguration `series.errorBars` des Scatter-Renderers für eine Reihe.
 * @param {any} spec Fehlerbalken der Zeile
 * @param {number[]} rows Quellzeile jedes gezeichneten Punkts der Reihe
 * @param {{ values: (ref: object) => any[]|null }} read Leser des Arbeitsblatts
 * @returns {{ show: true, xMode: 'relative'|'none', yMode: 'relative'|'none',
 *   xPlus?: (number|null)[], xMinus?: (number|null)[], yPlus?: (number|null)[], yMinus?: (number|null)[] }|null}
 *   `null`, wenn kein Punkt einen Balken bekommt
 */
export function buildErrorBars(spec, rows, read) {
  if (!spec || (spec.mode !== 'constant' && spec.mode !== 'columns')) return null;
  const given = spec.mode === 'constant' ? spec.constant : spec.columns;
  /** @type {Record<string, (number|null)[]|null>} */
  const arrays = {};
  for (const key of ERROR_BAR_KEYS) {
    let arr = null;
    const v = given?.[key];
    if (spec.mode === 'constant') {
      const c = toErrorValue(v);
      if (c !== null) arr = rows.map(() => c);
    } else if (v) {
      const values = read.values(v);
      if (Array.isArray(values)) {
        arr = rows.map((r) => toErrorValue(values[r]));
        if (arr.every((x) => x === null)) arr = null;
      }
    }
    arrays[key] = arr;
  }
  const hasX = arrays.xPlus !== null || arrays.xMinus !== null;
  const hasY = arrays.yPlus !== null || arrays.yMinus !== null;
  if (!hasX && !hasY) return null;
  const fill = (arr) => arr ?? rows.map(() => null);
  // Eine Achse ohne Balken nennt nur ihren Modus `none` (die Listen des Widgets sind nicht nullbar).
  return {
    show: true,
    xMode: hasX ? 'relative' : 'none',
    yMode: hasY ? 'relative' : 'none',
    ...(hasX ? { xPlus: fill(arrays.xPlus), xMinus: fill(arrays.xMinus) } : {}),
    ...(hasY ? { yPlus: fill(arrays.yPlus), yMinus: fill(arrays.yMinus) } : {}),
  };
}
