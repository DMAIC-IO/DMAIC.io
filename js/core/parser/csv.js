/**
 * CSV-Parser (PapaParse) für Grid, Datenimport und Beispieldatensätze.
 *
 * Zeilenenden werden vor dem Lesen vereinheitlicht, leere Datensätze
 * (ein einziges leeres Feld) entfallen, Textzellen sind getrimmt. Die
 * Spaltentypen bestimmt `detectColumnType`.
 */
import { Papa } from '../vendor/papaparse.js';
import { object, oneOf, boolean, number } from '../model.js';
import { parseNumeric } from '../datagrid/datagrid-utils.js';
import { detectColumnType } from './column-types.js';

/** Schlüssel der Oberfläche → Trennzeichen. */
const DELIMITER_MAP = { comma: ',', semicolon: ';', tab: '\t', pipe: '|' };

/** Voreinstellungen für gängige Messsystem-Exporte. */
export const CSV_PRESETS = {
  generic:               { delimiter: 'auto',      encoding: 'utf-8',        skipRows: 0, hasHeader: true },
  'zeiss-calypso':       { delimiter: 'semicolon', encoding: 'windows-1252', skipRows: 4, hasHeader: true },
  'hexagon-pcdmis':      { delimiter: 'comma',     encoding: 'utf-8',        skipRows: 4, hasHeader: true },
  'mitutoyo-measurlink': { delimiter: 'comma',     encoding: 'utf-8',        skipRows: 0, hasHeader: true },
};

/** Optionen des CSV-Formats. */
export const CSV_OPTIONS = object({
  delimiter: oneOf(['auto', 'comma', 'semicolon', 'tab', 'pipe'], { default: 'auto' }),
  encoding: oneOf(['utf-8', 'windows-1252', 'iso-8859-1'], { default: 'utf-8' }),
  hasHeader: boolean({ default: true }),
  skipRows: number({ integer: true, min: 0, default: 0 }),
  preset: oneOf(Object.keys(CSV_PRESETS), { default: 'generic' }),
});

/** Kandidaten in Rangfolge (früher gewinnt bei Gleichstand). */
const CANDIDATES = ['\t', ';', ',', '|'];

/** Anzahl nicht leerer Datensätze, die `detectDelimiter` prüft. */
const DETECT_SAMPLE = 10;

/** Zeilenenden `\r\n` und `\r` zu `\n`. */
const normalizeEol = (s) => s.replace(/\r\n?/g, '\n');

const stripBom = (s) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

const isBlank = (r) => r.length === 1 && r[0].trim() === '';

/**
 * Trennt Excels führende `sep=<Zeichen>`-Zeile ab.
 * @param {string} text
 * @returns {{ text: string, delim: string|null }} Text ohne die Zeile und ihr Trennzeichen
 */
export function stripSepLine(text) {
  const s = String(text ?? '');
  const m = /^(﻿?)sep=(.)\r?\n/i.exec(s);
  return m ? { text: m[1] + s.slice(m[0].length), delim: m[2] } : { text: s, delim: null };
}

/**
 * Zerlegt CSV-Text in Datensätze. Ein Anführungszeichen öffnet ein Feld nur
 * am Feldanfang (`12" Rohr` bleibt Text). Leere Datensätze entfallen.
 *
 * @param {string} text
 * @param {{ delimiter: string, maxRecords?: number }} opts einzelnes Trennzeichen
 * @returns {string[][]}
 */
export function readCsvRecords(text, { delimiter, maxRecords = Infinity }) {
  const s = normalizeEol(stripBom(stripSepLine(text).text));
  const records = [];
  const config = { delimiter, skipEmptyLines: false, dynamicTyping: false };
  if (maxRecords === Infinity) {
    for (const r of Papa.parse(s, config).data) if (!isBlank(r)) records.push(r);
  } else {
    Papa.parse(s, {
      ...config,
      step: (res, parser) => {
        if (!isBlank(res.data)) records.push(res.data);
        if (records.length >= maxRecords) parser.abort();
      },
    });
  }
  return records;
}

/**
 * Erkennt das Trennzeichen. Die ersten zehn nicht leeren Datensätze werden je
 * Kandidat (Tab, Semikolon, Komma, Pipe) gelesen:
 *
 * - die häufigste Feldzahl muss mindestens 2 sein;
 * - Konsistenz = Anteil der Datensätze mit dieser Feldzahl;
 * - ein Kandidat entfällt bei Konsistenz unter 1, wenn der erste Datensatz
 *   weniger Felder hat als die häufigste Zahl (Dezimaltrenner, kein Trenner:
 *   `Wert\n1,5\n2,5`); mehr Felder im Kopf (ragged mit Leerfeldern) bleiben;
 * - höchste Konsistenz gewinnt, bei Gleichstand der frühere Kandidat.
 *
 * Bleibt keiner übrig, kommt ein Zeichen, das im Text nicht vorkommt (also
 * eine Spalte), sonst U+001F.
 *
 * @param {string} text
 * @returns {string} einzelnes Zeichen
 */
