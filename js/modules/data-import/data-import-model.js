/**
 * D.Mike — Data Import Module — Model (data-import-model.js)
 *
 * Holds only the persisted state of the module: the picked file descriptor
 * and the three format-specific parser option sets. Parsed data, the raw
 * buffer, the active sheet index, busy/error flags etc. are transient and
 * live in the view (data-fn), never here.
 *
 * `toJSON()` matches the legacy `getState()` shape exactly:
 *   { file, csvOptions, xlsxOptions, aqdefOptions }
 */

import { ChunkLoadError } from '../../core/chunks.js';

/** Default CSV/TSV parser options. */
export const DEFAULT_CSV_OPTIONS = {
  delimiter: 'auto',  // 'auto' | 'comma' | 'semicolon' | 'tab' | 'pipe'
  encoding: 'utf-8',  // 'utf-8' | 'windows-1252' | 'iso-8859-1'
  hasHeader: true,
  skipRows: 0,        // metadata lines to drop before parsing (CMM exports)
  preset: 'generic',  // 'generic' | 'zeiss-calypso' | 'hexagon-pcdmis' | 'mitutoyo-measurlink'
};

/** Default XLSX/ODS parser options. */
export const DEFAULT_XLSX_OPTIONS = {
  hasHeader: true,
};

/** Default AQDEF parser options. Q-DAS files default to Windows-1252 in DACH. */
export const DEFAULT_AQDEF_OPTIONS = {
  encoding: 'windows-1252',  // 'utf-8' | 'windows-1252' | 'iso-8859-1'
};

/** Clamp a skipRows value to a non-negative integer (NaN → 0). */
export function clampSkipRows(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

/**
 * Turn a parse failure into the message shown in the view.
 * A failed chunk load gets the app-wide translated message instead of the
 * raw English error text; a coded error uses its code as i18n key.
 * @param {*} err - the thrown value
 * @param {(key:string, params?:object) => string} t - module translator
 * @param {(key:string) => string} tApp - app-level translator
 * @returns {string}
 */
export function parseErrorMessage(err, t, tApp) {
  if (err instanceof ChunkLoadError) return tApp('app.chunkLoadFailed');
  const code = err && err.code;
  if (code) return t(code);
  const msg = (err && err.message) || String(err);
  return t('parseErrorDetail', { message: msg });
}

export class State {
  /** @type {{name:string,size:number,formatId:string|null}|null} */
  file = null;
  csvOptions = { ...DEFAULT_CSV_OPTIONS };
  xlsxOptions = { ...DEFAULT_XLSX_OPTIONS };
  aqdefOptions = { ...DEFAULT_AQDEF_OPTIONS };

  /** True when a file has been picked — drives loadExample confirm prompt. */
  hasContent() {
    return Boolean(this.file);
  }

  toJSON() {
    return {
      file: this.file,
      csvOptions: this.csvOptions,
      xlsxOptions: this.xlsxOptions,
      aqdefOptions: this.aqdefOptions,
    };
  }

  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;
    s.file = d.file && typeof d.file === 'object' ? d.file : null;
    s.csvOptions = { ...DEFAULT_CSV_OPTIONS, ...(d.csvOptions || {}) };
    s.xlsxOptions = { ...DEFAULT_XLSX_OPTIONS, ...(d.xlsxOptions || {}) };
    s.aqdefOptions = { ...DEFAULT_AQDEF_OPTIONS, ...(d.aqdefOptions || {}) };
    return s;
  }
}
