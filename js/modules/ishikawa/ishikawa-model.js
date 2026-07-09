/**
 * D.Mike — Ishikawa 6M Model (ishikawa-model.js)
 *
 * Pure business logic + state for the Cause & Effect (Fishbone) toolkit:
 * a fixed-depth cause tree (flat `rows[]` with `parentId`), expert scoring,
 * snapshots + diff, experiments, facts, problem statement and image galleries.
 *
 * No DOM, no i18n, no CSS, no view flags. View transformations (category i18n
 * labels, CSS classes, rating-cell colours, '–' formatting) live in the
 * module's data-fn. Transient UI state (active tab, collapsed set, filter,
 * compare selection) also lives in the data-fn, never here.
 *
 * Persistence shape matches the legacy `getState()` exactly:
 *   { problem,
 *     experts:   [ { id, name, color } ],
 *     catLabels: { [catKey]: string },
 *     rows:      [ { id, stableId, parentId, category, name, description,
 *                    ratings: { [expertId]: number }, status } ],
 *     snapshots: [ { id, name, date, data: { problem, experts, rows } } ],
 *     experiments: [ { id, title, description, responsible, status,
 *                      startDate, endDate, costMoney, costHours, hypothesisIds:[] } ],
 *     facts:     [ { id, name, description, date, owner } ],
 *     images:    { inScope: [ { id, dataUrl, caption } ], outScope: [ … ] } }
 *
 * 🔴 toJSON() deep-copies its WHOLE return (JSON round-trip) so the Alpine
 * reactive proxy never reaches the persist path's structuredClone.
 */

import { EXP_COLS } from './ishikawa-constants.js';

/** CSS depth class clamp (`ishikawa__depth-{0..3}`). */
export const MAX_DEPTH_CLASS = 3;

/** Deep-copy a JSON-safe value (also strips any Alpine proxy). */
function clone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

/** @param {*} v @returns {string} */
function asStr(v) {
  return typeof v === 'string' ? v : '';
}

