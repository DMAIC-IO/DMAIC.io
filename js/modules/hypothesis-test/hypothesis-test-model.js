/**
 * D.Mike — Hypothesis Test Module — Model (hypothesis-test-model.js)
 *
 * Holds the persistent configuration State only. All statistical computation
 * lives in the engines (hypothesis-test-engine, normality-test-engine,
 * math-utils) and is invoked transiently from the view (data-Fn) — the Model
 * never reaches for the DOM, i18n, or CSS classes.
 *
 * Persistence shape is the legacy `getState()` plus `equalVariances`:
 *   { category, testType, direction, alpha, powerGoal, targetValue, targetType,
 *     colRef1, colRef2, colRefsK, exampleWorksheetId, equalVariances }
 *
 * testType 'paired' (means only) reuses colRef1/colRef2 for the two columns
 * and targetValue for the hypothesized mean difference μ_d₀.
 */

/** @typedef {{ instanceId: string, sheetId?: string, columnId: string }} ColumnRef */

const CATEGORIES = ['variance', 'mean'];
const TEST_TYPES = ['one', 'two', 'paired', 'k'];
const DIRECTIONS = ['two-sided', 'greater', 'less'];
const TARGET_TYPES = ['variance', 'stddev'];

/** Sanitize a stored column reference (or null). */
function refOrNull(r) {
  if (r && typeof r === 'object' && r.instanceId != null && r.columnId != null) {
    return { ...r };
  }
  return null;
}

export class State {
  /** @type {'variance'|'mean'} */
  category = 'variance';
  /** @type {'one'|'two'|'paired'|'k'} */
  testType = 'one';
  /** @type {'two-sided'|'greater'|'less'} */
  direction = 'two-sided';
  /** @type {number|null} significance level; null until seeded from settings. */
  alpha = null;
  /** @type {number|null} desired power; null until seeded from settings. */
  powerGoal = null;
  /** @type {string} raw target input (σ²/σ, μ or μ_d₀), kept as string like the legacy. */
  targetValue = '';
  /** @type {'variance'|'stddev'} how the one-sample variance target is entered. */
  targetType = 'variance';
  /** @type {ColumnRef|null} */
  colRef1 = null;
  /** @type {ColumnRef|null} */
  colRef2 = null;
  /** @type {ColumnRef[]} */
  colRefsK = [];
  /** @type {string|null} worksheet provisioned by loadExample (tracked to clean up). */
  exampleWorksheetId = null;
  /**
   * Two-sample means: assume equal variances and run the pooled t-test.
   * Off by default — Welch is the default, without a variance pretest (C1-006).
   * @type {boolean}
   */
  equalVariances = false;

  /**
   * Resolve the one-sample target into an engine-ready value.
   * Variance: requires a positive number; `stddev` input is squared. Mean:
   * any finite number. Paired: the hypothesized difference μ_d₀, empty → 0.
   * Returns `null` when the input is invalid (caller hides results — matches
   * the legacy auto-analysis behaviour).
   * @returns {number|null}
   */
  resolveTarget() {
    if (this.testType === 'paired' && this.targetValue.trim() === '') return 0;
    const tv = parseFloat(this.targetValue);
    if (this.category === 'variance') {
      if (isNaN(tv) || tv <= 0) return null;
      return this.targetType === 'stddev' ? tv * tv : tv;
    }
    if (isNaN(tv)) return null;
    return tv;
  }

  /**
   * Set the power goal, clamped to [0.5, 0.99]. Non-numeric input is ignored
   * (keeps the previous value), mirroring the legacy input handler.
   * @param {number} v
   */
  setPowerGoal(v) {
    const n = parseFloat(v);
    if (isNaN(n)) return;
    this.powerGoal = Math.min(0.99, Math.max(0.5, n));
  }

  /**
   * Set the category. There is no paired variance test, so a paired
   * configuration falls back to two samples when switching to variance.
   * @param {'variance'|'mean'} cat
   */
  applyCategory(cat) {
    if (!CATEGORIES.includes(cat)) return;
    this.category = cat;
    if (cat === 'variance' && this.testType === 'paired') this.testType = 'two';
  }

  /** True when any column reference is selected (drives loadExample confirm). */
  hasContent() {
    return Boolean(this.colRef1 || this.colRef2 || (this.colRefsK && this.colRefsK.length));
  }

  toJSON() {
    return {
      category: this.category,
      testType: this.testType,
      direction: this.direction,
      alpha: this.alpha,
      powerGoal: this.powerGoal,
      targetValue: this.targetValue,
      targetType: this.targetType,
      colRef1: this.colRef1 ? { ...this.colRef1 } : null,
      colRef2: this.colRef2 ? { ...this.colRef2 } : null,
      colRefsK: Array.isArray(this.colRefsK) ? this.colRefsK.map(r => ({ ...r })) : [],
      exampleWorksheetId: this.exampleWorksheetId,
      equalVariances: this.equalVariances,
    };
  }

  /**
   * @param {object|null|undefined} d
   * @returns {State}
   */
  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;
    if (CATEGORIES.includes(d.category)) s.category = d.category;
    if (TEST_TYPES.includes(d.testType)) s.testType = d.testType;
    if (DIRECTIONS.includes(d.direction)) s.direction = d.direction;
    if (d.alpha != null && isFinite(d.alpha)) s.alpha = d.alpha;
    if (d.powerGoal != null && isFinite(d.powerGoal)) s.powerGoal = d.powerGoal;
    if (typeof d.targetValue === 'string') s.targetValue = d.targetValue;
    else if (typeof d.targetValue === 'number') s.targetValue = String(d.targetValue);
    if (TARGET_TYPES.includes(d.targetType)) s.targetType = d.targetType;
    s.colRef1 = refOrNull(d.colRef1);
    s.colRef2 = refOrNull(d.colRef2);
    s.colRefsK = Array.isArray(d.colRefsK) ? d.colRefsK.map(refOrNull).filter(Boolean) : [];
    s.exampleWorksheetId = d.exampleWorksheetId != null ? d.exampleWorksheetId : null;
    if (typeof d.equalVariances === 'boolean') s.equalVariances = d.equalVariances;
    if (s.category === 'variance' && s.testType === 'paired') s.testType = 'two';
    return s;
  }
}
