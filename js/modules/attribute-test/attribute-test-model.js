/**
 * D.Mike — Attribute Test Module — Model (attribute-test-model.js)
 *
 * Persistent configuration only. Summary inputs are kept as the raw strings
 * the user typed; the normalizer parses them. Both input modes are kept, so
 * switching modes or test kinds never loses data.
 */

/** @typedef {{ instanceId: string, sheetId?: string, columnId: string }} ColumnRef */

export const TEST_KINDS = ['one', 'two', 'equiv', 'mcnemar', 'rate1', 'rate2', 'assoc'];
const INPUT_MODES = ['summary', 'columns'];
const DIRECTIONS = ['two-sided', 'greater', 'less'];
const MIN_DIM = 2;

function refOrNull(r) {
  if (r && typeof r === 'object' && r.instanceId != null && r.columnId != null) return { ...r };
  return null;
}

const str = (v, fallback = '') => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : fallback);

function defaultTable() {
  return { rows: ['A', 'B'], cols: ['X', 'Y'], counts: [['', ''], ['', '']] };
}

function sanitizeTable(t) {
  if (!t || !Array.isArray(t.rows) || !Array.isArray(t.cols) || !Array.isArray(t.counts)) return defaultTable();
  const rows = t.rows.map(v => str(v));
  const cols = t.cols.map(v => str(v));
  if (rows.length < MIN_DIM || cols.length < MIN_DIM || t.counts.length !== rows.length) return defaultTable();
  const counts = t.counts.map(row => (Array.isArray(row) && row.length === cols.length ? row.map(v => str(v)) : null));
  if (counts.some(r => r == null)) return defaultTable();
  return { rows, cols, counts };
}

function defaultPairs() {
  return { labels: { before: '', after: '' }, counts: [['', ''], ['', '']] };
}

function sanitizePairs(p) {
  const out = defaultPairs();
  if (!p || typeof p !== 'object') return out;
  if (p.labels && typeof p.labels === 'object') {
    out.labels = { before: str(p.labels.before), after: str(p.labels.after) };
  }
  const c = p.counts;
  const valid = Array.isArray(c) && c.length === 2
    && c.every(row => Array.isArray(row) && row.length === 2 && row.every(v => typeof v === 'string'));
  if (valid) out.counts = c.map(row => [...row]);
  return out;
}

const SUMMARY_KEYS = ['x', 'n', 'x1', 'n1', 'x2', 'n2', 't', 't1', 't2', 'lambda0'];
const COL_REF_KEYS = ['response', 'group', 'rowVar', 'colVar', 'counts', 'before', 'after'];

export class State {
  /** @type {'one'|'two'|'equiv'|'mcnemar'|'rate1'|'rate2'|'assoc'} */
  testKind = 'two';
  /** @type {'summary'|'columns'} */
  inputMode = 'summary';
  /** @type {'two-sided'|'greater'|'less'} */
  direction = 'two-sided';
  /** @type {number|null} significance level; null until seeded from settings */
  alpha = null;
  /** @type {string} hypothesized proportion (raw input) */
  p0 = '0.5';
  /** @type {boolean} pooled SE for the 2-proportion z statistic */
  pooled = false;
  /** @type {boolean} pooled estimate for the 2-rate z statistic (separate from `pooled`) */
  ratePooled = false;
  /** Equivalence settings; bounds are raw strings in percentage points. */
  equiv = { samples: 2, symmetric: true, delta: '', lower: '', upper: '' };
  /** @type {string} exposure per worksheet row in the rate column modes (raw input) */
  exposurePerRow = '1';
  summary = {
    x: '', n: '', x1: '', n1: '', x2: '', n2: '',
    t: '', t1: '', t2: '', lambda0: '', diff0: '0',
    pairs: defaultPairs(),
    table: defaultTable(),
  };
  /** @type {Record<'response'|'group'|'rowVar'|'colVar'|'counts'|'before'|'after', ColumnRef|null>} */
  colRefs = {
    response: null, group: null, rowVar: null, colVar: null, counts: null, before: null, after: null,
  };
  /** @type {string|null} value of the response column that counts as event */
  eventValue = null;
  /** @type {string|null} worksheet provisioned by loadExample */
  exampleWorksheetId = null;

