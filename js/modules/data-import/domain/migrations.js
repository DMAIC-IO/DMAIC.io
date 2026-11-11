/**
 * D.Mike — Datenimport: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js.
 */

const FORMAT_IDS = ['mpx', 'csv', 'xlsx', 'json', 'aqdef'];
const PRESETS = ['generic', 'zeiss-calypso', 'hexagon-pcdmis', 'mitutoyo-measurlink'];
const DELIMITERS = ['auto', 'comma', 'semicolon', 'tab', 'pipe'];
const CSV_ENCODINGS = ['utf-8', 'windows-1252', 'iso-8859-1'];
const AQDEF_ENCODINGS = ['windows-1252', 'iso-8859-1', 'utf-8'];

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const pick = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);
const flag = (v) => (typeof v === 'boolean' ? v : true);

/**
 * Beschreibung der Quelle oder null.
 * @param {any} f
 * @returns {{ name: string, size: number, formatId: string|null, source: 'file'|'text' }|null}
 */
function readFile(f) {
  if (!isObj(f)) return null;
  return {
    name: typeof f.name === 'string' ? f.name : '',
    size: Number.isInteger(f.size) && f.size >= 0 ? f.size : 0,
    formatId: FORMAT_IDS.includes(f.formatId) ? f.formatId : null,
    source: f.source === 'text' ? 'text' : 'file',
  };
}

/**
 * Alte Form (`file`, `csvOptions`, `xlsxOptions`, `aqdefOptions`) in die Form 1.0.
 * Ungültige Werte werden durch die Vorgabe ersetzt.
 * @param {any} json
 * @returns {object}
 */
export function from0(json) {
  const d = isObj(json) ? json : {};
  const c = isObj(d.csvOptions) ? d.csvOptions : {};
  const x = isObj(d.xlsxOptions) ? d.xlsxOptions : {};
  const a = isObj(d.aqdefOptions) ? d.aqdefOptions : {};
  return {
    file: readFile(d.file),
    options: {
      csv: {
        preset: pick(c.preset, PRESETS, 'generic'),
        delimiter: pick(c.delimiter, DELIMITERS, 'auto'),
        encoding: pick(c.encoding, CSV_ENCODINGS, 'utf-8'),
        hasHeader: flag(c.hasHeader),
        skipRows: Number.isInteger(c.skipRows) && c.skipRows >= 0 ? c.skipRows : 0,
      },
      xlsx: { hasHeader: flag(x.hasHeader) },
      aqdef: { encoding: pick(a.encoding, AQDEF_ENCODINGS, 'windows-1252') },
    },
    activeSheet: 0,
  };
}
