/**
 * D.Mike — C&E Matrix Model (ce-matrix-model.js)
 *
 * Pure state + business logic for the Cause & Effect (X-Y) Matrix.
 * No DOM, no i18n, no CSS classes, no view getters — those live in the data-fn.
 *
 * Persisted shape (toJSON / fromJSON):
 *   { inputs: string[], outputs: string[], scores: Record<"r-c", number>,
 *     weights: number[], scale: string }
 * Data saved before `scale` existed loads with the default 0–10 scale.
 */

/**
 * Rating scale presets: id → allowed ratings (finding B1-015). The book
 * rates on 0–10 or on the discrete steps 0/1/3/9 and 0/3/7/10.
 */
export const RATING_SCALES = {
  '0-10': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  '0-1-3-9': [0, 1, 3, 9],
  '0-3-7-10': [0, 3, 7, 10],
};

/** Default rating scale id. */
export const DEFAULT_SCALE = '0-10';

/** Clamp a raw weight to the valid 1..10 range, defaulting invalid input to 1. */
function clampWeight(w) {
  const n = parseInt(w, 10);
  if (isNaN(n)) return 1;
  return Math.max(1, Math.min(10, n));
}

export class State {
  /** @type {string[]} input (X) row labels */
  inputs = ['Input 1', 'Input 2', 'Input 3'];
  /** @type {string[]} output (Y) column labels */
  outputs = ['Output 1', 'Output 2', 'Output 3'];
  /** @type {Record<string, number>} sparse score map keyed "r-c" → rating */
  scores = {};
  /** @type {string} rating scale id, key of RATING_SCALES */
  scale = DEFAULT_SCALE;
  /** @type {number[]} customer-importance weight per output (1..10) */
  weights = [1, 1, 1];

  // ─── Keys & scores ──────────────────────────────────────────

  /** @returns {string} cell key */
  key(r, c) { return `${r}-${c}`; }

  /** @returns {number} score at (r,c) or 0 when unset */
  getScore(r, c) {
    const v = this.scores[this.key(r, c)];
    return v !== undefined ? v : 0;
  }

  /**
   * Set / clear a cell score. Empty / null / NaN clears the cell. A rating
   * outside the active scale is rejected and the cell keeps its value —
   * never silently clamped (finding B1-015).
   * @returns {boolean} false when the rating was rejected
   */
  setScore(r, c, val) {
    const k = this.key(r, c);
    if (val === '' || val === null || val === undefined) {
      delete this.scores[k];
      return true;
    }
    const v = Number(val);
    if (Number.isNaN(v)) { delete this.scores[k]; return true; }
    if (!this.allowedScores().includes(v)) return false;
    this.scores[k] = v;
    return true;
  }

  /** @returns {number[]} ratings allowed by the active scale */
  allowedScores() {
    return RATING_SCALES[this.scale] || RATING_SCALES[DEFAULT_SCALE];
  }

  /**
   * Switch the rating scale. Existing ratings are kept; ratings the new
   * scale does not allow are reported via `offScaleCount()` / `isOnScale()`.
   * @param {string} id key of RATING_SCALES
   * @returns {boolean} false for an unknown id
   */
  setScale(id) {
    if (!Object.hasOwn(RATING_SCALES, id)) return false;
    this.scale = id;
    return true;
  }

  /** @returns {boolean} the stored rating at (r,c) is allowed (unset counts as allowed) */
  isOnScale(r, c) {
    const v = this.scores[this.key(r, c)];
    return v === undefined || this.allowedScores().includes(v);
  }

  /** @returns {number} stored ratings that the active scale does not allow */
  offScaleCount() {
    const allowed = this.allowedScores();
    return Object.values(this.scores).filter(v => !allowed.includes(v)).length;
  }

  /** @returns {number} weight for output c, defaulting to 1 */
  getWeight(c) {
    return this.weights[c] ?? 1;
  }

  // ─── Weighted scoring ───────────────────────────────────────

  /** @returns {number} Σ(score · weight) over all outputs for input r */
  rowSum(r) {
    let s = 0;
    for (let c = 0; c < this.outputs.length; c++) {
      s += this.getScore(r, c) * this.getWeight(c);
    }
    return s;
  }

  /** @returns {number} Σ(score · weight) over all inputs for output c */
  colSum(c) {
    let s = 0;
    const w = this.getWeight(c);
    for (let r = 0; r < this.inputs.length; r++) s += this.getScore(r, c) * w;
    return s;
  }

  /** @returns {number} Σ of all row sums */
  grandTotal() {
    let total = 0;
    for (let r = 0; r < this.inputs.length; r++) total += this.rowSum(r);
    return total;
  }

  // ─── Structure mutations ────────────────────────────────────

  /** Append a new input row labelled "Input N". */
  addInput() {
    this.inputs.push(`Input ${this.inputs.length + 1}`);
  }

  /** Append a new output column labelled "Output N" with weight 1. */
  addOutput() {
    this.outputs.push(`Output ${this.outputs.length + 1}`);
    this.weights.push(1);
  }

  /** Remove input row r, reindexing scores. Keeps at least one row. */
  removeInput(r) {
    if (this.inputs.length <= 1) return;
    const ns = {};
    for (let ri = 0; ri < this.inputs.length; ri++) {
      if (ri === r) continue;
      const nr = ri > r ? ri - 1 : ri;
      for (let c = 0; c < this.outputs.length; c++) {
        const v = this.scores[this.key(ri, c)];
        if (v !== undefined) ns[this.key(nr, c)] = v;
      }
    }
    this.inputs.splice(r, 1);
    this.scores = ns;
  }

  /** Remove output column c, reindexing scores and splicing its weight. Keeps at least one column. */
  removeOutput(c) {
    if (this.outputs.length <= 1) return;
    const ns = {};
    for (let r = 0; r < this.inputs.length; r++) {
      for (let ci = 0; ci < this.outputs.length; ci++) {
        if (ci === c) continue;
        const nc = ci > c ? ci - 1 : ci;
        const v = this.scores[this.key(r, ci)];
        if (v !== undefined) ns[this.key(r, nc)] = v;
      }
    }
    this.outputs.splice(c, 1);
    this.weights.splice(c, 1);
    this.scores = ns;
  }

  // ─── loadExample guard ──────────────────────────────────────

  /** @returns {boolean} true when any input or output is present */
  hasContent() {
    return (this.inputs?.length || 0) + (this.outputs?.length || 0) > 0;
  }

  // ─── Serialization ──────────────────────────────────────────

  toJSON() {
    return {
      inputs: [...this.inputs],
      outputs: [...this.outputs],
      scores: { ...this.scores },
      weights: [...this.weights],
      scale: this.scale,
    };
  }

  /**
   * Deserialize, validating each field and always returning a usable default.
   * @param {object|null|undefined} d
   * @returns {State}
   */
  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;

    if (Array.isArray(d.inputs)) s.inputs = [...d.inputs];
    if (Array.isArray(d.outputs)) s.outputs = [...d.outputs];

    if (d.scores && typeof d.scores === 'object') {
      s.scores = { ...d.scores };
    } else {
      s.scores = {};
    }

    if (Array.isArray(d.weights)) {
      s.weights = d.weights.map(clampWeight);
    } else {
      s.weights = [];
    }
    if (typeof d.scale === 'string') s.setScale(d.scale);

    // Pad weights to match the output count (legacy seeded defaults to 1).
    while (s.weights.length < s.outputs.length) s.weights.push(1);

    return s;
  }
}
