/**
 * D.Mike — Arbeitsblatt: Spaltenmerkmale (domain/columns.js)
 *
 * Die Schlüssel, die eine Spalte in `format` und `meta` tragen darf, und die
 * Prüfung eines `meta`, wie `setColumnMeta` sie verlangt. Eine Quelle für
 * Model, Migration, Lesen und Viewmodel.
 *
 * Dazu die Form eines Spaltenkopfs (`COLUMN_SHAPE`, Model und Kommandos) und
 * die Typregel einer Zelle (`fitsType`).
 *
 * Rein: kein DOM, kein i18n.
 */
import { object, map, text, number, boolean, oneOf } from '../../../core/model.js';

/**
 * Felder eines Spaltenkopfs; `meta` mit den Schlüsseln von `COLUMN_META_KEYS`.
 * Typen, Rollen und Formate stehen als Literal (Schema-Literal-Gate); die
 * Gleichheit mit `COLUMN_TYPES`, `ALL_ROLES`, `DATE_FORMATS` und
 * `TIME_FORMATS` sichert `tests/modules/worksheet/model.test.js`.
 */
export const COLUMN_SHAPE = Object.freeze({
  id: text(),
  name: text(),
  shortName: text(),
  type: oneOf(['numeric', 'text', 'date', 'time', 'currency', 'percent', 'binary']),
  unit: text({ nullable: true }),
  role: oneOf(['continuous', 'categorical', 'ordinal', 'date', 'identifier', 'freeText'], { nullable: true }),
  roleManual: boolean(),
  format: object({
    decimals: number({ integer: true, min: 0, optional: true }),
    dateFormat: oneOf(['dd.MM.yyyy', 'yyyy-MM-dd', 'dd/MM/yyyy', 'MM/dd/yyyy', 'd. MMMM yyyy'], { optional: true }),
    timeFormat: oneOf(['HH:mm', 'HH:mm:ss'], { optional: true }),
    // Ruling R10: Altdaten und Beispiele tragen es, der Renderer liest es.
    currencySymbol: text({ optional: true }),
  }),
  meta: object({
    lock: oneOf(['hard', 'soft'], { optional: true }),
    reason: text({ optional: true }),
    managedBy: text({ optional: true }),
    managedRef: text({ optional: true }),
    categoricalCoding: map(text(), number(), { optional: true }),
  }, { nullable: true }),
});

/**
 * Passt der Zellwert zum Spaltentyp? `null` passt immer. Nicht strenger als
 * das Raster: Datum/Zeit dürfen Zahlen halten (Typwechsel lässt sie stehen),
 * `binary` Wahrheitswerte, `text` alles. Dieselbe Regel steht fest in
 * `migrations.js` (die Migration macht Alt-Text zur Textspalte; repariert auf
 * `null` wird nur ein kaputter Stand 1.0).
 * @param {string} type @param {any} v @returns {boolean}
 */
export function fitsType(type, v) {
  if (v === null) return true;
  switch (type) {
    case 'numeric': case 'currency': case 'percent': return typeof v === 'number';
    case 'binary': return typeof v === 'number' || typeof v === 'boolean';
    case 'date': case 'time': return typeof v === 'string' || typeof v === 'number';
    default: return true;
  }
}

/**
 * Format-Schlüssel, die die Oberfläche setzt — genau die Auswahl des
 * Format-Pickers (`datagrid.js` `_renderAttrPickerFormatColumn`), je
 * Spaltentyp. `currencySymbol` bietet die Oberfläche nicht an.
 */
export const FORMAT_KEYS = Object.freeze(['decimals', 'dateFormat', 'timeFormat']);

/** Welche Format-Schlüssel zu welchem Spaltentyp passen (`setColumnFormat`). */
export const FORMAT_KEYS_BY_TYPE = Object.freeze({
  numeric: ['decimals'], currency: ['decimals'], percent: ['decimals'],
  date: ['dateFormat'], time: ['timeFormat'],
});

/**
 * Schlüssel des Spaltenmerkmals `meta`, die `setColumnMeta` annimmt — mit der
 * Art ihres Werts. Alles andere lehnt die Aktion ab.
 */
export const COLUMN_META_KEYS = Object.freeze({
  lock: 'lock', reason: 'string', managedBy: 'string', managedRef: 'string', categoricalCoding: 'object',
});

/**
 * Prüft ein Spaltenmerkmal und liefert eine eigenständige Kopie.
 * @param {object|null} meta das Merkmal oder null
 * @returns {object|null} die geprüfte Kopie, `null` für „entfernen“
 * @throws {Error} bei unbekanntem Schlüssel oder falscher Art des Werts
 */
export function checkColumnMeta(meta) {
  if (meta === null) return null;
  if (typeof meta !== 'object' || Array.isArray(meta)) throw new Error('meta must be an object or null');
  const out = {};
  for (const [key, value] of Object.entries(meta)) {
    const kind = COLUMN_META_KEYS[key];
    if (!kind) {
      throw new Error(`unknown meta key ${JSON.stringify(key)}; allowed: ${Object.keys(COLUMN_META_KEYS).join(', ')}`);
    }
    if (kind === 'lock' && value !== 'hard' && value !== 'soft') {
      throw new Error(`meta.lock must be 'hard' or 'soft', got ${JSON.stringify(value)}`);
    }
    if (kind === 'string' && typeof value !== 'string') throw new Error(`meta.${key} must be a string`);
    if (kind === 'object' && (value === null || typeof value !== 'object' || Array.isArray(value))) {
      throw new Error(`meta.${key} must be an object`);
    }
    out[key] = kind === 'object' ? JSON.parse(JSON.stringify(value)) : value;
  }
  return out;
}
