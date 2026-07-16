/**
 * D.Mike — VoC → CTx Tree Model (voc-ctx-tree-model.js)
 *
 * Pure state + business logic for the Voice-of-Customer → Critical-to-X tree.
 * No DOM, no i18n, no CSS classes, no view getters — those live in the data-fn.
 *
 * Persisted shape (toJSON / fromJSON), unchanged from the legacy module:
 *   { vocs: Voc[], activeVocId: string|null, styles: { borderWidth, colors } }
 *
 * Tree shape (persisted, unchanged):
 *   Voc        { id, text, source, needs: Need[] }
 *   Need       { id, text, drivers: Driver[] }
 *   Driver     { id, text, type: 'ctq'|'ctd'|'ctc', requirements: Req[] }
 *   Req        { id, text, target, measure }
 *
 * The tree is depth-bounded at 4 levels (VoC → Need → Driver → Requirement).
 */

/** Default node colours (rgba), mirrors the legacy DEFAULT_COLORS. */
export const DEFAULT_COLORS = {
  voc:  'rgba(230,126,34,1)',
  need: 'rgba(155,89,182,1)',
  ctq:  'rgba(39,174,96,1)',
  ctd:  'rgba(41,128,185,1)',
  ctc:  'rgba(231,76,139,1)',
  req:  'rgba(52,152,219,1)',
};

/** Build a fresh default styles object. */
function defaultStyles() {
  return { borderWidth: 1, colors: { ...DEFAULT_COLORS } };
}

