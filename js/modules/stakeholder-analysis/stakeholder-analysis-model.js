/**
 * D.Mike — Stakeholder Analysis Model (stakeholder-analysis-model.js)
 * Pure business logic + state for the Power/Interest stakeholder analysis.
 * View logic (i18n, CSS, styles) lives in the data-fn, not here.
 */

export const SUPPORT_VALUES = ['supporter', 'neutral', 'critic'];
export const CATEGORY_VALUES = ['intern', 'extern', 'kunde', 'lieferant', 'behoerde'];

/** Sort order of the four power/interest quadrants (highest priority first). */
export const QUAD_ORDER = ['manage-closely', 'keep-satisfied', 'keep-informed', 'monitor'];

/** Clamp a value to an integer in [1, 5], falling back to 3 for non-numbers. */
function clampLevel(v) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, n));
}

function genId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `sh-${  Math.abs(Date.now() ^ (Math.random() * 1e9 | 0)).toString(36)}`;
}

export class Stakeholder {
  id = '';
  name = '';
  role = '';
  power = 3;
  interest = 3;
  support = 'neutral';
  category = 'intern';
  notes = '';

  /**
   * Power/Interest quadrant. Pure business logic — no i18n, no CSS.
   * @returns {'manage-closely'|'keep-satisfied'|'keep-informed'|'monitor'}
   */
  get quadrant() {
    const highP = this.power >= 4;
    const highI = this.interest >= 4;
    if (highP && highI) return 'manage-closely';
    if (highP && !highI) return 'keep-satisfied';
    if (!highP && highI) return 'keep-informed';
    return 'monitor';
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      role: this.role,
      power: this.power,
      interest: this.interest,
      support: this.support,
      category: this.category,
      notes: this.notes,
    };
  }

  static fromJSON(d) {
    const s = new Stakeholder();
    if (!d || typeof d !== 'object') return s;
    s.id = typeof d.id === 'string' && d.id ? d.id : genId();
    s.name = typeof d.name === 'string' ? d.name : '';
    s.role = typeof d.role === 'string' ? d.role : '';
    s.power = clampLevel(d.power);
    s.interest = clampLevel(d.interest);
    // support/category are stored as raw strings. The built-in form offers a fixed
    // option set, but imported projects and catalog examples may carry extended
    // values (e.g. support 'resistor', category 'Sponsor'). Preserve them verbatim
    // — sanitising to a default would silently lose information.
    s.support = typeof d.support === 'string' && d.support ? d.support : 'neutral';
    s.category = typeof d.category === 'string' && d.category ? d.category : 'intern';
    s.notes = typeof d.notes === 'string' ? d.notes : '';
    return s;
  }
}

export class State {
  static VERSION = '1.0';
  static ID = 'stakeholder-analysis';

  _schema = { name: State.ID, version: State.VERSION };
  /** @type {Stakeholder[]} */
  stakeholders = [];

  hasContent() {
    return this.stakeholders.length > 0;
  }

  toJSON() {
    return {
      _schema: { ...this._schema },
      stakeholders: this.stakeholders.map((s) => s.toJSON()),
    };
  }

  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;
    if (Array.isArray(d.stakeholders)) {
      s.stakeholders = d.stakeholders.map((x) => Stakeholder.fromJSON(x));
    }
    return s;
  }
}
