/**
 * D.Mike — MSA Typ 2 Model (msa-typ2-model.js)
 *
 * Pure state container for the MSA Type 2 (Gage R&R) module. Holds the
 * user-entered parameters (LSL/USL/α/k as raw strings), the three referenced
 * worksheet columns (part / operator / measurement) and the id of any worksheet
 * provisioned by an example load. Contains no view logic, no i18n and no
 * analysis — the Gage R&R result is derived (transiently) in the view layer
 * from these inputs plus the live worksheet data via the shared
 * `js/engines/msa-typ2-engine.js`, so it is intentionally NOT persisted here.
 */

/** Allowed study-variation factor options (string form, matching the <select> values). */
const K_OPTIONS = ['5.15', '6'];

/**
 * Coerce a persisted numeric/string field into the raw string the input shows.
 * Legacy projects persisted `lsl`/`usl`/`alpha` as numbers (NaN when empty).
 * @param {*} v
 * @returns {string}
 */
function numStr(v) {
  if (v == null) return '';
  if (typeof v === 'number') return isNaN(v) ? '' : String(v);
  return String(v);
}

/**
 * Coerce a persisted k factor into one of the allowed string options.
 * Accepts the new `params.k` string and the legacy `params.studyVarMultiplier`
 * number (5.15 / 6). Falls back to '5.15'.
 * @param {*} k
 * @param {*} legacy
 * @returns {string}
 */
function kStr(k, legacy) {
  const cand = k != null ? String(k) : (legacy != null ? String(legacy) : '');
  return K_OPTIONS.includes(cand) ? cand : '5.15';
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
    lsl: '',
    usl: '',
    alpha: '',
    k: '5.15',
  };

  /** Referenced worksheet columns, each {instanceId,sheetId,columnId} or null. */
  columnRefs = {
    part: null,
    operator: null,
    measurement: null,
  };

  /** Instance id of a worksheet provisioned by loadExample (for cleanup on re-load). */
  exampleWorksheetId = null;

  /** @returns {boolean} true if any meaningful field is set (drives confirmPopout). */
  hasContent() {
    const c = this.columnRefs;
    return Boolean(c.part) || Boolean(c.operator) || Boolean(c.measurement) || Boolean(this.params.lsl) || Boolean(this.params.usl);
  }

  toJSON() {
    return {
      params: {
        lsl: this.params.lsl,
        usl: this.params.usl,
        alpha: this.params.alpha,
        k: this.params.k,
      },
      columnRefs: {
        part: this.columnRefs.part ? { ...this.columnRefs.part } : null,
        operator: this.columnRefs.operator ? { ...this.columnRefs.operator } : null,
        measurement: this.columnRefs.measurement ? { ...this.columnRefs.measurement } : null,
      },
      exampleWorksheetId: this.exampleWorksheetId,
    };
  }

  /**
   * Deserialize and validate. Always returns a valid State, even for
   * null/undefined/malformed input. Accepts legacy numeric params and the
   * legacy `studyVarMultiplier` key.
   * @param {*} d
   * @returns {State}
   */
  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;

    const p = d.params && typeof d.params === 'object' ? d.params : {};
    s.params.lsl = numStr(p.lsl);
    s.params.usl = numStr(p.usl);
    s.params.alpha = numStr(p.alpha);
    s.params.k = kStr(p.k, p.studyVarMultiplier);

    const refs = d.columnRefs && typeof d.columnRefs === 'object' ? d.columnRefs : {};
    s.columnRefs.part = columnRefFromJSON(refs.part);
    s.columnRefs.operator = columnRefFromJSON(refs.operator);
    s.columnRefs.measurement = columnRefFromJSON(refs.measurement);

    s.exampleWorksheetId = typeof d.exampleWorksheetId === 'string' ? d.exampleWorksheetId : null;

    return s;
  }
}
