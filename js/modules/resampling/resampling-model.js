/**
 * D.Mike — Resampling Module — Model (resampling-model.js)
 *
 * Persistent configuration plus the last result summary. No DOM, no i18n.
 * Only the summary (estimates, intervals, p-values, histogram bins and the
 * inputs hash) is persisted — never raw replicates.
 */

import { STATISTIC_IDS } from '../../engines/resampling-statistics.js';

/** @typedef {{ instanceId: string, sheetId?: string, columnId: string }} ColumnRef */

export const MODES = ['one', 'two', 'paired', 'k'];
export const CONTRASTS = ['difference', 'ratio'];
export const DIRECTIONS = ['two-sided', 'greater', 'less'];
export const CI_METHODS = ['bca', 'percentile'];
export const SEED_MAX = 2147483647;

/** Statistics offered per mode (spec: paired location only, no Ppk for k). */
export const STATS_BY_MODE = {
  one: STATISTIC_IDS.slice(),
  two: STATISTIC_IDS.slice(),
  paired: ['mean', 'median', 'trimmedMean'],
  k: STATISTIC_IDS.filter((id) => id !== 'ppk'),
};

const DEFAULT_STAT_PARAMS = { trim: 0.1, p: 0.95, lsl: '', usl: '' };

/** Sanitize a stored column reference (or null). */
function refOrNull(r) {
  if (r && typeof r === 'object' && r.instanceId != null && r.columnId != null) {
    return { ...r };
  }
  return null;
}

/** Limits are entered as text; numbers from older files become text too. */
function limitText(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
}

