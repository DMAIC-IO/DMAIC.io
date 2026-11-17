/**
 * D.Mike — Arbeitsblatt: Spaltenmerkmale (domain/columns.js)
 *
 * Die Schlüssel, die eine Spalte in `format` und `meta` tragen darf, und die
 * Prüfung eines `meta`, wie `setColumnMeta` sie verlangt. Eine Quelle für
 * Model, Migration, Lesen und Viewmodel.
 *
 * Rein: kein DOM, kein i18n.
 */

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
