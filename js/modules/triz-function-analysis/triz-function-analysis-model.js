/**
 * D.Mike — TRIZ function analysis: data model.
 *
 * Components (exactly one target), unordered interaction pairs and directed
 * functions. Derived values (rank, open pairs, disadvantages) are pure
 * functions and never stored. See
 * docs/superpowers/specs/2026-10-15-triz-function-analysis-design.md.
 */

import { uid } from '../../core/uid.js';

export const KINDS = ['target', 'system', 'supersystem'];
export const TYPES = ['useful', 'harmful'];
export const LEVELS = ['adequate', 'insufficient', 'excessive'];
export const TABS = ['components', 'interactions', 'model'];

/**
 * Key of an unordered pair.
 * @param {string} a @param {string} b
 * @returns {string}
 */
export function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Components grouped target → system → supersystem, entry order within a group.
 * @param {Array<Object>} components
 * @returns {Array<Object>}
 */
export function orderedComponents(components) {
  return KINDS.flatMap((k) => components.filter((c) => c.kind === k));
}

const str = (v) => (typeof v === 'string' ? v : '');
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export class State {
  static VERSION = '1.0';
  static ID = 'triz-function-analysis';

  _schema = { name: State.ID, version: State.VERSION };
  components = [];
  interactions = [];
  functions = [];
  positions = {};
  activeTab = 'components';

  /** @returns {boolean} */
  hasContent() {
    return this.components.length > 0 || this.functions.length > 0;
  }

  /** @returns {Object} plain, deep-copied data */
  toJSON() {
    return {
      _schema: { ...this._schema },
      components: this.components.map((c) => ({ ...c })),
      interactions: this.interactions.map((i) => ({ ...i })),
      functions: this.functions.map((f) => ({ ...f })),
      positions: Object.fromEntries(Object.entries(this.positions).map(([k, p]) => [k, { ...p }])),
      activeTab: this.activeTab,
    };
  }

  /**
   * Build a state from untrusted data, repairing what is inconsistent.
   * @param {Object} d
   * @returns {State}
   */
  static fromJSON(d) {
    const s = new State();
    if (!isObj(d)) return s;

    let hasTarget = false;
    for (const c of Array.isArray(d.components) ? d.components : []) {
      if (!isObj(c) || typeof c.id !== 'string' || !c.id || s.component(c.id)) continue;
      let kind = KINDS.includes(c.kind) ? c.kind : 'system';
      if (kind === 'target') {
        if (hasTarget) kind = 'system';
        hasTarget = true;
      }
      s.components.push({ id: c.id, name: str(c.name), kind, note: str(c.note) });
    }
    const known = (id) => typeof id === 'string' && s.component(id) !== null;

    for (const i of Array.isArray(d.interactions) ? d.interactions : []) {
      if (isObj(i) && known(i.a) && known(i.b)) s._tick(i.a, i.b);
    }

    for (const f of Array.isArray(d.functions) ? d.functions : []) {
      if (!isObj(f) || typeof f.id !== 'string' || !f.id) continue;
      const type = TYPES.includes(f.type) ? f.type : 'useful';
      let level = null;
      if (type === 'useful') level = LEVELS.includes(f.level) ? f.level : 'adequate';
      const carrier = known(f.carrier) ? f.carrier : '';
      let object = known(f.object) ? f.object : '';
      if (carrier && carrier === object) object = '';
      s.functions.push({
        id: f.id, carrier, verb: str(f.verb), object, parameter: str(f.parameter), type, level, note: str(f.note),
      });
    }

    if (isObj(d.positions)) {
      for (const [id, p] of Object.entries(d.positions)) {
        if (known(id) && isObj(p) && Number.isFinite(p.x) && Number.isFinite(p.y)) s.positions[id] = { x: p.x, y: p.y };
      }
    }
    s.activeTab = TABS.includes(d.activeTab) ? d.activeTab : 'components';
    return s;
  }

  /** @param {string} id @returns {Object|null} */
  component(id) {
    return this.components.find((c) => c.id === id) || null;
  }

  /**
   * @param {string} kind - one of KINDS (unknown → 'system')
   * @param {string} [name='']
   * @returns {{component: Object, demoted: Object|null}}
   */
  addComponent(kind, name = '') {
    const component = { id: uid(), name: String(name), kind: 'system', note: '' };
    this.components.push(component);
    const demoted = kind === 'target' ? this.setKind(component.id, 'target')
      : (this.setKind(component.id, KINDS.includes(kind) ? kind : 'system'), null);
    return { component: this.component(component.id), demoted };
  }

  /**
   * Change a component's kind. Making it the target demotes the old target.
   * @param {string} id @param {string} kind
   * @returns {Object|null} the demoted former target, else null
   */
  setKind(id, kind) {
    const c = this.component(id);
    if (!c || !KINDS.includes(kind) || c.kind === kind) return null;
    let demoted = null;
    if (kind === 'target') {
      demoted = this.components.find((x) => x.kind === 'target') || null;
      if (demoted) demoted.kind = 'system';
    }
    c.kind = kind;
    return demoted;
  }

  /** @param {string} id @returns {number} functions using the component */
  impactOf(id) {
    return this.functions.filter((f) => f.carrier === id || f.object === id).length;
  }

  /** Remove a component with its interactions, functions and stored position. @param {string} id */
  removeComponent(id) {
    this.components = this.components.filter((c) => c.id !== id);
    this.interactions = this.interactions.filter((i) => i.a !== id && i.b !== id);
    this.functions = this.functions.filter((f) => f.carrier !== id && f.object !== id);
    delete this.positions[id];
  }

  /** Tick a pair (sorted, no duplicates, no self pairs). @private */
  _tick(a, b) {
    if (!a || !b || a === b) return;
    const k = pairKey(a, b);
    if (this.interactions.some((i) => pairKey(i.a, i.b) === k)) return;
    this.interactions.push(a < b ? { a, b } : { a: b, b: a });
  }
}