function sanitizeStatParams(d) {
  const out = { ...DEFAULT_STAT_PARAMS };
  if (!d || typeof d !== 'object') return out;
  if (typeof d.trim === 'number' && Number.isFinite(d.trim)) out.trim = d.trim;
  if (typeof d.p === 'number' && Number.isFinite(d.p)) out.p = d.p;
  out.lsl = limitText(d.lsl);
  out.usl = limitText(d.usl);
  return out;
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isAbsent = (v) => v === null || v === undefined;
const hasCi = (v) => isObj(v) && isObj(v.ci);

/**
 * Shape check of a persisted result summary: exactly what the presenter and
 * the charts read. Anything else is dropped, never repaired.
 * @param {*} r
 * @returns {boolean}
 */
function isValidResult(r) {
  if (!isObj(r) || typeof r.inputsHash !== 'string' || !MODES.includes(r.mode)) return false;
  if (!Array.isArray(r.labels) || !Array.isArray(r.n)) return false;
  const { boot, perm, k } = r;
  if (!isAbsent(boot) && !(isObj(boot) && isObj(boot.ci) && Array.isArray(boot.bins))) return false;
  if (!isAbsent(perm) && !(isObj(perm) && Array.isArray(perm.bins))) return false;
  if (!isAbsent(k)) {
    if (!isObj(k) || !Array.isArray(k.bins) || !Array.isArray(k.groups) || !Array.isArray(k.posthoc)) return false;
    if (!k.groups.every(hasCi) || !k.posthoc.every(hasCi)) return false;
  }
  return true;
}

export class State {
  /** @type {'one'|'two'|'paired'|'k'} */
  mode = 'one';
  /** @type {string} one of STATS_BY_MODE[mode] */
  statisticId = 'mean';
  /** @type {{ trim: number, p: number, lsl: string, usl: string }} */
  statParams = { ...DEFAULT_STAT_PARAMS };
  /** @type {'difference'|'ratio'} mode 'two' only */
  contrast = 'difference';
  /** @type {'two-sided'|'greater'|'less'} modes 'two' and 'paired' */
  direction = 'two-sided';
  /** @type {string} mode 'one': hypothesised value, kept as text */
  target = '';
  /** @type {ColumnRef|null} */
  colRef1 = null;
  /** @type {ColumnRef|null} */
  colRef2 = null;
  /** @type {ColumnRef[]} */
  colRefsK = [];
  /** @type {number} resamples / Monte Carlo permutations */
  B = 10000;
  /** @type {number} */
  seed = 42;
  /** @type {number} */
  confidence = 0.95;
  /** @type {'bca'|'percentile'} */
  ciMethod = 'bca';
  /** @type {string|null} worksheet provisioned by loadExample */
  exampleWorksheetId = null;
  /** @type {object|null} summary from resampling-analysis summarize() */
  result = null;

  /** Statistics the current mode offers. */
  allowedStatistics() {
    return STATS_BY_MODE[this.mode] || STATS_BY_MODE.one;
  }

  /**
   * Switch mode; a statistic the new mode does not offer falls back to mean.
   * @param {string} mode
   */
  setMode(mode) {
    if (!MODES.includes(mode)) return;
    this.mode = mode;
    if (!this.allowedStatistics().includes(this.statisticId)) this.statisticId = 'mean';
  }

  /**
   * Draw a new seed in 1…SEED_MAX.
   * @param {() => number} [random]
   * @returns {number}
   */
  rollSeed(random = Math.random) {
    this.seed = Math.min(SEED_MAX, 1 + Math.floor(random() * SEED_MAX));
    return this.seed;
  }

  /** True when any column reference is selected (drives loadExample confirm). */
  hasContent() {
    return Boolean(this.colRef1 || this.colRef2 || (this.colRefsK && this.colRefsK.length));
  }

  /**
   * A result exists but was computed from other inputs.
   * @param {string} hash current inputs hash
   */
  isStale(hash) {
    return this.result !== null && this.result.inputsHash !== hash;
  }

  toJSON() {
    return {
      mode: this.mode,
      statisticId: this.statisticId,
      statParams: { ...this.statParams },
      contrast: this.contrast,
      direction: this.direction,
      target: this.target,
      colRef1: this.colRef1 ? { ...this.colRef1 } : null,
      colRef2: this.colRef2 ? { ...this.colRef2 } : null,
      colRefsK: Array.isArray(this.colRefsK) ? this.colRefsK.map((r) => ({ ...r })) : [],
      B: this.B,
      seed: this.seed,
      confidence: this.confidence,
      ciMethod: this.ciMethod,
      exampleWorksheetId: this.exampleWorksheetId,
      // Plain copy: through Alpine's reactive proxy a live reference would make
      // the state manager's structuredClone throw (result is plain JSON by contract).
      result: this.result ? JSON.parse(JSON.stringify(this.result)) : null,
    };
  }

  /**
   * Never throws: unknown or mistyped fields keep their defaults.
   * @param {object|null|undefined} d
   * @returns {State}
   */
  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object' || Array.isArray(d)) return s;
    if (MODES.includes(d.mode)) s.mode = d.mode;
    if (s.allowedStatistics().includes(d.statisticId)) s.statisticId = d.statisticId;
    s.statParams = sanitizeStatParams(d.statParams);
    if (CONTRASTS.includes(d.contrast)) s.contrast = d.contrast;
    if (DIRECTIONS.includes(d.direction)) s.direction = d.direction;
    if (typeof d.target === 'string') s.target = d.target;
    s.colRef1 = refOrNull(d.colRef1);
    s.colRef2 = refOrNull(d.colRef2);
    s.colRefsK = Array.isArray(d.colRefsK) ? d.colRefsK.map(refOrNull).filter(Boolean) : [];
    if (Number.isInteger(d.B) && d.B > 0) s.B = d.B;
    if (Number.isInteger(d.seed) && d.seed >= 0 && d.seed <= SEED_MAX) s.seed = d.seed;
    if (typeof d.confidence === 'number' && d.confidence > 0 && d.confidence < 1) s.confidence = d.confidence;
    if (CI_METHODS.includes(d.ciMethod)) s.ciMethod = d.ciMethod;
    if (typeof d.exampleWorksheetId === 'string') s.exampleWorksheetId = d.exampleWorksheetId;
    const r = d.result;
    if (isValidResult(r)) s.result = r;
    return s;
  }
}
