/**
 * DMAIC.io — MSA Typ 6 Model (msa-typ6-model.js)
 *
 * Pure state container for the MSA Typ 6 (Stabilität / Langzeitverhalten)
 * module. Holds the user-entered parameters, the three referenced worksheet
 * columns (timestamp/value/subgroup) and the id of any worksheet provisioned
 * by an example load. Contains no view logic, no i18n and no analysis — the
 * stability result is derived (transiently) in the view layer from these
 * inputs plus the live worksheet data via `js/engines/msa-typ6-engine.js`,
 * so it is intentionally NOT persisted here.
 *
 * Spec: docs/superpowers/specs/2026-07-16-msa-typ6-design.md § 6
 */

/** Allowed chart-type options. */
const CHART_TYPES = ['i-mr', 'xbar-r'];
/** Allowed limits-mode options. */
const LIMITS_MODES = ['from-study', 'given'];
/** Allowed α options (string form, matching the <select> values). */
const ALPHA_OPTIONS = ['0.01', '0.05', '0.10'];
/** Nelson rule ids the engine understands (1..8). */
const RULE_IDS = [1, 2, 3, 4, 5, 6, 7, 8];
/** Default enabled Nelson rules (matches control-chart-engine.js's DEFAULT_ENABLED_RULES). */
const DEFAULT_ENABLED_RULES = [1, 2, 3, 4, 5, 6];

/** @param {*} v @param {string[]} allowed @param {string} fallback */
function pickEnum(v, allowed, fallback) {
  return allowed.includes(v) ? v : fallback;
}

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

/**
 * Coerce a persisted numeric field to a finite number, else NaN. `null`
 * (the JSON round-trip of NaN) and empty strings both resolve to NaN.
 * @param {*} v
 * @returns {number}
 */
function numOrNaN(v) {
  if (v === null || v === undefined || v === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Coerce a persisted baseline-k to a positive integer, else the default (20).
 * @param {*} v
 * @returns {number}
 */
function baselineKOf(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 20;
}

/**
 * Normalize a persisted enabledRules array to a sorted, de-duplicated array
 * of the valid rule ids it contains (Alpine checkbox bindings hand back
 * strings, so entries are coerced with Number() first). Falls back to the
 * default rule set (1–6) if nothing valid remains.
 * @param {*} v
 * @returns {number[]}
 */
function enabledRulesOf(v) {
  if (!Array.isArray(v)) return DEFAULT_ENABLED_RULES.slice();
  const ids = [...new Set(v.map((r) => Number(r)).filter((r) => RULE_IDS.includes(r)))];
  ids.sort((a, b) => a - b);
  return ids.length ? ids : DEFAULT_ENABLED_RULES.slice();
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
  /** User-entered parameters (raw strings / numbers as consumed by the UI + engine). */
  params = {
    measurementName: '',
    unit: 'mm',
    chartType: 'i-mr',
    limitsMode: 'from-study',
    baselineK: 20,
    mu0: NaN,
    sigma0: NaN,
    sourceTyp1InstanceId: null,
    enabledRules: DEFAULT_ENABLED_RULES.slice(),
    alpha: '0.05',
  };

  /** Referenced worksheet columns, each {instanceId,sheetId,columnId} or null. */
  columns = {
    timestamp: null,
    value: null,
    subgroup: null,
  };

  /** Instance id of a worksheet provisioned by loadExample (for cleanup on re-load). */
  exampleWorksheetId = null;

  /** @returns {boolean} true if any meaningful field is set (drives confirmPopout). */
  hasContent() {
    const c = this.columns;
    return Boolean(c.timestamp) || Boolean(c.value) || Boolean(c.subgroup)
        || Boolean(this.params.measurementName);
  }

  toJSON() {
    return {
      params: {
        measurementName: this.params.measurementName,
        unit: this.params.unit,
        chartType: this.params.chartType,
        limitsMode: this.params.limitsMode,
        baselineK: this.params.baselineK,
        mu0: Number.isFinite(this.params.mu0) ? this.params.mu0 : null,
        sigma0: Number.isFinite(this.params.sigma0) ? this.params.sigma0 : null,
        sourceTyp1InstanceId: this.params.sourceTyp1InstanceId,
        enabledRules: enabledRulesOf(this.params.enabledRules),
        alpha: this.params.alpha,
      },
      columns: {
        timestamp: this.columns.timestamp ? { ...this.columns.timestamp } : null,
        value:     this.columns.value     ? { ...this.columns.value }     : null,
        subgroup:  this.columns.subgroup  ? { ...this.columns.subgroup }  : null,
      },
      exampleWorksheetId: this.exampleWorksheetId,
    };
  }

  /**
   * Deserialize and validate. Always returns a valid State, even for
   * null/undefined/malformed input. Accepts the legacy numeric α value and
   * the JSON-round-tripped `null` for mu0/sigma0 (NaN cannot survive
   * JSON.stringify, so it comes back as null and is restored here).
   * @param {*} d
   * @returns {State}
   */
  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;

    const p = d.params && typeof d.params === 'object' ? d.params : {};
    s.params.measurementName = typeof p.measurementName === 'string' ? p.measurementName : '';
    s.params.unit = typeof p.unit === 'string' && p.unit ? p.unit : 'mm';
    s.params.chartType = pickEnum(p.chartType, CHART_TYPES, 'i-mr');
    s.params.limitsMode = pickEnum(p.limitsMode, LIMITS_MODES, 'from-study');
    s.params.baselineK = baselineKOf(p.baselineK);
    s.params.mu0 = numOrNaN(p.mu0);
    s.params.sigma0 = numOrNaN(p.sigma0);
    s.params.sourceTyp1InstanceId = typeof p.sourceTyp1InstanceId === 'string' ? p.sourceTyp1InstanceId : null;
    s.params.enabledRules = enabledRulesOf(p.enabledRules);
    s.params.alpha = alphaStr(p.alpha);

    const refs = d.columns && typeof d.columns === 'object' ? d.columns : {};
    s.columns.timestamp = columnRefFromJSON(refs.timestamp);
    s.columns.value      = columnRefFromJSON(refs.value);
    s.columns.subgroup   = columnRefFromJSON(refs.subgroup);

    s.exampleWorksheetId = typeof d.exampleWorksheetId === 'string' ? d.exampleWorksheetId : null;

    return s;
  }
}
