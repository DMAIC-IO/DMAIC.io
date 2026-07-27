/**
 * DMAIC.io — MSA Typ 4 Model (msa-typ4-model.js)
 *
 * Pure state container for the MSA Type 4 (linearity) module. Holds the
 * user-entered parameters, the two referenced worksheet columns (reference /
 * measured) and the id of any worksheet provisioned by an example load.
 * Contains no view logic, no i18n and no analysis — the linearity result is
 * derived (transiently) in the view layer from these inputs plus the live
 * worksheet data via the shared `js/engines/msa-typ4-engine.js`, so it is
 * intentionally NOT persisted here.
 */

/** Allowed <select>/<radio> option values (as strings). */
const NORM_OPTIONS = ['AIAG', 'VDA5'];
const PV_OPTIONS = ['tolerance', 'sixSigma'];

/**
 * Coerce a persisted numeric/string field into the raw string the input shows.
 * Legacy projects persisted `tolerance.LSL/USL`, `sigmaP` etc. as numbers
 * (NaN — round-tripped to null in JSON — when empty).
 * @param {*} v
 * @returns {string}
 */
function numStr(v) {
  if (v == null) return '';
  if (typeof v === 'number') return isNaN(v) ? '' : String(v);
  return String(v);
}

/** @param {*} v @param {string[]} options @param {string} fallback @returns {string} */
function oneOf(v, options, fallback) {
  const s = v == null ? '' : String(v);
  return options.includes(s) ? s : fallback;
}

/**
 * Normalize an α value (number or string) to one of the fixed option strings
 * '0.01' / '0.05' / '0.10'. Handles the JS `0.1` vs. `'0.10'` roundtrip so
 * example JSONs (numeric alpha) and persisted user selections both resolve.
 * @param {*} v
 * @returns {string}
 */
function alphaStr(v) {
  if (v == null || v === '') return '0.05';
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  if (!isFinite(n)) return '0.05';
  if (Math.abs(n - 0.01) < 1e-9) return '0.01';
  if (Math.abs(n - 0.05) < 1e-9) return '0.05';
  if (Math.abs(n - 0.10) < 1e-9) return '0.10';
  return '0.05';
}

/** @param {*} d @returns {{instanceId:string,sheetId:string,columnId:string}|null} */
function columnRefFromJSON(d) {
  if (!d || typeof d !== 'object') return null;
  if (d.instanceId == null || d.sheetId == null || d.columnId == null) return null;
  return {
    instanceId: String(d.instanceId),
    sheetId: String(d.sheetId),
    columnId: String(d.columnId),
  };
}

export class State {
  /** User-entered parameters (raw strings, as typed / selected). */
  params = {
    name: '',
    unit: 'mm',
    norm: 'AIAG',
    pvMode: 'tolerance',
    tolerance: { LSL: '', USL: '' },
    sigmaP: '',
    alpha: '0.05',
  };

  /** Referenced worksheet columns, each {instanceId,sheetId,columnId} or null. */
  refColumn = null;
  measColumn = null;

  /** Instance id of a worksheet provisioned by loadExample (for cleanup on re-load). */
  exampleWorksheetId = null;

  /** @returns {boolean} true if any meaningful field is set (drives confirmPopout). */
  hasContent() {
    const p = this.params;
    return Boolean(this.refColumn)
        || Boolean(this.measColumn)
        || Boolean(p.name)
        || Boolean(p.tolerance.LSL)
        || Boolean(p.tolerance.USL)
        || Boolean(p.sigmaP);
  }

  toJSON() {
    return {
      params: {
        name: this.params.name,
        unit: this.params.unit,
        norm: this.params.norm,
        pvMode: this.params.pvMode,
        tolerance: { LSL: this.params.tolerance.LSL, USL: this.params.tolerance.USL },
        sigmaP: this.params.sigmaP,
        alpha: this.params.alpha,
      },
      refColumn: this.refColumn ? { ...this.refColumn } : null,
      measColumn: this.measColumn ? { ...this.measColumn } : null,
      exampleWorksheetId: this.exampleWorksheetId,
    };
  }

  /**
   * Deserialize and validate. Always returns a valid State, even for
   * null/undefined/malformed input. Accepts legacy numeric params (LSL/USL as
   * numbers, alpha as number, etc.).
   * @param {*} d
   * @returns {State}
   */
  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;

    const p = d.params && typeof d.params === 'object' ? d.params : {};
    s.params.name = typeof p.name === 'string' ? p.name : '';
    s.params.unit = typeof p.unit === 'string' && p.unit ? p.unit : 'mm';
    s.params.norm = oneOf(p.norm, NORM_OPTIONS, 'AIAG');
    s.params.pvMode = oneOf(p.pvMode, PV_OPTIONS, 'tolerance');

    const tol = p.tolerance && typeof p.tolerance === 'object' ? p.tolerance : {};
    s.params.tolerance.LSL = numStr(tol.LSL);
    s.params.tolerance.USL = numStr(tol.USL);
    s.params.sigmaP = numStr(p.sigmaP);
    s.params.alpha = alphaStr(p.alpha);

    s.refColumn = columnRefFromJSON(d.refColumn);
    s.measColumn = columnRefFromJSON(d.measColumn);
    s.exampleWorksheetId = typeof d.exampleWorksheetId === 'string' ? d.exampleWorksheetId : null;

    return s;
  }
}