  /** True when any input exists (drives the loadExample overwrite prompt). */
  hasContent() {
    const s = this.summary;
    const filled = v => String(v).trim() !== '';
    const anyCount = [...SUMMARY_KEYS.map(k => s[k]), this.equiv.delta, this.equiv.lower, this.equiv.upper].some(filled)
      || (filled(s.diff0) && String(s.diff0).trim() !== '0')
      || s.table.counts.some(row => row.some(filled))
      || s.pairs.counts.some(row => row.some(filled));
    return anyCount || Object.values(this.colRefs).some(Boolean);
  }

  addRow() {
    const t = this.summary.table;
    t.rows.push(String.fromCharCode(65 + t.rows.length));
    t.counts.push(t.cols.map(() => ''));
  }

  addCol() {
    const t = this.summary.table;
    const n = t.cols.length;
    t.cols.push(n < 3 ? 'XYZ'[n] : `C${n + 1}`);
    for (const row of t.counts) row.push('');
  }

  /** @param {number} i */
  removeRow(i) {
    const t = this.summary.table;
    if (t.rows.length <= MIN_DIM) return;
    t.rows.splice(i, 1);
    t.counts.splice(i, 1);
  }

  /** @param {number} j */
  removeCol(j) {
    const t = this.summary.table;
    if (t.cols.length <= MIN_DIM) return;
    t.cols.splice(j, 1);
    for (const row of t.counts) row.splice(j, 1);
  }

  /**
   * Switch to the equivalence test with 2 samples. The counts and column
   * refs are shared with the 2-proportion test, so nothing is copied; the
   * bounds stay untouched.
   */
  switchToEquivalence() {
    this.testKind = 'equiv';
    this.equiv.samples = 2;
  }

  toJSON() {
    const t = this.summary.table;
    return {
      testKind: this.testKind,
      inputMode: this.inputMode,
      direction: this.direction,
      alpha: this.alpha,
      p0: this.p0,
      pooled: this.pooled,
      ratePooled: this.ratePooled,
      equiv: { ...this.equiv },
      exposurePerRow: this.exposurePerRow,
      summary: {
        ...Object.fromEntries(SUMMARY_KEYS.map(k => [k, this.summary[k]])),
        diff0: this.summary.diff0,
        pairs: {
          labels: { ...this.summary.pairs.labels },
          counts: this.summary.pairs.counts.map(r => [...r]),
        },
        table: { rows: [...t.rows], cols: [...t.cols], counts: t.counts.map(r => [...r]) },
      },
      colRefs: Object.fromEntries(COL_REF_KEYS.map(k => [k, refOrNull(this.colRefs[k])])),
      eventValue: this.eventValue,
      exampleWorksheetId: this.exampleWorksheetId,
    };
  }

  /**
   * @param {object|null|undefined} d
   * @returns {State}
   */
  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;
    if (TEST_KINDS.includes(d.testKind)) s.testKind = d.testKind;
    if (INPUT_MODES.includes(d.inputMode)) s.inputMode = d.inputMode;
    if (DIRECTIONS.includes(d.direction)) s.direction = d.direction;
    if (d.alpha != null && Number.isFinite(d.alpha)) s.alpha = d.alpha;
    s.p0 = str(d.p0, '0.5');
    if (typeof d.pooled === 'boolean') s.pooled = d.pooled;
    const sm = d.summary && typeof d.summary === 'object' ? d.summary : {};
    for (const k of SUMMARY_KEYS) s.summary[k] = str(sm[k]);
    s.summary.diff0 = str(sm.diff0, '0');
    s.summary.pairs = sanitizePairs(sm.pairs);
    s.summary.table = sanitizeTable(sm.table);
    const cr = d.colRefs && typeof d.colRefs === 'object' ? d.colRefs : {};
    for (const k of COL_REF_KEYS) s.colRefs[k] = refOrNull(cr[k]);
    if (typeof d.ratePooled === 'boolean') s.ratePooled = d.ratePooled;
    s.exposurePerRow = str(d.exposurePerRow, '1');
    const eq = d.equiv && typeof d.equiv === 'object' ? d.equiv : {};
    s.equiv = {
      samples: eq.samples === 1 ? 1 : 2,
      symmetric: typeof eq.symmetric === 'boolean' ? eq.symmetric : true,
      delta: str(eq.delta), lower: str(eq.lower), upper: str(eq.upper),
    };
    s.eventValue = typeof d.eventValue === 'string' ? d.eventValue : null;
    s.exampleWorksheetId = d.exampleWorksheetId != null ? d.exampleWorksheetId : null;
    return s;
  }
}
