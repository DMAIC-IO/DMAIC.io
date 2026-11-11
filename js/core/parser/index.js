/**
 * Formatregister der Datenparser.
 *
 * Jeder Eintrag nennt Kennung, Dateiendungen, das Schema seiner Optionen
 * (`null`, wenn es keine gibt) und die Parsefunktion.
 */
import { object, oneOf, boolean } from '../model.js';
import { parseCsv, CSV_OPTIONS } from './csv.js';
import { parseMpx } from './mpx.js';
import { parseXlsx } from './xlsx.js';
import { parseJson } from './json.js';
import { parseAqdef } from './aqdef.js';

/**
 * Ergebnis eines Parsers.
 *
 * @typedef {object} ParseResult
 * @property {'mpx'|'csv'|'xlsx'|'json'|'aqdef'} format  Format der Quelle
 * @property {Array<{
 *   name: string,
 *   rowCount: number,
 *   columns: Array<{ name: string, shortName: string, type: string, values: any[], format?: object }>
 * }>} sheets  die gelesenen Blätter; `type` ist ein Schlüssel aus `COLUMN_TYPES`
 */

/**
 * @typedef {object} Format
 * @property {'mpx'|'csv'|'xlsx'|'json'|'aqdef'} id  Kennung
 * @property {string[]} extensions  Dateiendungen ohne Punkt, kleingeschrieben
 * @property {object|null} options  Schema der Optionen (`object({...})`) oder `null`
 * @property {(input: ArrayBuffer, opts?: object) => Promise<ParseResult>} parse  liest die Bytes
 */

/** @type {Format[]} */
export const FORMATS = [
  { id: 'mpx', extensions: ['mpx'], options: null, parse: parseMpx },
  { id: 'csv', extensions: ['csv', 'tsv', 'txt'], options: CSV_OPTIONS, parse: parseCsv },
  {
    id: 'xlsx',
    extensions: ['xlsx', 'xlsm', 'xls', 'ods'],
    options: object({ hasHeader: boolean({ default: true }) }),
    parse: parseXlsx,
  },
  { id: 'json', extensions: ['json', 'ndjson', 'jsonl'], options: null, parse: parseJson },
  {
    id: 'aqdef',
    extensions: ['dfq', 'dfd', 'dfx'],
    options: object({
      encoding: oneOf(['windows-1252', 'iso-8859-1', 'utf-8'], { default: 'windows-1252' }),
    }),
    parse: parseAqdef,
  },
];

/** Wert für das `accept`-Attribut einer Dateiauswahl, z. B. `.mpx,.csv,…`. */
export const ACCEPT = `.${FORMATS.flatMap(f => f.extensions).join(',.')}`;

/** Formate, die sich als Text einlesen lassen. */
export const TEXT_FORMATS = ['csv', 'json'];

/**
 * Das Format zu einem Dateinamen, nach der Endung.
 *
 * @param {string} name Dateiname
 * @returns {Format|null} `null` bei unbekannter oder fehlender Endung
 */
export function formatForFilename(name) {
  const m = /\.([^.]+)$/.exec(name || '');
  if (!m) return null;
  const ext = m[1].toLowerCase();
  return FORMATS.find(f => f.extensions.includes(ext)) || null;
}
