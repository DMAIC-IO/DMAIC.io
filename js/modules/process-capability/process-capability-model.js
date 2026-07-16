/**
 * D.Mike — Process Capability Model (process-capability-model.js)
 *
 * Pure state container for the Process Capability module. Holds the
 * user-entered specification parameters, the referenced worksheet column and
 * any values embedded directly from a catalog example. Contains no view logic,
 * no i18n and no statistics — the analysis result is derived (transiently) in
 * the view layer from these inputs plus the live worksheet data via
 * `engines/process-capability-engine.js`, so it is intentionally NOT persisted.
 *
 * Params are stored as the raw strings the inputs show (Alpine `x-model`).
 * `fromJSON` accepts the legacy numeric persistence shape (NaN = empty) and the
 * legacy fractional `confidence` (0.95 → "95").
 */

/**
 * Coerce a persisted numeric/string spec field into the raw string the input
 * shows. Legacy projects persisted lsl/usl/target as numbers (NaN when empty).
 * @param {*} v
 * @returns {string}
 */
function numStr(v) {
  if (v == null) return '';
  if (typeof v === 'number') return isNaN(v) ? '' : String(v);
  const s = String(v).trim();
  return s;
}

/**
 * Coerce a persisted confidence value into a percent string ("95").
 * Legacy stored a fraction (0 < c <= 1); current stores a percent string.
 * @param {*} v
 * @returns {string}
 */
function confStr(v) {
  if (v == null || v === '') return '95';
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  if (!isFinite(n) || n <= 0) return '95';
  // Fractional legacy value (0 < c <= 1) → percent
  const pct = n <= 1 ? n * 100 : n;
  return String(Number(pct.toFixed(2)));
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

/** @param {*} arr @returns {number[]|null} */
function embeddedFromJSON(arr) {
  if (!Array.isArray(arr)) return null;
  return arr.filter(v => typeof v === 'number' && !isNaN(v));
}

export class State {
  /** User-entered specification parameters (raw strings, as typed). */
  params = {
    name: '',
    lsl: '',
    usl: '',
    target: '',
    unit: 'mm',
    confidence: '95',
  };

  /** Referenced worksheet column, or null. */
  columnRef = null;

  /** Values embedded directly from an example (bypasses the worksheet), or null. */
  embeddedValues = null;

  /** Display label for embedded example data. */
  embeddedLabel = '';

  /** Reset embedded-example mode. */
  clearEmbedded() {
    this.embeddedValues = null;
    this.embeddedLabel = '';
  }

  /** @returns {boolean} true if any meaningful field is set (drives confirmPopout). */
  hasContent() {
    const p = this.params;
    return Boolean(this.columnRef)
      || (Array.isArray(this.embeddedValues) && this.embeddedValues.length > 0)
      || Boolean(p.name) || Boolean(p.lsl) || Boolean(p.usl) || Boolean(p.target);
  }

  toJSON() {
    return {
      params: {
        name: this.params.name,
        lsl: this.params.lsl,
        usl: this.params.usl,
        target: this.params.target,
        unit: this.params.unit,
        confidence: this.params.confidence,
      },
      columnRef: this.columnRef ? { ...this.columnRef } : null,
      embeddedValues: this.embeddedValues ? [...this.embeddedValues] : null,
      embeddedLabel: this.embeddedLabel || '',
    };
  }

  /**
   * Deserialize and validate. Always returns a valid State, even for
   * null/undefined/malformed input. Accepts legacy numeric params and the
   * legacy fractional confidence. The derived `lastResult` field is ignored.
   * @param {*} d
   * @returns {State}
   */
  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;

    const p = d.params && typeof d.params === 'object' ? d.params : {};
    s.params.name = typeof p.name === 'string' ? p.name : '';
    s.params.lsl = numStr(p.lsl);
    s.params.usl = numStr(p.usl);
    s.params.target = numStr(p.target);
    s.params.unit = typeof p.unit === 'string' && p.unit ? p.unit : 'mm';
    s.params.confidence = confStr(p.confidence);

    s.columnRef = columnRefFromJSON(d.columnRef);
    s.embeddedValues = embeddedFromJSON(d.embeddedValues);
    s.embeddedLabel = typeof d.embeddedLabel === 'string' ? d.embeddedLabel : '';

    return s;
  }
}
