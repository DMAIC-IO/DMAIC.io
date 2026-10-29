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

/* Die erklärten Wertemengen der vier Aufzähl-Felder. Exportiert, damit die
   Setter des Viewmodels gegen DIESELBE Liste prüfen, die `fromJSON` schon
   benutzt — eine zweite Liste im Viewmodel wäre eine Parallelquelle, die
   driften kann, und ein Wert daneben rechnet im Modul stillschweigend den
   FALSCHEN Test (die Engines lesen `direction !== 'two-sided' && !==
   'greater'` als „less"). */
/** @type {readonly ('variance'|'mean')[]} */
export const CATEGORIES = Object.freeze(['variance', 'mean']);
/** @type {readonly ('one'|'two'|'paired'|'k')[]} */
export const TEST_TYPES = Object.freeze(['one', 'two', 'paired', 'k']);
/** @type {readonly ('two-sided'|'greater'|'less')[]} */
export const DIRECTIONS = Object.freeze(['two-sided', 'greater', 'less']);

/** Gültiger Bereich von α: mathematisch (0, 1); ungeprüfte, mathematisch begrenzte Werte bekommen ihre mathematische Grenze. */
export const ALPHA_BOUNDS = Object.freeze({ exclusiveMin: 0, exclusiveMax: 1 });
/** Gültiger Bereich des Power-Ziels: der bisherige Klemmbereich, jetzt Prüfbereich. */
export const POWER_GOAL_BOUNDS = Object.freeze({ min: 0.5, max: 0.99 });

/**
 * Eine gespeicherte Zahl (oder ein alter Zahlentext) im Bereich, sonst null.
 * @param {any} v
 * @param {{ min?: number, max?: number, exclusiveMin?: number, exclusiveMax?: number }} b
 * @returns {number|null}
 */
function numberIn(v, b) {
  const n = typeof v === 'number' ? v
    : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
  if (!Number.isFinite(n)) return null;
  if (b.min !== undefined && n < b.min) return null;
  if (b.max !== undefined && n > b.max) return null;
  if (b.exclusiveMin !== undefined && n <= b.exclusiveMin) return null;
  if (b.exclusiveMax !== undefined && n >= b.exclusiveMax) return null;
  return n;
}
/** @type {readonly ('variance'|'stddev')[]} */
export const TARGET_TYPES = Object.freeze(['variance', 'stddev']);

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
   * Set the category. There is no paired variance test, so a paired
   * configuration falls back to two samples when switching to variance.
   * @param {'variance'|'mean'} cat
   */
  applyCategory(cat) {
    if (!CATEGORIES.includes(cat)) return;
    this.category = cat;
    if (cat === 'variance' && this.testType === 'paired') this.testType = 'two';
  }

  /**
   * Set the test type. targetValue holds μ₀ / σ²₀ for one sample but μ_d₀ for
   * paired, so crossing into or out of paired clears it — a one-sample μ₀ of 100
   * must not silently become the hypothesized difference.
   * @param {'one'|'two'|'paired'|'k'} type
   */
  applyTestType(type) {
    if (!TEST_TYPES.includes(type)) return;
    if ((type === 'paired') !== (this.testType === 'paired')) this.targetValue = '';
    this.testType = type;
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
    s.alpha = numberIn(d.alpha, ALPHA_BOUNDS) ?? s.alpha;
    s.powerGoal = numberIn(d.powerGoal, POWER_GOAL_BOUNDS) ?? s.powerGoal;
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
