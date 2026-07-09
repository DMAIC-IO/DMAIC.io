/**
 * D.Mike — Response Optimization Model (response-optimization-model.js)
 *
 * Pure state + business logic: spec entries per model, optimisation ID.
 * No DOM, no i18n, no view formatting.
 *
 * Persistence shape matches legacy getState():
 *   { specs: { [modelId]: SpecEntry }, optId: string|null }
 */

/** Threshold below which we refuse to optimise. */
const MIN_R2_ADJ = 0.5;

/** Significance level for the lack-of-fit gate. */
const LOF_ALPHA = 0.05;

/** Valid spec kinds. */
const VALID_KINDS = ['max', 'min', 'target'];

/**
 * Per-model desirability specification.
 * Serialises to exactly the shape the legacy code stored.
 */
export class SpecEntry {
  selected = false;
  kind = 'max';
  lower = 0;
  upper = 1;
  target = 0.5;
  weight = 1;

  /**
   * Serialise to plain object (persistence shape matches legacy _specs[id]).
   * @returns {{ selected: boolean, kind: string, lower: number, upper: number, target: number, weight: number }}
   */
  toJSON() {
    return {
      selected: this.selected,
      kind:     this.kind,
      lower:    this.lower,
      upper:    this.upper,
      target:   this.target,
      weight:   this.weight,
    };
  }

  /**
   * Deserialise from plain object (null/undefined → valid defaults).
   * @param {object|null|undefined} d
   * @returns {SpecEntry}
   */
  static fromJSON(d) {
    const e = new SpecEntry();
    if (!d) return e;
    e.selected = typeof d.selected === 'boolean' ? d.selected : false;
    e.kind     = VALID_KINDS.includes(d.kind) ? d.kind : 'max';
    e.lower    = Number.isFinite(d.lower)  ? d.lower  : 0;
    e.upper    = Number.isFinite(d.upper)  ? d.upper  : 1;
    e.target   = Number.isFinite(d.target) ? d.target : (e.lower + e.upper) / 2;
    e.weight   = Number.isFinite(d.weight) && d.weight > 0 ? d.weight : 1;
    return e;
  }
}

/**
 * Top-level state for the Response Optimization module.
 */
export class State {
  /** @type {Object.<string, SpecEntry>} modelId → SpecEntry */
  specs = {};

  /** Persisted optimisation ID in state.optimizations. */
  optId = null;

  // ── Derived getters (raw data only, no i18n or CSS) ──────────────

  /** IDs of currently selected models. */
  get selectedIds() {
    return Object.keys(this.specs).filter(id => this.specs[id]?.selected);
  }

  // ── Business logic ──────────────────────────────────────────────

  /**
   * Sync specs map with the live model list:
   * - Drop entries for models that no longer exist.
   * - Seed missing entries with sensible defaults derived from snapshot data.
   * Called on init and whenever state:saved fires.
   *
   * @param {Array<{id: string, dataSnapshot?: {y?: number[]}}>} models
   */
  reconcileSpecs(models) {
    const knownIds = new Set(models.map(m => m.id));
    // Drop orphaned entries.
    for (const id of Object.keys(this.specs)) {
      if (!knownIds.has(id)) delete this.specs[id];
    }
    // Seed missing entries.
    for (const m of models) {
      if (this.specs[m.id]) continue;
      const ys = m.dataSnapshot?.y ?? [];
      const lo = ys.length ? Math.min(...ys) : 0;
      const hi = ys.length ? Math.max(...ys) : 1;
      const entry = new SpecEntry();
      entry.selected = false;
      entry.kind   = 'max';
      entry.lower  = lo;
      entry.upper  = hi;
      entry.target = (lo + hi) / 2;
      entry.weight = 1;
      this.specs[m.id] = entry;
    }
  }

  /**
   * Return diagnostic reasons why optimisation is blocked.
   * Returns structured objects so the caller (data-Fn) can format them with i18n.
   *
   * @param {string[]} selectedIds
   * @param {Array<{id: string, name: string, rSqAdj?: number, lofPValue?: number, factorSpec: Array<{name: string}>}>} allModels
   * @returns {Array<{type: string, name: string, value?: number}>}
   */
  diagnose(selectedIds, allModels) {
    const reasons = [];
    if (selectedIds.length === 0) return reasons;

    const modelMap = new Map(allModels.map(m => [m.id, m]));
    const models = selectedIds.map(id => modelMap.get(id)).filter(Boolean);

    for (const m of models) {
      if ((m.rSqAdj ?? 0) < MIN_R2_ADJ) {
        reasons.push({ type: 'lowR2', name: m.name, value: m.rSqAdj ?? 0 });
      }
      if (Number.isFinite(m.lofPValue) && m.lofPValue < LOF_ALPHA) {
        reasons.push({ type: 'lackOfFit', name: m.name, value: m.lofPValue });
      }
    }

    // Factor compatibility: all selected models must share the same factor names.
    if (models.length > 1) {
      const ref = models[0].factorSpec.map(f => f.name).join('|');
      for (const m of models.slice(1)) {
        const cur = m.factorSpec.map(f => f.name).join('|');
        if (cur !== ref) {
          reasons.push({ type: 'factorMismatch', name: m.name });
          break;
        }
      }
    }

    return reasons;
  }

  /**
   * Returns true if the module has any meaningful content
   * (required for createModule loadExample confirmation).
   * @returns {boolean}
   */
  hasContent() {
    if (this.optId) return true;
    return Object.values(this.specs).some(e => e.selected);
  }

  // ── Persistence ──────────────────────────────────────────────────

  /**
   * Serialise to plain object.
   * Shape MUST match legacy getState(): { specs, optId }.
   * @returns {{ specs: Object, optId: string|null }}
   */
  toJSON() {
    const specs = {};
    for (const [id, entry] of Object.entries(this.specs)) {
      specs[id] = entry.toJSON();
    }
    return {
      specs,
      optId: this.optId,
    };
  }

  /**
   * Deserialise from plain object (null/undefined → valid defaults).
   * @param {object|null|undefined} d
   * @returns {State}
   */
  static fromJSON(d) {
    const s = new State();
    if (!d) return s;
    if (d.specs && typeof d.specs === 'object') {
      for (const [id, raw] of Object.entries(d.specs)) {
        s.specs[id] = SpecEntry.fromJSON(raw);
      }
    }
    s.optId = typeof d.optId === 'string' ? d.optId : null;
    return s;
  }
}