export function detectDelimiter(text) {
  const sep = stripSepLine(text);
  if (sep.delim) return sep.delim;
  const s = sep.text;
  let best = null;
  let bestConsistency = -1;
  for (const cand of CANDIDATES) {
    const rows = readCsvRecords(s, { delimiter: cand, maxRecords: DETECT_SAMPLE });
    if (rows.length === 0) continue;
    const freq = new Map();
    for (const r of rows) freq.set(r.length, (freq.get(r.length) || 0) + 1);
    let mode = 0;
    let modeFreq = 0;
    for (const [n, f] of freq) {
      if (f > modeFreq || (f === modeFreq && n > mode)) { mode = n; modeFreq = f; }
    }
    if (mode < 2) continue;
    const consistency = modeFreq / rows.length;
    if (consistency < 1 && rows[0].length < mode) continue;
    if (consistency > bestConsistency) { best = cand; bestConsistency = consistency; }
  }
  if (best !== null) return best;
  return CANDIDATES.find(c => !s.includes(c)) ?? '\u001F';
}

/** Dateiname ohne Pfad und Endung; Vorgabe `Sheet 1`. */
function basename(filename) {
  if (!filename) return 'Sheet 1';
  const noPath = filename.replace(/^.*[\\/]/, '');
  return noPath.replace(/\.[^.]+$/, '') || noPath;
}

function emptyError() {
  const e = new Error('Empty CSV file');
  e.code = 'errCsvEmpty';
  return e;
}

/**
 * Liest CSV-Text.
 *
 * @param {string} text
 * @param {{ delimiter?: string, hasHeader?: boolean|'auto', skipRows?: number, filename?: string }} [opts]
 *   `delimiter`: `auto`, `comma`, `semicolon`, `tab`, `pipe` oder ein Zeichen;
 *   `hasHeader`: `'auto'` wertet die erste Zeile aus (Kopf, wenn nicht alle Felder Zahlen sind und Daten folgen)
 * @returns {{ format: 'csv', sheets: Array<{ name: string, rowCount: number, columns: Array<{ name: string, shortName: string, type: string, values: any[], format: object }> }> }}
 * @throws {Error} mit `code: 'errCsvEmpty'`, wenn keine Datensätze übrig bleiben
 */
export function parseCsvText(text, opts = {}) {
  const skipRows = Math.max(0, Math.floor(Number(opts.skipRows) || 0));
  const sep = stripSepLine(stripBom(String(text ?? '')));
  let s = normalizeEol(sep.text);
  if (skipRows > 0) s = s.split('\n').slice(skipRows).join('\n');
  if (!s.trim()) throw emptyError();

  const key = opts.delimiter;
  const delimiter = (key && key !== 'auto' ? (DELIMITER_MAP[key] ?? key) : '') || sep.delim || detectDelimiter(s);
  const rows = readCsvRecords(s, { delimiter });
  if (rows.length === 0) throw emptyError();

  let hasHeader = opts.hasHeader !== false;
  if (opts.hasHeader === 'auto') {
    hasHeader = rows.length > 1 && !rows[0].every(v => parseNumeric(v) !== null);
  }
  const header = hasHeader ? rows[0] : null;
  const data = hasHeader ? rows.slice(1) : rows;
  const colCount = Math.max(...rows.map(r => r.length));

  const columns = [];
  for (let c = 0; c < colCount; c++) {
    const raw = data.map(r => {
      const v = c < r.length ? r[c].trim() : '';
      return v === '' ? null : v;
    });
    const detected = detectColumnType(raw) ?? { type: 'text', values: raw, format: {} };
    columns.push({
      name: header ? (header[c] || '').trim() : '',
      shortName: `C${c + 1}`,
      type: detected.type,
      values: detected.values,
      format: detected.format,
    });
  }
  return { format: 'csv', sheets: [{ name: basename(opts.filename), rowCount: data.length, columns }] };
}

/**
 * Liest CSV-Bytes: dekodiert (Vorgabe UTF-8, unbekannte Kodierung fällt auf
 * UTF-8 zurück), entfernt das BOM und ruft `parseCsvText`.
 *
 * @param {ArrayBuffer} buffer
 * @param {{ encoding?: string, delimiter?: string, hasHeader?: boolean|'auto', skipRows?: number, filename?: string }} [opts]
 * @returns {Promise<ReturnType<typeof parseCsvText>>}
 */
export async function parseCsv(buffer, opts = {}) {
  let text;
  try {
    text = new TextDecoder(opts.encoding || 'utf-8', { fatal: false }).decode(buffer);
  } catch {
    text = new TextDecoder('utf-8').decode(buffer);
  }
  return parseCsvText(stripBom(text), opts);
}
