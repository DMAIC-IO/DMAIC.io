/**
 * D.Mike — RACI Matrix Model (raci-matrix-model.js)
 *
 * Pure state + business logic for the RACI responsibility matrix.
 * No DOM, no i18n, no CSS classes, no view getters — those live in the data-fn.
 *
 * Persisted shape (toJSON / fromJSON), unchanged from the legacy module:
 *   {
 *     activities: string[],
 *     stakeholders: string[],
 *     assignments: Record<"a:s", "R"|"A"|"C"|"I">
 *   }
 */

/** The four RACI roles, in cycle order. */
export const ROLES = ['R', 'A', 'C', 'I'];

/** Max input length for activity / stakeholder labels (mirrors legacy maxlength). */
export const ACTIVITY_MAXLEN = 200;
export const STAKEHOLDER_MAXLEN = 120;

export class State {
  /** @type {string[]} activity (row) labels */
  activities = [];
  /** @type {string[]} stakeholder (column) labels */
  stakeholders = [];
  /** @type {Record<string, "R"|"A"|"C"|"I">} sparse role map keyed "a:s" */
  assignments = {};

  // ─── Keys & roles ───────────────────────────────────────────

  /** @returns {string} cell key */
  key(aIdx, sIdx) { return `${aIdx}:${sIdx}`; }

  /** @returns {string} role at (a,s) or '' when unset */
  getRole(aIdx, sIdx) {
    return this.assignments[this.key(aIdx, sIdx)] || '';
  }

  /** Set / clear a cell role. Falsy role clears the cell. */
  setRole(aIdx, sIdx, role) {
    const k = this.key(aIdx, sIdx);
    if (role) {
      this.assignments[k] = role;
    } else {
      delete this.assignments[k];
    }
  }

  /** Cycle a cell: '' → R → A → C → I → '' */
  cycleRole(aIdx, sIdx) {
    const current = this.getRole(aIdx, sIdx);
    const idx = ROLES.indexOf(current);
    const next = idx < 0 ? ROLES[0] : (idx + 1 >= ROLES.length ? '' : ROLES[idx + 1]);
    this.setRole(aIdx, sIdx, next);
  }

  // ─── Structure mutations ────────────────────────────────────

  /** Append an activity (trimmed). Empty / blank input is ignored. */
  addActivity(text) {
    const v = (text || '').trim();
    if (!v) return;
    this.activities.push(v);
  }

  /** Append a stakeholder (trimmed). Empty / blank input is ignored. */
  addStakeholder(text) {
    const v = (text || '').trim();
    if (!v) return;
    this.stakeholders.push(v);
  }

  /** Commit a renamed activity (trimmed, non-empty). No-op otherwise. */
  renameActivity(idx, value) {
    const v = (value || '').trim();
    if (v) this.activities[idx] = v;
  }

  /** Commit a renamed stakeholder (trimmed, non-empty). No-op otherwise. */
  renameStakeholder(idx, value) {
    const v = (value || '').trim();
    if (v) this.stakeholders[idx] = v;
  }

  /** Remove activity row idx, dropping & reindexing its assignments. */
  removeActivity(idx) {
    const newAssign = {};
    Object.entries(this.assignments).forEach(([k, v]) => {
      const [a, s] = k.split(':').map(Number);
      if (a === idx) return;
      const newA = a > idx ? a - 1 : a;
      newAssign[`${newA}:${s}`] = v;
    });
    this.activities.splice(idx, 1);
    this.assignments = newAssign;
  }

  /** Remove stakeholder column idx, dropping & reindexing its assignments. */
  removeStakeholder(idx) {
    const newAssign = {};
    Object.entries(this.assignments).forEach(([k, v]) => {
      const [a, s] = k.split(':').map(Number);
      if (s === idx) return;
      const newS = s > idx ? s - 1 : s;
      newAssign[`${a}:${newS}`] = v;
    });
    this.stakeholders.splice(idx, 1);
    this.assignments = newAssign;
  }

  /** Move an activity from index `from` to `to`, reindexing assignments. */
  moveActivity(from, to) {
    if (from === to) return;
    const acts = this.activities;
    const [item] = acts.splice(from, 1);
    acts.splice(to, 0, item);

    const newAssign = {};
    Object.entries(this.assignments).forEach(([k, v]) => {
      const [a, s] = k.split(':').map(Number);
      let newA = a;
      if (a === from) {
        newA = to;
      } else if (from < to) {
        if (a > from && a <= to) newA = a - 1;
      } else if (a >= to && a < from) newA = a + 1;
      newAssign[`${newA}:${s}`] = v;
    });
    this.assignments = newAssign;
  }

  // ─── Validation ─────────────────────────────────────────────

  /**
   * Per-activity validation. Returns an array of { aIdx, issues[] } for
   * every row that has at least one issue. Issues: 'noR', 'noA', 'multiA'.
   * @returns {{aIdx:number, issues:string[]}[]}
   */
  validate() {
    const warnings = [];
    this.activities.forEach((_, aIdx) => {
      const issues = [];
      const rolesInRow = {};
      this.stakeholders.forEach((__, sIdx) => {
        const r = this.getRole(aIdx, sIdx);
        if (r) rolesInRow[r] = (rolesInRow[r] || 0) + 1;
      });
      if (!rolesInRow.R) issues.push('noR');
      if (!rolesInRow.A) issues.push('noA');
      if ((rolesInRow.A || 0) > 1) issues.push('multiA');
      if (issues.length) warnings.push({ aIdx, issues });
    });
    return warnings;
  }

  // ─── loadExample guard ──────────────────────────────────────

  /** @returns {boolean} true when any activity or stakeholder is present */
  hasContent() {
    return (this.activities?.length || 0) + (this.stakeholders?.length || 0) > 0;
  }

  // ─── Serialization ──────────────────────────────────────────

  toJSON() {
    return {
      activities: [...this.activities],
      stakeholders: [...this.stakeholders],
      assignments: { ...this.assignments },
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
    if (Array.isArray(d.activities)) s.activities = [...d.activities];
    if (Array.isArray(d.stakeholders)) s.stakeholders = [...d.stakeholders];
    if (d.assignments && typeof d.assignments === 'object' && !Array.isArray(d.assignments)) {
      s.assignments = { ...d.assignments };
    }
    return s;
  }
}
