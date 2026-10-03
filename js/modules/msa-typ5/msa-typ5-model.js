/**
 * DMAIC.io — MSA Typ 5 Model (msa-typ5-model.js)
 *
 * Pure state container for the MSA Typ 5 (Attributive Prüfmittel-Fähigkeit) module.
 * Holds the user-entered parameters, the referenced worksheet columns (five
 * single columns, plus the rating columns of the wide layout) and
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
/** Allowed verdict rule sets: AIAG MSA 4th ed. ch. III-C or Bosch Heft 10. */
export const RULESET_OPTIONS = ['aiag', 'bosch'];
/** Allowed data layouts: one rating column (long) or one column per appraiser × trial (wide). */
export const LAYOUT_OPTIONS = ['long', 'wide'];
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

/**
 * Format a p value: '< 0,001' / '< 0.001' below 0.001, else three decimals;
 * non-finite → '—'.
 * @param {number} p
 * @param {'de'|'en'} lang
 * @returns {string}
 */
export function formatP(p, lang) {
  if (!Number.isFinite(p)) return '—';
  const sep = lang === 'de' ? ',' : '.';
  if (p < 0.001) return `< 0${sep}001`;
  return p.toFixed(3).replace('.', sep);
}

/**
 * Format a number with `d` decimals and the language decimal separator
 * (de: comma, en: point); non-finite → '—'.
 * @param {number} v
 * @param {number} d
 * @param {'de'|'en'} lang
 * @returns {string}
 */
export function formatNum(v, d, lang) {
  if (!Number.isFinite(v)) return '—';
  const s = v.toFixed(d);
  return lang === 'de' ? s.replace('.', ',') : s;
}

/**
 * Format a rate (0…1) as percent with one decimal, e.g. '97,8 %' / '97.8 %';
 * non-finite → '—'.
 * @param {number} rate
 * @param {'de'|'en'} lang
 * @returns {string}
 */
export function formatPct(rate, lang) {
  return Number.isFinite(rate) ? `${formatNum(rate * 100, 1, lang)} %` : '—';
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
    ruleSet: 'aiag',
    layout: 'long',
    /** Trials per appraiser in the wide layout (raw input string). */
    trials: '2',
  };

  /** Referenced worksheet columns, each {instanceId,sheetId,columnId} or null. */
  columns = {
    part: null,
    appraiser: null,
    rating: null,
    reference: null,
    replicate: null,
    /** Wide layout only: the rating columns, appraiser × trial. */
    ratings: [],
  };

  /** Instance id of a worksheet provisioned by loadExample (for cleanup on re-load). */
  exampleWorksheetId = null;

  /** @returns {boolean} true if any meaningful field is set (drives confirmPopout). */
  hasContent() {
    const c = this.columns;
    return Boolean(c.part) || Boolean(c.appraiser) || Boolean(c.rating)
        || Boolean(c.reference) || Boolean(c.replicate) || c.ratings.length > 0
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
        ruleSet: this.params.ruleSet,
        layout: this.params.layout,
        trials: this.params.trials,
      },
      columns: {
        part:      this.columns.part      ? { ...this.columns.part }      : null,
        appraiser: this.columns.appraiser ? { ...this.columns.appraiser } : null,
        rating:    this.columns.rating    ? { ...this.columns.rating }    : null,
        reference: this.columns.reference ? { ...this.columns.reference } : null,
        replicate: this.columns.replicate ? { ...this.columns.replicate } : null,
        ratings:   this.columns.ratings.map((r) => ({ ...r })),
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
    s.params.ruleSet       = pickEnum(p.ruleSet, RULESET_OPTIONS, 'aiag');
    s.params.layout        = pickEnum(p.layout, LAYOUT_OPTIONS, 'long');
    s.params.trials        = (typeof p.trials === 'string' || typeof p.trials === 'number')
      ? String(p.trials)
      : '2';

    const refs = d.columns && typeof d.columns === 'object' ? d.columns : {};
    s.columns.part      = columnRefFromJSON(refs.part);
    s.columns.appraiser = columnRefFromJSON(refs.appraiser);
    s.columns.rating    = columnRefFromJSON(refs.rating);
    s.columns.reference = columnRefFromJSON(refs.reference);
    s.columns.replicate = columnRefFromJSON(refs.replicate);
    s.columns.ratings   = Array.isArray(refs.ratings)
      ? refs.ratings.map(columnRefFromJSON).filter(Boolean)
      : [];

    s.exampleWorksheetId = typeof d.exampleWorksheetId === 'string' ? d.exampleWorksheetId : null;

    return s;
  }
}
