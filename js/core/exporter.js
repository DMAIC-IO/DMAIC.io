/**
 * D.Mike — Exporte aus Mappern nach Datenform (exporter.js)
 *
 * Ein Modul nennt keine Formate, sondern Mapper: `table()` (Zeilen),
 * `tables()` (Blätter), `tree()` (JSON-Wert), `image()` (SVG-Text). Hier
 * entstehen daraus die Dateien — Trenner, BOM und Meldungen sind damit
 * überall gleich.
 *
 * Die Serialisierer sind rein (in Node testbar).
 */

/** Alle Formate in Menüreihenfolge. */
export const EXPORT_FORMATS = Object.freeze(['xlsx', 'csv', 'json', 'png', 'svg']);

/** Welche Mapper ein Format speisen (der erste vorhandene gewinnt). */
const SOURCES = Object.freeze({
  xlsx: ['tables', 'table'],
  csv: ['table'],
  json: ['tree'],
  png: ['image'],
  svg: ['image'],
});

/**
 * Die Formate, für die `exportsDef` einen Mapper hat, in Menüreihenfolge.
 * @param {Record<string, unknown>} exportsDef
 * @returns {string[]}
 */
export function formatsOf(exportsDef) {
  return EXPORT_FORMATS.filter((fmt) => SOURCES[fmt].some((k) => typeof exportsDef[k] === 'function'));
}

/** @param {unknown} v @returns {string} */
const csvCell = (v) => `"${(v === null || v === undefined ? '' : String(v)).replace(/"/g, '""')}"`;

/**
 * CSV-Text: `sep=;`-Zeile, jede Zelle in Anführungszeichen, Trenner `;`,
 * `\n` auch nach der letzten Zeile.
 * @param {(string|number|null|undefined)[][]} rows erste Zeile = Kopf
 * @returns {string}
 */
export function toCsvText(rows) {
  return `sep=;\n${rows.map((row) => row.map(csvCell).join(';')).join('\n')}\n`;
}

/**
 * JSON-Text mit zwei Leerzeichen Einzug.
 * @param {unknown} value
 * @returns {string}
 */
export function toJsonText(value) {
  return JSON.stringify(value, null, 2);
}

/**
 * Ein gültiger Blattname: ohne `[]:*?/\`, höchstens 31 Zeichen, nie leer.
 * @param {string} text
 * @returns {string}
 */
export function sheetName(text) {
  return String(text).replace(/[[\]:*?/\\]/g, '').slice(0, 31) || 'Sheet1';
}

/** Öffnendes `<svg …>`-Tag. */
const SVG_OPEN = /<svg\b[^>]*>/;

/**
 * `width`/`height` am Wurzelelement eines SVG-Texts.
 * @param {string} svg
 * @returns {{ width: number, height: number }}
 * @throws {Error} wenn eines fehlt
 */
export function svgSize(svg) {
  const open = SVG_OPEN.exec(svg)?.[0] ?? '';
  const read = (name) => Number(new RegExp(`\\s${name}="([\\d.]+)(?:px)?"`).exec(open)?.[1]);
  const width = read('width');
  const height = read('height');
  if (!(width > 0) || !(height > 0)) throw new Error('svg: width and height required on the root element');
  return { width, height };
}

/**
 * CSS als `<defs><style>` direkt hinter das öffnende `<svg>` legen.
 * @param {string} svg
 * @param {string} css
 * @returns {string}
 */
export function withStyle(svg, css) {
  const m = SVG_OPEN.exec(svg);
  if (!m) throw new Error('svg: no root element');
  const at = m.index + m[0].length;
  return `${svg.slice(0, at)}<defs><style>${css}</style></defs>${svg.slice(at)}`;
}
