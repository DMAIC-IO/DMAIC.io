/**
 * D.Mike — MSA Typ 1 Model (msa-typ1-model.js)
 *
 * Pure state container for the MSA Type 1 module. Holds the user-entered
 * parameters, the referenced worksheet column and the id of any worksheet
 * provisioned by an example load. Contains no view logic, no i18n and no
 * analysis — the analysis result is derived (transiently) in the view layer
 * from these inputs plus the live worksheet data, so it is intentionally
 * NOT persisted here.
 */

/** Allowed factor options (string form, matching the <select> option values). */
const K1_OPTIONS = ['0.2', '0.15', '0.1'];
const K2_OPTIONS = ['3', '4', '6'];

/**
 * Coerce a persisted numeric/string field into the raw string the input shows.
 * Legacy projects persisted `ref`/`lsl`/`usl` as numbers (NaN when empty).
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
    ref: '',
    unit: 'mm',
    lsl: '',
    usl: '',
    k1: '0.2',
    k2: '4',
  };

  /** Referenced worksheet column, or null. */
  columnRef = null;

  /** Instance id of a worksheet provisioned by loadExample (for cleanup on re-load). */
  exampleWorksheetId = null;

  /** @returns {boolean} true if any meaningful field is set (drives confirmPopout). */
  hasContent() {
    const p = this.params;
    return Boolean(this.columnRef) || Boolean(p.name) || Boolean(p.ref) || Boolean(p.lsl) || Boolean(p.usl);
  }

  toJSON() {
    return {
      params: {
        name: this.params.name,
        ref: this.params.ref,
        unit: this.params.unit,
        lsl: this.params.lsl,
        usl: this.params.usl,
        k1: this.params.k1,
        k2: this.params.k2,
      },
      columnRef: this.columnRef ? { ...this.columnRef } : null,
      exampleWorksheetId: this.exampleWorksheetId,
    };
  }

  /**
   * Deserialize and validate. Always returns a valid State, even for
   * null/undefined/malformed input. Accepts legacy numeric params.
   * @param {*} d
   * @returns {State}
   */
  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;

    const p = d.params && typeof d.params === 'object' ? d.params : {};
    s.params.name = typeof p.name === 'string' ? p.name : '';
    s.params.ref = numStr(p.ref);
    s.params.unit = typeof p.unit === 'string' && p.unit ? p.unit : 'mm';
    s.params.lsl = numStr(p.lsl);
    s.params.usl = numStr(p.usl);
    s.params.k1 = oneOf(p.k1, K1_OPTIONS, '0.2');
    s.params.k2 = oneOf(p.k2, K2_OPTIONS, '4');

    s.columnRef = columnRefFromJSON(d.columnRef);
    s.exampleWorksheetId = typeof d.exampleWorksheetId === 'string' ? d.exampleWorksheetId : null;

    return s;
  }
}
