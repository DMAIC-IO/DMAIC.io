/**
 * D.Mike — XY-Plot: Fehlerbalken je Datenreihe. Rein.
 *
 * Gespeichert an der Zeile der Datensätze (`datasets[i].errorBars`):
 * `{ mode: 'none' }`, `{ mode: 'constant', constant: { yPlus: 1, … } }` oder
 * `{ mode: 'columns', columns: { yPlus: ref, … } }` (Abstände vom Punkt) oder
 * `{ mode: 'columnsAbsolute', columnsAbsolute: { yPlus: ref, … } }` (Endpunkte
 * der Balken, etwa 95 und 110 um den Wert 100). Eine fehlende Richtung oder
 * `null` heißt „kein Balken“; ein negativer Abstand zählt als Betrag.
 */
import { object, oneOf, number, columnRef } from '../../../core/model.js';

/** Die vier Richtungen, in Anzeigereihenfolge. */
export const ERROR_BAR_KEYS = Object.freeze(['xPlus', 'xMinus', 'yPlus', 'yMinus']);

/** Spaltentypen mit reinen Zahlen: Prozent und Währung sind ebenfalls Zahlen. */
const NUMBER_TYPES = ['numeric', 'currency', 'percent'];

/**
 * Form der Fehlerbalken einer Reihe; im Schema `object(ERROR_BARS_SHAPE, { variantKey: 'mode' })`.
 * Als Form (`<NAME>_SHAPE`) einer Geschwisterdatei darf `domain/model.js` sie
 * im Schema nennen; darum als Literal ausgeschrieben.
 */
export const ERROR_BARS_SHAPE = {
  mode: oneOf(['none', 'constant', 'columns', 'columnsAbsolute']),
  // Richtungen in Anzeigereihenfolge: die negative Seite vor der positiven.
  constant: object({
    xMinus: number({ nullable: true, optional: true }),
    xPlus: number({ nullable: true, optional: true }),
    yMinus: number({ nullable: true, optional: true }),
    yPlus: number({ nullable: true, optional: true }),
  }, { optional: true }),
  columns: object({
    xMinus: columnRef({ types: NUMBER_TYPES, minCount: 1, optional: true }),
    xPlus: columnRef({ types: NUMBER_TYPES, minCount: 1, optional: true }),
    yMinus: columnRef({ types: NUMBER_TYPES, minCount: 1, optional: true }),
    yPlus: columnRef({ types: NUMBER_TYPES, minCount: 1, optional: true }),
  }, { optional: true }),
  columnsAbsolute: object({
    xMinus: columnRef({ types: NUMBER_TYPES, minCount: 1, optional: true }),
    xPlus: columnRef({ types: NUMBER_TYPES, minCount: 1, optional: true }),
    yMinus: columnRef({ types: NUMBER_TYPES, minCount: 1, optional: true }),
    yPlus: columnRef({ types: NUMBER_TYPES, minCount: 1, optional: true }),
  }, { optional: true }),
};

/**
 * Ob ein Modus je Richtung eine Spalte liest: `columns` hält Abstände vom
 * Punkt, `columnsAbsolute` die Endpunkte der Balken.
 * @param {unknown} mode @returns {mode is 'columns'|'columnsAbsolute'}
 */
export function isColumnMode(mode) {
  return mode === 'columns' || mode === 'columnsAbsolute';
}

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
 * @returns {{ show: true, xMode: 'relative'|'absolute'|'none', yMode: 'relative'|'absolute'|'none',
 *   xPlus?: (number|null)[], xMinus?: (number|null)[], yPlus?: (number|null)[], yMinus?: (number|null)[] }|null}
 *   `null`, wenn kein Punkt einen Balken bekommt
 */
export function buildErrorBars(spec, rows, read) {
  if (!spec || (spec.mode !== 'constant' && !isColumnMode(spec.mode))) return null;
  const given = spec[spec.mode];
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
  // `columnsAbsolute` reicht Endpunkte durch: der Renderer kennt dafür den Modus `absolute`.
  const kind = spec.mode === 'columnsAbsolute' ? 'absolute' : 'relative';
  // Eine Achse ohne Balken nennt nur ihren Modus `none` (die Listen des Widgets sind nicht nullbar).
  return {
    show: true,
    xMode: hasX ? kind : 'none',
    yMode: hasY ? kind : 'none',
    ...(hasX ? { xPlus: fill(arrays.xPlus), xMinus: fill(arrays.xMinus) } : {}),
    ...(hasY ? { yPlus: fill(arrays.yPlus), yMinus: fill(arrays.yMinus) } : {}),
  };
}