/** @param {*} v @returns {number} */
function asNum(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export class State {
  problem = '';
  /** @type {Array<{id:number,name:string,color:string}>} */
  experts = [];
  /** @type {Object<string,string>} */
  catLabels = {};
  /** @type {Array<object>} flat cause tree (rows carry parentId) */
  rows = [];
  /** @type {Array<object>} */
  snapshots = [];
  /** @type {Array<object>} */
  experiments = [];
  /** @type {Array<object>} */
  facts = [];
  /** @type {{inScope:Array<object>, outScope:Array<object>}} */
  images = { inScope: [], outScope: [] };

  // id counters (transient — recomputed from data on fromJSON)
  _idC = 0;
  _expIdC = 0;
  _snapIdC = 0;
  _xpIdC = 0;
  _factIdC = 0;
  _imgIdC = 0;
  _stableIdC = 0;

  // ── id generators ─────────────────────────────────────────

  _uid() { return ++this._idC; }
  _eUid() { return ++this._expIdC; }
  _sUid() { return ++this._snapIdC; }
  _xUid() { return ++this._xpIdC; }
  _fUid() { return ++this._factIdC; }
  _imgUid() { return ++this._imgIdC; }
  _nextStableId() { this._stableIdC++; return `H-${  String(this._stableIdC).padStart(3, '0')}`; }

  // ── Content ───────────────────────────────────────────────

  /** @returns {boolean} true if a problem statement or any cause row exists */
  hasContent() {
    return Boolean(this.problem) || this.rows.length > 0;
  }

  // ── Tree helpers ──────────────────────────────────────────

  /** @returns {number} ancestor count of a row */
  getDepth(r) {
    let d = 0, c = r;
    while (c && c.parentId !== null) {
      c = this.rows.find(x => x.id === c.parentId);
      if (!c) break;
      d++;
    }
    return d;
  }

  /** @returns {boolean} */
  hasKids(id) { return this.rows.some(r => r.parentId === id); }

  /** @returns {number[]} all descendant ids of `id` */
  descIds(id) {
    const o = [];
    this.rows.filter(r => r.parentId === id).forEach(c => {
      o.push(c.id);
      o.push(...this.descIds(c.id));
    });
    return o;
  }

  /** @returns {string} effective category (own, or inherited from ancestor) */
  effCat(r) {
    if (!r) return '';
    if (r.category) return r.category;
    if (r.parentId !== null) {
      const p = this.rows.find(x => x.id === r.parentId);
      if (p) return this.effCat(p);
    }
    return '';
  }

  /** @returns {object[]} rows in pre-order DFS */
  ordered() {
    const res = [];
    const walk = (pid) => {
      this.rows.filter(r => r.parentId === pid).forEach(c => {
        res.push(c);
        walk(c.id);
      });
    };
    walk(null);
    return res;
  }

  /** @returns {Object<number,string>} hierarchical number per row id */
  buildNums() {
    const n = {}, ctr = {};
    this.ordered().forEach(r => {
      const k = r.parentId === null ? '_' : r.parentId;
      ctr[k] = (ctr[k] || 0) + 1;
      n[r.id] = r.parentId === null ? `${  ctr[k]}` : `${n[r.parentId] || '?'  }.${  ctr[k]}`;
    });
    return n;
  }

  /** @returns {string} display name (name or stableId fallback) */
  dName(r) { return r.name && r.name.trim() ? r.name.trim() : r.stableId; }

  /** @returns {boolean} true if another row already uses this (trimmed) name */
  isNameDuplicate(name, excludeId) {
    if (!name || !name.trim()) return false;
    const lc = name.trim().toLowerCase();
    return this.rows.some(r => r.id !== excludeId && r.name && r.name.trim().toLowerCase() === lc);
  }

  // ── Scoring ───────────────────────────────────────────────

  /** @returns {number|null} mean of defined ratings across current experts */
  calcScore(r) {
    return this.calcScoreFor(r, this.experts);
  }

  /** @returns {number|null} mean of defined ratings across the given experts */
  calcScoreFor(row, experts) {
    if (!experts || !experts.length) return null;
    const v = experts
      .map(e => row.ratings[e.id])
      .filter(x => x !== undefined && x !== null && x !== '');
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  }

  // ── Row CRUD ──────────────────────────────────────────────

  /**
   * Add a row. Root rows are appended; child rows are inserted directly after
   * their parent's subtree (matching legacy insertion order).
   * @param {number|null} pid parent id, or null for a root row
   * @returns {object} the new row
   */
  addRow(pid = null) {
    const nr = {
      id: this._uid(),
      stableId: this._nextStableId(),
      parentId: pid,
      category: '',
      name: '',
      description: '',
      ratings: {},
      status: 'open',
    };
    if (pid !== null) {
      const di = this.descIds(pid);
      const pi = this.rows.findIndex(r => r.id === pid);
      let ins = pi + 1;
      if (di.length) ins = Math.max(...di.map(d => this.rows.findIndex(r => r.id === d))) + 1;
      this.rows.splice(ins, 0, nr);
    } else {
      this.rows.push(nr);
    }
    return nr;
  }

  /**
   * Delete a row and its descendants. Removes orphaned hypothesis references
   * from experiments.
   * @param {number} id
   * @returns {boolean} true if a row was removed
   */
  delRow(id) {
    const row = this.rows.find(r => r.id === id);
    if (!row) return false;
    const descIds = this.descIds(id);
    const rm = new Set([id, ...descIds]);
    const removedStableIds = new Set(
      this.rows.filter(r => rm.has(r.id) && r.stableId).map(r => r.stableId)
    );
    this.rows = this.rows.filter(r => !rm.has(r.id));
    if (removedStableIds.size > 0 && this.experiments.length > 0) {
      this.experiments.forEach(exp => {
        if (Array.isArray(exp.hypothesisIds)) {
          exp.hypothesisIds = exp.hypothesisIds.filter(sid => !removedStableIds.has(sid));
        }
      });
    }
    return true;
  }

  /**
   * Duplicate a row and its subtree, inserting after the source subtree.
   * @param {number} id
   * @param {string} [copySuffix] appended to the root copy's name (e.g. ' (Copy)')
   */
  dupeRow(id, copySuffix = '') {
    const src = this.rows.find(r => r.id === id);
    if (!src) return;
    const self = this;
    const cp = (sid, npid) => {
      const s = self.rows.find(r => r.id === sid);
      const nid = self._uid();
      const c = {
        id: nid,
        stableId: self._nextStableId(),
        parentId: npid,
        category: s.category,
        name: s.name + (sid === id ? copySuffix : ''),
        description: s.description,
        ratings: { ...s.ratings },
        status: s.status,
      };
      const di = self.descIds(sid);
      const si = self.rows.findIndex(r => r.id === sid);
      let ins = si + 1;
      if (di.length) ins = Math.max(...di.map(d => self.rows.findIndex(r => r.id === d))) + 1;
      self.rows.splice(ins, 0, c);
      self.rows.filter(r => r.parentId === sid && r.id !== nid).forEach(ch => cp(ch.id, nid));
    };
    cp(id, src.parentId);
  }

  /**
   * Drag-reorder: move `dragId` (and its subtree) to sit directly before
   * `targetId`, reparenting it to the target's parent. No-op when dragging onto
   * a descendant or onto itself.
   * @param {number} dragId
   * @param {number} targetId
   */
  moveRowBefore(dragId, targetId) {
    if (dragId === null || dragId === targetId) return;
    if (this.descIds(dragId).includes(targetId)) return;
    const dr = this.rows.find(r => r.id === dragId);
    if (!dr) return;
    const grp = [dr, ...this.descIds(dragId).map(d => this.rows.find(r => r.id === d))].filter(Boolean);
    this.rows = this.rows.filter(r => !grp.some(g => g.id === r.id));
    const ti = this.rows.findIndex(r => r.id === targetId);
    this.rows.splice(ti, 0, ...grp);
    const target = this.rows.find(r => r.id === targetId);
    dr.parentId = target ? target.parentId : null;
    if (dr.parentId !== null) dr.category = '';
  }

  // ── Experts ───────────────────────────────────────────────

  /**
   * Add an expert (rejects case-insensitive duplicates).
   * @param {string} name
   * @returns {object|null} the new expert, or null on duplicate/empty
   */
  addExpert(name) {
    const n = (name || '').trim();
    if (!n) return null;
    if (this.experts.some(e => e.name.toLowerCase() === n.toLowerCase())) return null;
    const e = { id: this._eUid(), name: n, color: EXP_COLS[this.experts.length % EXP_COLS.length] };
    this.experts.push(e);
    return e;
  }

  /** @param {number} id */
  removeExpert(id) {
    this.experts = this.experts.filter(e => e.id !== id);
    this.rows.forEach(r => { delete r.ratings[id]; });
  }

  /**
   * Rename an expert (rejects case-insensitive duplicates).
   * @returns {boolean} true on success
   */
  renameExpert(id, newName) {
    const exp = this.experts.find(e => e.id === id);
    if (!exp) return false;
    const n = (newName || '').trim();
    if (!n) return false;
    if (n === exp.name) return true;
    if (this.experts.some(e => e.id !== id && e.name.toLowerCase() === n.toLowerCase())) return false;
    exp.name = n;
    return true;
  }

  /** Set/clear a rating, clamped to 0..9. */
  setRating(rowId, expertId, value) {
    const r = this.rows.find(x => x.id === rowId);
    if (!r) return;
    const n = parseInt(value, 10);
    if (value === '' || value === null || value === undefined || isNaN(n)) delete r.ratings[expertId];
    else r.ratings[expertId] = Math.max(0, Math.min(9, n));
  }

  // ── Snapshots ─────────────────────────────────────────────

  /** Save a snapshot of the current rows/experts/problem. */
  saveSnapshot(name) {
    this.snapshots.unshift({
      id: this._sUid(),
      name,
      date: new Date().toISOString(),
      data: {
        problem: this.problem,
        experts: clone(this.experts),
        rows: clone(this.rows),
      },
    });
  }

  /** Restore a snapshot into the live state. */
  loadSnapshot(id) {
    const snap = this.snapshots.find(s => s.id === id);
    if (!snap) return false;
    const d = snap.data;
    this.problem = d.problem || '';
    this.experts = clone(d.experts || []);
    this.rows = clone(d.rows || []);
    this._recomputeCounters();
    return true;
  }

  /** @param {number} id */
  removeSnapshot(id) {
    this.snapshots = this.snapshots.filter(s => s.id !== id);
  }

  /**
   * Diff current rows against a snapshot.
   * @param {number} compareId
   * @returns {null|{added,removed,changed,addedSet,changedMap}}
   */
  getDiff(compareId) {
    const snap = this.snapshots.find(s => s.id === compareId);
    if (!snap) return null;
    const oldRows = snap.data.rows || [];
    const oldByStable = {};
    oldRows.forEach(r => { if (r.stableId) oldByStable[r.stableId] = r; });
    const newStables = new Set(this.rows.filter(r => r.stableId).map(r => r.stableId));
    const oldStables = new Set(oldRows.filter(r => r.stableId).map(r => r.stableId));
    const added = this.rows.filter(r => r.stableId && !oldStables.has(r.stableId));
    const removed = oldRows.filter(r => r.stableId && !newStables.has(r.stableId));
    const changed = [];
    this.rows.forEach(r => {
      if (!r.stableId || !oldByStable[r.stableId]) return;
      const old = oldByStable[r.stableId];
      const oS = this.calcScoreFor(old, snap.data.experts || []) || 0;
      const nS = this.calcScore(r) || 0;
      if (Math.abs(oS - nS) > 0.01) changed.push({ row: r, oldScore: oS, newScore: nS, delta: nS - oS });
    });
    return {
      added, removed, changed,
      addedSet: new Set(added.map(r => r.stableId)),
      changedMap: Object.fromEntries(changed.map(c => [c.row.stableId, c])),
    };
  }

  // ── Experiments ───────────────────────────────────────────

  addExperiment() {
    const x = {
      id: this._xUid(),
      title: '', description: '', responsible: '',
      status: 'planned', startDate: '', endDate: '',
      costMoney: null, costHours: null, hypothesisIds: [],
    };
    this.experiments.push(x);
    return x;
  }

  removeExperiment(id) {
    this.experiments = this.experiments.filter(x => x.id !== id);
  }

  // ── Facts ─────────────────────────────────────────────────

  addFact() {
    const today = new Date().toISOString().slice(0, 10);
    const f = { id: this._fUid(), name: '', description: '', date: today, owner: '' };
    this.facts.push(f);
    return f;
  }

  removeFact(id) {
    this.facts = this.facts.filter(f => f.id !== id);
  }

  // ── Images ────────────────────────────────────────────────

  addImage(kind, dataUrl, caption = '') {
    const img = { id: this._imgUid(), dataUrl, caption };
    (this.images[kind] || (this.images[kind] = [])).push(img);
    return img;
  }

  removeImage(kind, id) {
    if (this.images[kind]) this.images[kind] = this.images[kind].filter(x => x.id !== id);
  }

  // ── Pareto data (pure) ────────────────────────────────────

  /**
   * Scored, descending-sorted rows for the Pareto chart.
   * @param {string} source 'current' | 'snap-<id>'
   * @returns {Array<{name:string, avg:number, cat:string}>}
   */
  paretoData(source) {
    let rows, experts;
    if (!source || source === 'current') {
      rows = this.rows;
      experts = this.experts;
    } else {
      const snapId = parseInt(String(source).replace('snap-', ''), 10);
      const snap = this.snapshots.find(s => s.id === snapId);
      if (!snap) return [];
      rows = snap.data.rows || [];
      experts = snap.data.experts || [];
    }
    const scored = [];
    rows.forEach(r => {
      if (!experts.length) return;
      const vals = experts.map(e => r.ratings[e.id]).filter(x => x !== undefined && x !== null && x !== '');
      if (!vals.length) return;
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      const name = (r.name && r.name.trim()) ? r.name.trim() : r.stableId || '?';
      const cat = r.category || '';
      scored.push({ name, avg, cat });
    });
    scored.sort((a, b) => b.avg - a.avg);
    return scored;
  }

  // ── Serialization ─────────────────────────────────────────

  toJSON() {
    return clone({
      problem: this.problem,
      experts: this.experts,
      catLabels: this.catLabels,
      rows: this.rows,
      snapshots: this.snapshots,
      experiments: this.experiments,
      facts: this.facts,
      images: this.images,
    });
  }

  /**
   * Return the JSON-path token arrays for every base64 image slot in a
   * serialised State object (as returned by toJSON / getState).
   * Used by storage adapters to swap dataUrl values for asset references.
   *
   * Images live exclusively in `json.images.inScope[i].dataUrl` and
   * `json.images.outScope[i].dataUrl`.  Snapshots carry no images.
   *
   * @param {object} json - plain object (toJSON output)
   * @returns {Array<Array<string|number>>} one path per image slot that has a
   *   truthy dataUrl, e.g. ['images','inScope',0,'dataUrl']
   */
  static imagePaths(json) {
    const out = [];
    for (const kind of ['inScope', 'outScope']) {
      (json.images?.[kind] || []).forEach((img, i) => {
        if (img && img.dataUrl) out.push(['images', kind, i, 'dataUrl']);
      });
    }
    return out;
  }

  /** @param {*} d @returns {State} always a valid State, even for malformed input */
  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;
    s.problem = asStr(d.problem);
    s.experts = Array.isArray(d.experts) ? clone(d.experts) : [];
    s.catLabels = (d.catLabels && typeof d.catLabels === 'object' && !Array.isArray(d.catLabels))
      ? { ...d.catLabels } : {};
    s.rows = Array.isArray(d.rows) ? clone(d.rows) : [];
    s.snapshots = Array.isArray(d.snapshots) ? clone(d.snapshots) : [];
    s.experiments = Array.isArray(d.experiments) ? clone(d.experiments) : [];
    s.facts = Array.isArray(d.facts) ? clone(d.facts) : [];
    const si = (d.images && typeof d.images === 'object') ? d.images : {};
    s.images = {
      inScope: Array.isArray(si.inScope) ? clone(si.inScope) : [],
      outScope: Array.isArray(si.outScope) ? clone(si.outScope) : [],
    };
    s._recomputeCounters();
    return s;
  }

  /** Recompute id counters from loaded data so new ids never collide. */
  _recomputeCounters() {
    this._idC = Math.max(0, ...this.rows.map(r => asNum(r.id)), this._idC);
    this._expIdC = Math.max(0, ...this.experts.map(e => asNum(e.id)), this._expIdC);
    this._snapIdC = Math.max(0, ...this.snapshots.map(s => asNum(s.id)), this._snapIdC);
    this._xpIdC = Math.max(0, ...this.experiments.map(x => asNum(x.id)), this._xpIdC);
    this._factIdC = Math.max(0, ...this.facts.map(f => asNum(f.id)), this._factIdC);
    this._imgIdC = Math.max(
      0,
      ...this.images.inScope.map(i => asNum(i.id)),
      ...this.images.outScope.map(i => asNum(i.id)),
      this._imgIdC
    );
    const bump = (r) => {
      if (r.stableId) {
        const n = parseInt(String(r.stableId).split('-')[1]) || 0;
        if (n > this._stableIdC) this._stableIdC = n;
      }
    };
    this.rows.forEach(bump);
    this.snapshots.forEach(s => (s.data?.rows || []).forEach(bump));
  }
}
