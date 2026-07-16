/**
 * DMAIC.io — MSA Typ 5 Model (msa-typ5-model.js)
 *
 * Pure state container for the MSA Typ 5 (Attributive Prüfmittel-Fähigkeit) module.
 * Holds the user-entered parameters, the five referenced worksheet columns and
 * the id of any worksheet provisioned by an example load. Contains no view
 * logic, no i18n and no analysis — the κ / Effektivitäts-Result is derived
 * (transiently) in the view layer from these inputs plus the live worksheet
 * data via `js/engines/msa-typ5-engine.js`, so it is intentionally NOT
 * persisted here.
 *
 * Spec: docs/superpowers/specs/2026-07-15-msa-typ5-design.md § 6
 */

/** Allowed feature-type options. */
const TYPE_OPTIONS = ['binary', 'nominal', 'ordinal'];
/** Allowed ordinal-weight options. */
const WEIGHTS_OPTIONS = ['linear', 'quadratic'];
/** Allowed α options (string form, matching the <select> values). */
const ALPHA_OPTIONS = ['0.01', '0.05', '0.10'];

/**
 * Coerce a persisted α (either string or legacy number) into the raw string
 * the select shows. Falls back to '0.05'.
 * @param {*} a
 * @returns {string}
 */
function alphaStr(a) {
  if (a == null) return '0.05';
  const s = typeof a === 'number' ? a.toFixed(2) : String(a);
  return ALPHA_OPTIONS.includes(s) ? s : '0.05';
}

/** @param {*} v @param {string[]} allowed @param {string} fallback */
function pickEnum(v, allowed, fallback) {
  return allowed.includes(v) ? v : fallback;
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
  /** User-entered parameters (raw strings / arrays as consumed by the UI). */
  params = {
    type: 'binary',
    positiveLevel: null,
    weights: 'quadratic',
    alpha: '0.05',
    ordinalOrder: null,
  };

  /** Referenced worksheet columns, each {instanceId,sheetId,columnId} or null. */
  columns = {
    part: null,
    appraiser: null,
    rating: null,
    reference: null,
    replicate: null,
  };

  /** Instance id of a worksheet provisioned by loadExample (for cleanup on re-load). */
  exampleWorksheetId = null;

  /** @returns {boolean} true if any meaningful field is set (drives confirmPopout). */
  hasContent() {
    const c = this.columns;
    return Boolean(c.part) || Boolean(c.appraiser) || Boolean(c.rating)
        || Boolean(c.reference) || Boolean(c.replicate)
        || Boolean(this.params.positiveLevel);
  }

  toJSON() {
    return {
      params: {
        type: this.params.type,
        positiveLevel: this.params.positiveLevel,
        weights: this.params.weights,
        alpha: this.params.alpha,
        ordinalOrder: Array.isArray(this.params.ordinalOrder)
          ? this.params.ordinalOrder.slice()
          : null,
      },
      columns: {
        part:      this.columns.part      ? { ...this.columns.part }      : null,
        appraiser: this.columns.appraiser ? { ...this.columns.appraiser } : null,
        rating:    this.columns.rating    ? { ...this.columns.rating }    : null,
        reference: this.columns.reference ? { ...this.columns.reference } : null,
        replicate: this.columns.replicate ? { ...this.columns.replicate } : null,
      },
      exampleWorksheetId: this.exampleWorksheetId,
    };
  }

  /**
   * Deserialize and validate. Always returns a valid State, even for
   * null/undefined/malformed input. Accepts the legacy numeric α value.
   * @param {*} d
   * @returns {State}
   */
  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;

    const p = d.params && typeof d.params === 'object' ? d.params : {};
    s.params.type          = pickEnum(p.type, TYPE_OPTIONS, 'binary');
    s.params.positiveLevel = (p.positiveLevel === null || typeof p.positiveLevel === 'string')
      ? p.positiveLevel
      : null;
    s.params.weights       = pickEnum(p.weights, WEIGHTS_OPTIONS, 'quadratic');
    s.params.alpha         = alphaStr(p.alpha);
    s.params.ordinalOrder  = Array.isArray(p.ordinalOrder)
      ? p.ordinalOrder.filter((v) => typeof v === 'string')
      : null;

    const refs = d.columns && typeof d.columns === 'object' ? d.columns : {};
    s.columns.part      = columnRefFromJSON(refs.part);
    s.columns.appraiser = columnRefFromJSON(refs.appraiser);
    s.columns.rating    = columnRefFromJSON(refs.rating);
    s.columns.reference = columnRefFromJSON(refs.reference);
    s.columns.replicate = columnRefFromJSON(refs.replicate);

    s.exampleWorksheetId = typeof d.exampleWorksheetId === 'string' ? d.exampleWorksheetId : null;

    return s;
  }
}
