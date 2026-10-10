/**
 * D.Mike — Attribute Test Module — Model (attribute-test-model.js)
 *
 * Persistent configuration only. Summary inputs are kept as the raw strings
 * the user typed; the normalizer parses them. Both input modes are kept, so
 * switching modes or test kinds never loses data.
 */

/** @typedef {{ instanceId: string, sheetId?: string, columnId: string }} ColumnRef */

const TEST_KINDS = ['one', 'two', 'assoc'];
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

export class State {
  /** @type {'one'|'two'|'assoc'} */
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
  summary = { x: '', n: '', x1: '', n1: '', x2: '', n2: '', table: defaultTable() };
  /** @type {{ response: ColumnRef|null, group: ColumnRef|null, rowVar: ColumnRef|null, colVar: ColumnRef|null }} */
  colRefs = { response: null, group: null, rowVar: null, colVar: null };
  /** @type {string|null} value of the response column that counts as event */
  eventValue = null;
  /** @type {string|null} worksheet provisioned by loadExample */
  exampleWorksheetId = null;

  /** True when any input exists (drives the loadExample overwrite prompt). */
  hasContent() {
    const s = this.summary;
    const anyCount = [s.x, s.n, s.x1, s.n1, s.x2, s.n2].some(v => String(v).trim() !== '')
      || s.table.counts.some(row => row.some(v => String(v).trim() !== ''));
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

  toJSON() {
    const t = this.summary.table;
    return {
      testKind: this.testKind,
      inputMode: this.inputMode,
      direction: this.direction,
      alpha: this.alpha,
      p0: this.p0,
      pooled: this.pooled,
      summary: {
        x: this.summary.x, n: this.summary.n,
        x1: this.summary.x1, n1: this.summary.n1, x2: this.summary.x2, n2: this.summary.n2,
        table: { rows: [...t.rows], cols: [...t.cols], counts: t.counts.map(r => [...r]) },
      },
      colRefs: {
        response: refOrNull(this.colRefs.response),
        group: refOrNull(this.colRefs.group),
        rowVar: refOrNull(this.colRefs.rowVar),
        colVar: refOrNull(this.colRefs.colVar),
      },
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
    for (const k of ['x', 'n', 'x1', 'n1', 'x2', 'n2']) s.summary[k] = str(sm[k]);
    s.summary.table = sanitizeTable(sm.table);
    const cr = d.colRefs && typeof d.colRefs === 'object' ? d.colRefs : {};
    for (const k of ['response', 'group', 'rowVar', 'colVar']) s.colRefs[k] = refOrNull(cr[k]);
    s.eventValue = typeof d.eventValue === 'string' ? d.eventValue : null;
    s.exampleWorksheetId = d.exampleWorksheetId != null ? d.exampleWorksheetId : null;
    return s;
  }
}
