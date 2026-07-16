/**
 * D.Mike — Pairwise Comparison Model (pairwise-comparison-model.js)
 * Pure state + business logic: criteria, win/tie/loss matrix, ranking.
 * No DOM, no i18n, no view formatting.
 */

export const MAX_CRITERIA = 15;
export const MIN_CRITERIA = 3;

/** Fisher–Yates shuffle (in place). */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Build an n×n zero matrix. */
function makeMatrix(n) {
  return Array.from({ length: n }, () => Array(n).fill(0));
}

/** Randomized list of all unique index pairs [i,j] with i<j. */
function makePairs(n) {
  const pairs = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) pairs.push([i, j]);
  }
  return shuffle(pairs);
}

/** Row sums of the matrix, ignoring the diagonal. */
function computeScores(matrix) {
  const n = matrix.length;
  return Array.from({ length: n }, (_, i) => {
    let s = 0;
    for (let j = 0; j < n; j++) if (i !== j) s += matrix[i][j];
    return s;
  });
}

export class State {
  /** @type {string[]} */
  criteria = [];
  /** @type {number[][]} */
  matrix = [];
  /** @type {[number, number][]} */
  pairs = [];
  /** @type {number} */
  currentPair = 0;
  /** @type {'input'|'compare'|'results'} */
  viewPhase = 'input';

  // ── Raw derived getters ──
  get scores() { return computeScores(this.matrix); }
  get maxScore() { return Math.max(0, ...this.scores); }
  get pairCount() {
    const n = this.criteria.length;
    return n * (n - 1) / 2;
  }
  get ranked() {
    const sc = this.scores;
    return this.criteria
      .map((name, i) => ({ name, score: sc[i], idx: i }))
      .sort((a, b) => b.score - a.score);
  }
  get compareReachable() {
    return this.pairs.length > 0 && this.currentPair < this.pairs.length;
  }
  get resultsReachable() {
    return this.pairs.length > 0 && this.currentPair >= this.pairs.length;
  }

  hasContent() { return this.criteria.length > 0; }

  // ── Business logic ──
  /** @returns {'ok'|'empty'|'duplicate'|'max'} */
  addCriterion(value) {
    const v = String(value ?? '').trim();
    if (!v) return 'empty';
    if (this.criteria.includes(v)) return 'duplicate';
    if (this.criteria.length >= MAX_CRITERIA) return 'max';
    this.criteria.push(v);
    this._invalidate();
    return 'ok';
  }

  removeCriterion(idx) {
    if (idx < 0 || idx >= this.criteria.length) return;
    this.criteria.splice(idx, 1);
    this._invalidate();
  }

  /** A criteria change invalidates any prior comparison. */
  _invalidate() {
    this.matrix = [];
    this.pairs = [];
    this.currentPair = 0;
  }

  /** @returns {boolean} true if a comparison was started */
  startComparison() {
    const n = this.criteria.length;
    if (n < MIN_CRITERIA) return false;
    this.matrix = makeMatrix(n);
    this.pairs = makePairs(n);
    this.currentPair = 0;
    this.viewPhase = 'compare';
    return true;
  }

  choose(winnerIdx, loserIdx) {
    if (this.currentPair >= this.pairs.length) return;
    this.matrix[winnerIdx][loserIdx] = 1;
    this.matrix[loserIdx][winnerIdx] = 0;
    this._advance();
  }

  chooseTie(a, b) {
    if (this.currentPair >= this.pairs.length) return;
    this.matrix[a][b] = 0.5;
    this.matrix[b][a] = 0.5;
    this._advance();
  }

  _advance() {
    this.currentPair++;
    if (this.currentPair >= this.pairs.length) this.viewPhase = 'results';
  }

  /** Cycle a matrix cell 0 → 0.5 → 1 → 0 and mirror the opposite cell. */
  cycleCell(i, j) {
    const cur = this.matrix[i][j];
    const next = cur === 0 ? 0.5 : cur === 0.5 ? 1 : 0;
    this.matrix[i][j] = next;
    this.matrix[j][i] = next === 0.5 ? 0.5 : 1 - next;
  }

  // ── Persistence (shape identical to legacy getState) ──
  toJSON() {
    return {
      criteria: this.criteria.slice(),
      matrix: this.matrix.map((row) => row.slice()),
      pairs: this.pairs.map((p) => p.slice()),
      currentPair: this.currentPair,
      viewPhase: this.viewPhase,
    };
  }

  static fromJSON(d) {
    const s = new State();
    if (!d) return s;
    if (Array.isArray(d.criteria)) {
      s.criteria = d.criteria.filter((c) => typeof c === 'string');
    }
    if (Array.isArray(d.matrix)) {
      s.matrix = d.matrix.map((r) => (Array.isArray(r) ? r.slice() : []));
    }
    if (Array.isArray(d.pairs)) {
      s.pairs = d.pairs.map((p) => (Array.isArray(p) ? p.slice() : []));
    }
    if (Number.isInteger(d.currentPair)) s.currentPair = d.currentPair;
    if (d.viewPhase === 'input' || d.viewPhase === 'compare' || d.viewPhase === 'results') {
      s.viewPhase = d.viewPhase;
    }
    return s;
  }
}