/** Generate a stable unique id (crypto.randomUUID where available). */
function uid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${  Math.random().toString(36).slice(2)  }${Date.now().toString(36)}`;
}

const VALID_TYPES = ['ctq', 'ctd', 'ctc'];

export class State {
  /** @type {object[]} VoC statements, each with a nested CTx tree */
  vocs = [];
  /** @type {string|null} id of the currently selected VoC */
  activeVocId = null;
  /** @type {{ borderWidth: number, colors: object }} appearance settings */
  styles = defaultStyles();

  // ─── Lookup ─────────────────────────────────────────────────

  /** @returns {object|undefined} the VoC with the given id */
  findVoc(id) {
    return this.vocs.find((v) => v.id === id);
  }

  /** @returns {object|null} the currently active VoC, or null */
  get activeVoc() {
    return this.findVoc(this.activeVocId) || null;
  }

  // ─── VoC CRUD ───────────────────────────────────────────────

  /**
   * Append a new VoC and select it (legacy: new VoC becomes active).
   * @param {string} text
   * @param {string} [source]
   * @returns {string} the new VoC id
   */
  addVoc(text, source = '') {
    const voc = { id: uid(), text, source, needs: [] };
    this.vocs.push(voc);
    this.activeVocId = voc.id;
    return voc.id;
  }

  /** Update a VoC's text and source. */
  updateVoc(id, text, source) {
    const voc = this.findVoc(id);
    if (!voc) return;
    voc.text = text;
    voc.source = source;
  }

  /**
   * Delete a VoC. If the deleted VoC was active, reselect the first
   * remaining (or null when none remain).
   */
  deleteVoc(id) {
    this.vocs = this.vocs.filter((v) => v.id !== id);
    if (this.activeVocId === id) {
      this.activeVocId = this.vocs.length ? this.vocs[0].id : null;
    }
  }

  /** Select a VoC by id. */
  setActiveVoc(id) {
    this.activeVocId = id;
  }

  // ─── Need CRUD ──────────────────────────────────────────────

  addNeed(vocId, text) {
    const voc = this.findVoc(vocId);
    if (!voc) return null;
    const need = { id: uid(), text, drivers: [] };
    voc.needs.push(need);
    return need.id;
  }

  updateNeed(vocId, needId, text) {
    const need = this._findNeed(vocId, needId);
    if (need) need.text = text;
  }

  deleteNeed(vocId, needId) {
    const voc = this.findVoc(vocId);
    if (!voc) return;
    voc.needs = voc.needs.filter((n) => n.id !== needId);
  }

  // ─── Driver CRUD ────────────────────────────────────────────

  addDriver(vocId, needId, text, type) {
    const need = this._findNeed(vocId, needId);
    if (!need) return null;
    const drv = { id: uid(), text, type: VALID_TYPES.includes(type) ? type : 'ctq', requirements: [] };
    need.drivers.push(drv);
    return drv.id;
  }

  updateDriver(vocId, needId, drvId, text, type) {
    const drv = this._findDriver(vocId, needId, drvId);
    if (!drv) return;
    drv.text = text;
    if (VALID_TYPES.includes(type)) drv.type = type;
  }

  deleteDriver(vocId, needId, drvId) {
    const need = this._findNeed(vocId, needId);
    if (!need) return;
    need.drivers = need.drivers.filter((d) => d.id !== drvId);
  }

  // ─── Requirement CRUD ───────────────────────────────────────

  addRequirement(vocId, needId, drvId, text, target = '', measure = '') {
    const drv = this._findDriver(vocId, needId, drvId);
    if (!drv) return null;
    const req = { id: uid(), text, target, measure };
    drv.requirements.push(req);
    return req.id;
  }

  updateRequirement(vocId, needId, drvId, reqId, text, target, measure) {
    const drv = this._findDriver(vocId, needId, drvId);
    if (!drv) return;
    const req = drv.requirements.find((r) => r.id === reqId);
    if (!req) return;
    req.text = text;
    req.target = target;
    req.measure = measure;
  }

  deleteRequirement(vocId, needId, drvId, reqId) {
    const drv = this._findDriver(vocId, needId, drvId);
    if (!drv) return;
    drv.requirements = drv.requirements.filter((r) => r.id !== reqId);
  }

  // ─── Reorder (sibling drag) ─────────────────────────────────

  /**
   * Reorder a node within its sibling list, moving `fromId` to the slot of
   * `toId`. Drag-sibling validation (same parent path) is enforced by the
   * caller supplying the matching scope ids; this method resolves the array
   * from `kind` + scope and is a no-op for unknown / equal ids.
   *
   * @param {'need'|'driver'|'req'} kind
   * @param {{ vocId?: string, needId?: string, drvId?: string }} scope
   * @param {string} fromId
   * @param {string} toId
   */
  reorderNodes(kind, scope, fromId, toId) {
    let arr = null;
    if (kind === 'need') {
      const voc = this.findVoc(scope.vocId);
      arr = voc ? voc.needs : null;
    } else if (kind === 'driver') {
      const need = this._findNeed(scope.vocId, scope.needId);
      arr = need ? need.drivers : null;
    } else if (kind === 'req') {
      const drv = this._findDriver(scope.vocId, scope.needId, scope.drvId);
      arr = drv ? drv.requirements : null;
    }
    if (!arr || fromId === toId) return;
    const fromIdx = arr.findIndex((item) => item.id === fromId);
    const toIdx = arr.findIndex((item) => item.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, moved);
  }

  // ─── Export ─────────────────────────────────────────────────

  /**
   * Total number of requirements across all needs/drivers of a VoC.
   * @param {object} voc
   * @returns {number}
   */
  totalReqs(voc) {
    return voc.needs.reduce(
      (s, n) => s + n.drivers.reduce((s2, d) => s2 + d.requirements.length, 0),
      0
    );
  }

  /**
   * Flatten the entire tree into tabular rows. Pure — no i18n. The driver
   * `type` is uppercased; empty cells are '' (mirrors the legacy layout).
   * Column order: VoC, Source, Need, DriverType, CTx(driverText), Req, Target, Measure.
   * @returns {Array<Array<string>>}
   */
  getExportRows() {
    const rows = [];
    for (const voc of this.vocs) {
      if (voc.needs.length === 0) {
        rows.push([voc.text, voc.source || '', '', '', '', '', '', '']);
        continue;
      }
      for (const need of voc.needs) {
        if (need.drivers.length === 0) {
          rows.push([voc.text, voc.source || '', need.text, '', '', '', '', '']);
          continue;
        }
        for (const drv of need.drivers) {
          if (drv.requirements.length === 0) {
            rows.push([voc.text, voc.source || '', need.text, drv.type.toUpperCase(), drv.text, '', '', '']);
            continue;
          }
          for (const req of drv.requirements) {
            rows.push([
              voc.text, voc.source || '', need.text,
              drv.type.toUpperCase(), drv.text,
              req.text, req.target || '', req.measure || '',
            ]);
          }
        }
      }
    }
    return rows;
  }

  // ─── loadExample guard ──────────────────────────────────────

  /** @returns {boolean} true when at least one VoC exists */
  hasContent() {
    return (this.vocs?.length || 0) > 0;
  }

  // ─── Serialization ──────────────────────────────────────────

  toJSON() {
    return {
      vocs: JSON.parse(JSON.stringify(this.vocs)),
      activeVocId: this.activeVocId,
      styles: {
        borderWidth: this.styles.borderWidth,
        colors: { ...this.styles.colors },
      },
    };
  }

  /**
   * Deserialize, validating each field and always returning a usable default.
   * Style colours fall back to DEFAULT_COLORS per key (legacy merge semantics).
   * @param {object|null|undefined} d
   * @returns {State}
   */
  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;

    if (Array.isArray(d.vocs)) {
      s.vocs = JSON.parse(JSON.stringify(d.vocs));
    }

    const styles = (d.styles && typeof d.styles === 'object') ? d.styles : {};
    const colors = (styles.colors && typeof styles.colors === 'object') ? styles.colors : {};
    s.styles = {
      borderWidth: typeof styles.borderWidth === 'number' ? styles.borderWidth : 1,
      colors: { ...DEFAULT_COLORS, ...colors },
    };

    const activeFromData = (typeof d.activeVocId === 'string') ? d.activeVocId : null;
    const validActive = activeFromData && s.vocs.some((v) => v.id === activeFromData)
      ? activeFromData
      : null;
    s.activeVocId = validActive || (s.vocs.length ? s.vocs[0].id : null);

    return s;
  }

  // ─── Private helpers ────────────────────────────────────────

  _findNeed(vocId, needId) {
    const voc = this.findVoc(vocId);
    return voc ? voc.needs.find((n) => n.id === needId) : undefined;
  }

  _findDriver(vocId, needId, drvId) {
    const need = this._findNeed(vocId, needId);
    return need ? need.drivers.find((d) => d.id === drvId) : undefined;
  }
}
