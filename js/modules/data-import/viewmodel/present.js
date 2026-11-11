/**
 * D.Mike — Datenimport: Anzeige und Lauf (rein, ohne DOM).
 *
 * Größe der Datei, Meldung eines Parse-Fehlers, Zusammenfassung eines
 * Parse-Ergebnisses für die Lesefläche, Vorschau-Zeilen und Beschriftungen
 * der Spaltentypen und Auswahlwerte.
 */
import { ChunkLoadError } from '../../../core/chunks.js';

/** Wartezeit vor dem Parsen: eine schnelle Folge von Änderungen parst einmal. */
export const RERUN_DELAY = 120;

/** Zeilen der Vorschau. */
export const PREVIEW_ROWS = 20;

/** Textschlüssel je Spaltentyp. */
const TYPE_LABEL_KEYS = {
  numeric: 'typeNumeric', text: 'typeText', date: 'typeDate', time: 'typeTime',
  currency: 'typeCurrency', percent: 'typePercent', binary: 'typeBinary',
};

/** Textschlüssel je Auswahlwert der Optionen. */
export const OPTION_LABEL_KEYS = {
  generic: 'csv_preset_generic', 'zeiss-calypso': 'csv_preset_zeiss_calypso',
  'hexagon-pcdmis': 'csv_preset_hexagon_pcdmis', 'mitutoyo-measurlink': 'csv_preset_mitutoyo_measurlink',
  auto: 'delim_auto', comma: 'delim_comma', semicolon: 'delim_semicolon', tab: 'delim_tab', pipe: 'delim_pipe',
  'utf-8': 'enc_utf8', 'windows-1252': 'enc_windows1252', 'iso-8859-1': 'enc_latin1',
};

/** @typedef {(key: string, params?: object) => string} Translate */

/**
 * Abbrechbare Pause.
 * @param {number} ms @param {AbortSignal} signal @returns {Promise<void>}
 */
export function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
    function onAbort() { clearTimeout(timer); reject(signal.reason); }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Größe für die Dateikarte: Byte, KB mit einer, MB mit zwei Nachkommastellen.
 * @param {number|null|undefined} n Byte @returns {string}
 */
export function fmtBytes(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Die Meldung zu einem Parse-Fehler. Ein gescheitertes Nachladen bekommt die
 * übersetzte Meldung der App, ein Fehler mit Code dessen Text, sonst der
 * Fehlertext im Satz `parseErrorDetail`.
 * @param {*} err der geworfene Wert
 * @param {Translate} t Übersetzer des Moduls
 * @param {(key: string) => string} tApp Übersetzer der App
 * @returns {string}
 */
export function parseErrorMessage(err, t, tApp) {
  if (err instanceof ChunkLoadError) return tApp('app.chunkLoadFailed');
  const code = err && err.code;
  if (code) return t(code);
  const msg = (err && err.message) || String(err);
  return t('parseErrorDetail', { message: msg });
}

/**
 * Die Zusammenfassung eines Parse-Ergebnisses, ohne Werte.
 * @param {{ format: string, sheets: Array<{ name: string, rowCount: number, columns: Array<{ name: string, shortName?: string, type: string }> }> }} parsed
 * @returns {{ format: string, sheets: Array<{ name: string, rowCount: number, columns: Array<{ name: string, type: string }> }> }}
 */
export function summarize(parsed) {
  return {
    format: parsed.format,
    sheets: parsed.sheets.map((s) => ({
      name: s.name,
      rowCount: s.rowCount,
      columns: s.columns.map((c) => ({ name: c.name || c.shortName || '', type: c.type })),
    })),
  };
}

/**
 * Nummer des gezeigten Blatts: das gewählte, auf das letzte Blatt geklemmt.
 * @param {number} wanted gespeichertes `activeSheet` @param {number} count Blattzahl
 * @returns {number} -1 ohne Blätter
 */
export function clampSheet(wanted, count) {
  if (count <= 0) return -1;
  return Math.min(Math.max(0, wanted), count - 1);
}

/**
 * Beschriftung eines Spaltentyps.
 * @param {string} type Schlüssel aus `COLUMN_TYPES` @param {Translate} t @returns {string}
 */
export function typeLabel(type, t) {
  return t(TYPE_LABEL_KEYS[type] ?? 'typeText');
}

/**
 * Köpfe der Vorschau.
 * @param {{ columns: Array<{ name: string, shortName?: string, type: string }> }|null} sheet
 * @param {Translate} t
 * @returns {Array<{ name: string, typeLabel: string }>}
 */
export function previewColumns(sheet, t) {
  if (!sheet) return [];
  return sheet.columns.map((c) => ({ name: c.name || c.shortName || '', typeLabel: typeLabel(c.type, t) }));
}

/** Zahlenartige Typen: rechtsbündig in der Vorschau. */
const NUMERIC_TYPES = new Set(['numeric']);

/**
 * Zeilen der Vorschau: höchstens `PREVIEW_ROWS`, leere Zellen als Punkt.
 * @param {{ rowCount: number, columns: Array<{ type: string, values: any[] }> }|null} sheet
 * @returns {Array<Array<{ cls: string, text: string }>>}
 */
export function previewRows(sheet) {
  if (!sheet) return [];
  const rows = [];
  const shown = Math.min(PREVIEW_ROWS, sheet.rowCount);
  for (let r = 0; r < shown; r++) {
    rows.push(sheet.columns.map((c) => {
      const v = c.values[r];
      if (v == null) return { cls: 'data-import__cell--null', text: '·' };
      return { cls: NUMERIC_TYPES.has(c.type) ? 'data-import__cell--num' : '', text: String(v) };
    }));
  }
  return rows;
}

/**
 * Zeilen, die die Vorschau nicht mehr zeigt.
 * @param {{ rowCount: number }|null} sheet @returns {number}
 */
export function moreRows(sheet) {
  if (!sheet) return 0;
  return Math.max(0, sheet.rowCount - Math.min(PREVIEW_ROWS, sheet.rowCount));
}
