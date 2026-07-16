/**
 * D.Mike — Sample Size Model (sample-size-model.js)
 *
 * Pure state container for the Sample Size module. Holds user-entered
 * parameters. Contains no view logic, no i18n, and no computations.
 * The analysis result (nRequired, powerFn, curvePoints) is derived
 * transiently in the view layer.
 *
 * Persistenz-Shape matches legacy getState():
 * { category, testType, direction, alpha, power, sigma0, sigmaAlt, ratio, delta, sigma }
 */

const VALID_CATEGORIES = ['variance', 'mean'];
const VALID_TEST_TYPES = ['one', 'two'];
const VALID_DIRECTIONS = ['two-sided', 'greater', 'less'];

export class State {
  /** @type {'variance'|'mean'} */
  category = 'variance';

  /** @type {'one'|'two'} */
  testType = 'one';

  /** @type {'two-sided'|'greater'|'less'} */
  direction = 'two-sided';

  /**
   * Significance level alpha. null = "use global setting" (resolved in init()).
   * @type {number|null}
   */
  alpha = null;

  /**
   * Target power (1 - beta). null = "use global setting" (resolved in init()).
   * @type {number|null}
   */
  power = null;

  /** Hypothesized std dev σ₀ (one-sample variance). @type {string} */
  sigma0 = '';

  /** Expected std dev σ₁ (one-sample variance). @type {string} */
  sigmaAlt = '';

  /** Variance ratio σ²₁/σ²₂ (two-sample variance). @type {string} */
  ratio = '';

  /** Mean difference |μ − μ₀| or |μ₁ − μ₂|. @type {string} */
  delta = '';

  /** Standard deviation σ (mean tests). @type {string} */
  sigma = '';

  /**
   * Returns true when any input field has been filled — drives confirmPopout.
   * Note: alpha/power/category/direction changes alone don't count as "content".
   * @returns {boolean}
   */
  hasContent() {
    return Boolean(this.sigma0 || this.sigmaAlt || this.ratio || this.delta || this.sigma);
  }

  /**
   * Serialize to persistence shape (identical to legacy getState()).
   * @returns {object}
   */
  toJSON() {
    return {
      category:  this.category,
      testType:  this.testType,
      direction: this.direction,
      alpha:     this.alpha,
      power:     this.power,
      sigma0:    this.sigma0,
      sigmaAlt:  this.sigmaAlt,
      ratio:     this.ratio,
      delta:     this.delta,
      sigma:     this.sigma,
    };
  }

  /**
   * Deserialize and validate. Always returns a valid State, even for
   * null/undefined/malformed input.
   * @param {*} d
   * @returns {State}
   */
  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;

    s.category = VALID_CATEGORIES.includes(d.category) ? d.category : 'variance';
    s.testType = VALID_TEST_TYPES.includes(d.testType) ? d.testType : 'one';
    s.direction = VALID_DIRECTIONS.includes(d.direction) ? d.direction : 'two-sided';

    s.alpha = (d.alpha != null && typeof d.alpha === 'number' && isFinite(d.alpha)) ? d.alpha : null;
    s.power = (d.power != null && typeof d.power === 'number' && isFinite(d.power)) ? d.power : null;

    s.sigma0   = d.sigma0   != null ? String(d.sigma0)   : '';
    s.sigmaAlt = d.sigmaAlt != null ? String(d.sigmaAlt) : '';
    s.ratio    = d.ratio    != null ? String(d.ratio)    : '';
    s.delta    = d.delta    != null ? String(d.delta)    : '';
    s.sigma    = d.sigma    != null ? String(d.sigma)    : '';

    return s;
  }
}
