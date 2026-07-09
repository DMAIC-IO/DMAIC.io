/**
 * D.Mike — Control Chart Model (control-chart-model.js)
 *
 * Pure state + thin business helpers for the variable-data SPC Control Chart
 * module (I-MR / X̄-R / X̄-S). All heavy computation (limits, Nelson rules,
 * capability) lives in `engines/control-chart-engine.js` and is delegated to
 * from the view controller — this model owns only persistence-relevant state
 * and the small module-specific helpers (stage parsing, excluded-index list,
 * subgroup-size clamping on chart-type change, phase-II freeze extraction).
 *
 * No DOM, no i18n, no CSS, no view flags.
 */

import { getChartType, DEFAULT_ENABLED_RULES } from '../../engines/control-chart-engine.js';

export class State {
  /** @type {string} */
  chartTypeId = 'i-mr';
  /** @type {number} */
  subgroupSize = 1;
  /** @type {object|null} worksheet column reference */
  columnRef = null;
  /** @type {number|null} baseline point count (null = all) */
  baselineCount = null;
  /** @type {string} user-typed stages spec ("12, 25") */
  stagesText = '';
  /** @type {number|null} upper spec limit */
  usl = null;
  /** @type {number|null} lower spec limit */
  lsl = null;
  /** @type {number[]} enabled Nelson rule ids */
  enabledRules = [...DEFAULT_ENABLED_RULES];
  /** @type {Object<number, {comment: string, excluded: boolean}>} */
  annotations = {};
  /** @type {object|null} frozen limits for Phase-II monitoring */
  frozenLimits = null;
  /** @type {string|null} worksheet provisioned by loadExample */
  exampleWorksheetId = null;

  // ── Business / helper logic ───────────────────────────────

  /** confirmPopout content check — matches legacy `!!this._columnRef`. */
  hasContent() {
    return Boolean(this.columnRef);
  }

  /**
   * Parse a comma-/whitespace-/semicolon-separated string of stage end
   * indices into a sorted, deduplicated array of positive ints. [] for
   * empty/invalid input.
   * @param {string} s
   * @returns {number[]}
   */
  static parseStages(s) {
    if (!s || typeof s !== 'string') return [];
    const out = [];
    for (const part of s.split(/[,;\s]+/)) {
      if (!part) continue;
      const v = parseInt(part, 10);
      if (Number.isFinite(v) && v > 0) out.push(v);
    }
    return [...new Set(out)].sort((a, b) => a - b);
  }

  /** Indices flagged `excluded` in the annotations map. */
  excludedIndices() {
    return Object.keys(this.annotations)
      .map(Number)
      .filter(k => this.annotations[k]?.excluded);
  }

  /**
   * Switch chart type and clamp the subgroup size into the new type's valid
   * range (forcing n=1 for the single-value I-MR chart). Unknown ids are
   * ignored. Returns true if the type changed.
   * @param {string} id
   * @returns {boolean}
   */
  setChartType(id) {
    const ct = getChartType(id);
    if (!ct) return false;
    this.chartTypeId = id;
    if (ct.minSubgroupSize === ct.maxSubgroupSize) {
      this.subgroupSize = ct.minSubgroupSize;
    } else {
      this.subgroupSize = Math.max(
        ct.minSubgroupSize,
        Math.min(ct.maxSubgroupSize, this.subgroupSize),
      );
    }
    return true;
  }

  /**
   * Build the frozen-limits payload for Phase-II monitoring from a completed
   * analysis result. Pure given `lastResult`. The caller is responsible for
   * guarding against missing data / active stages.
   * @param {{ ct: object, result: object, baselineEnd: number }} lastResult
   * @returns {object} frozen limits
   */
  buildFrozenLimits(lastResult) {
    const ct = lastResult.ct;
    const primary = lastResult.result.subcharts[ct.subcharts[0].id];
    const secondary = lastResult.result.subcharts[ct.subcharts[1].id];
    const grab = (sc) => ({ cl: sc.cl, ucl: sc.ucl, lcl: sc.lcl, sigma: sc.sigma });
    return {
      chartTypeId: this.chartTypeId,
      subgroupSize: this.subgroupSize,
      columnRef: this.columnRef,
      baselineEnd: lastResult.baselineEnd,
      primary: grab(primary),
      secondary: grab(secondary),
      excludedIndices: this.excludedIndices(),
    };
  }

  // ── Persistence ───────────────────────────────────────────

  toJSON() {
    // JSON round-trip detaches Alpine reactive proxies: at runtime the view
    // mutates `enabledRules`/`annotations`/`frozenLimits`/`columnRef` directly
    // on the reactive model, so returning them by reference yields Proxy values
    // → structuredClone() (called on the persist path) throws DataCloneError →
    // the persist is silently dropped and state is lost on reload/language-change.
    // The State is all primitives/arrays/plain objects, so the round-trip is
    // lossless and produces an identical-shape but fully-plain object.
    return JSON.parse(JSON.stringify({
      chartTypeId: this.chartTypeId,
      subgroupSize: this.subgroupSize,
      columnRef: this.columnRef,
      baselineCount: this.baselineCount,
      stagesText: this.stagesText,
      usl: this.usl,
      lsl: this.lsl,
      enabledRules: this.enabledRules,
      annotations: this.annotations,
      frozenLimits: this.frozenLimits,
      exampleWorksheetId: this.exampleWorksheetId,
    }));
  }

  /**
   * @param {object|null|undefined} d
   * @returns {State}
   */
  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;

    if (typeof d.chartTypeId === 'string' && getChartType(d.chartTypeId)) {
      s.chartTypeId = d.chartTypeId;
    }
    if (Number.isFinite(d.subgroupSize) && d.subgroupSize > 0) {
      s.subgroupSize = d.subgroupSize;
    }
    s.columnRef = (d.columnRef && typeof d.columnRef === 'object') ? d.columnRef : null;
    s.baselineCount = Number.isFinite(d.baselineCount) ? d.baselineCount : null;
    s.stagesText = typeof d.stagesText === 'string' ? d.stagesText : '';
    s.usl = Number.isFinite(d.usl) ? d.usl : null;
    s.lsl = Number.isFinite(d.lsl) ? d.lsl : null;
    s.enabledRules = Array.isArray(d.enabledRules)
      ? d.enabledRules.filter(r => Number.isFinite(r))
      : [...DEFAULT_ENABLED_RULES];
    s.annotations = (d.annotations && typeof d.annotations === 'object' && !Array.isArray(d.annotations))
      ? d.annotations
      : {};
    s.frozenLimits = (d.frozenLimits && typeof d.frozenLimits === 'object') ? d.frozenLimits : null;
    s.exampleWorksheetId = (typeof d.exampleWorksheetId === 'string') ? d.exampleWorksheetId : null;
    return s;
  }
}
