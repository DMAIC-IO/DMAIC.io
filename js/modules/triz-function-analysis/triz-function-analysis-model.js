/**
 * D.Mike — TRIZ function analysis: data model.
 *
 * Components (exactly one target), unordered interaction pairs, pairs
 * explicitly excluded from interacting, and directed functions. Derived values (rank, open pairs, disadvantages) are pure
 * functions and never stored. See
 * docs/superpowers/specs/2026-10-15-triz-function-analysis-design.md.
 */

import { uid } from '../../core/uid.js';

export const KINDS = ['target', 'system', 'supersystem'];
/** Display order of the component groups: supersystem, then the target, then the system. */
export const GROUPS = ['supersystem', 'target', 'system'];
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
 * Functions grouped by their (undirected) pair, in order of first appearance.
 * Incomplete functions each get a group of their own (key `draft|<id>`).
 * @param {{functions: Object[]}} state
 * @returns {Array<{key:string,a:string,b:string,complete:boolean,functions:Object[]}>}
 */
export function functionPairs(state) {
  const groups = new Map();
  for (const f of state.functions) {
    const complete = isComplete(f);
    const key = complete ? pairKey(f.carrier, f.object) : `draft|${f.id}`;
    if (!groups.has(key)) groups.set(key, { key, a: f.carrier, b: f.object, complete, functions: [] });
    groups.get(key).functions.push(f);
  }
  return [...groups.values()];
}

/**
 * Components grouped target → system → supersystem, entry order within a group.
 * @param {Array<Object>} components
 * @returns {Array<Object>}
 */
export function orderedComponents(components) {
  return KINDS.flatMap((k) => components.filter((c) => c.kind === k));
}

/** @param {Object} fn @returns {boolean} both ends set and different */
export function isComplete(fn) {
  return Boolean(fn && fn.carrier && fn.object && fn.carrier !== fn.object);
}

const RANK_BY_KIND = { target: 'basic', supersystem: 'additional', system: 'auxiliary' };

/**
 * Derived rank of a function: useful on the target → basic, on a supersystem
 * element → additional, on a system component → auxiliary; harmful or draft → null.
 * @param {Object} fn @param {Array<Object>} components
 * @returns {'basic'|'additional'|'auxiliary'|null}
 */
export function rankOf(fn, components) {
  if (!isComplete(fn) || fn.type !== 'useful') return null;
  const obj = components.find((c) => c.id === fn.object);
  return obj ? RANK_BY_KIND[obj.kind] ?? null : null;
}

/**
 * Ticked pairs that no complete function uses (in either direction).
 * @param {State} state
 * @returns {Array<{a:string,b:string}>}
 */
export function openPairs(state) {
  const used = new Set(state.functions.filter(isComplete).map((f) => pairKey(f.carrier, f.object)));
  return state.interactions.filter((i) => !used.has(pairKey(i.a, i.b))).map((i) => ({ a: i.a, b: i.b }));
}

/**
 * Functional disadvantages — the handover shape for part 2.
 * @param {State} state
 * @returns {Array<{functionId:string,carrier:string,verb:string,object:string,parameter:string,kind:'harmful'|'insufficient'|'excessive'}>}
 */
export function disadvantages(state) {
  const name = (id) => state.components.find((c) => c.id === id)?.name ?? '';
  const out = [];
  for (const f of state.functions) {
    if (!isComplete(f)) continue;
    let kind = null;
    if (f.type === 'harmful') kind = 'harmful';
    else if (f.level === 'insufficient' || f.level === 'excessive') kind = f.level;
    if (!kind) continue;
    out.push({ functionId: f.id, carrier: name(f.carrier), verb: f.verb, object: name(f.object), parameter: f.parameter, kind });
  }
  return out;
}

const str = (v) => (typeof v === 'string' ? v : '');
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export class State {
  static VERSION = '1.0';
  static ID = 'triz-function-analysis';

  _schema = { name: State.ID, version: State.VERSION };
  components = [];
  interactions = [];
  exclusions = [];
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
      exclusions: this.exclusions.map((x) => ({ ...x })),
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
    for (const x of Array.isArray(d.exclusions) ? d.exclusions : []) {
      if (isObj(x) && known(x.a) && known(x.b) && !s.hasInteraction(x.a, x.b)) s._exclude(x.a, x.b);
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

  /** Remove a component with its interactions, exclusions, functions and stored position. @param {string} id */
  removeComponent(id) {
    this.components = this.components.filter((c) => c.id !== id);
    this.interactions = this.interactions.filter((i) => i.a !== id && i.b !== id);
    this.exclusions = this.exclusions.filter((x) => x.a !== id && x.b !== id);
    this.functions = this.functions.filter((f) => f.carrier !== id && f.object !== id);
    delete this.positions[id];
  }

  /** @param {string} a @param {string} b @returns {boolean} */
  hasInteraction(a, b) {
    const k = pairKey(a, b);
    return this.interactions.some((i) => pairKey(i.a, i.b) === k);
  }

  /** @param {string} a @param {string} b @returns {boolean} explicitly marked as not interacting */
  isExcluded(a, b) {
    const k = pairKey(a, b);
    return this.exclusions.some((x) => pairKey(x.a, x.b) === k);
  }

  /** @param {string} a @param {string} b @returns {'none'|'ticked'|'excluded'} */
  pairState(a, b) {
    if (this.hasInteraction(a, b)) return 'ticked';
    return this.isExcluded(a, b) ? 'excluded' : 'none';
  }

  /** @param {string} a @param {string} b @returns {number} complete functions on the pair */
  usersOf(a, b) {
    const k = pairKey(a, b);
    return this.functions.filter((f) => isComplete(f) && pairKey(f.carrier, f.object) === k).length;
  }

  /**
   * Cycle a pair: empty → ticked → excluded → empty. Leaving "ticked" is
   * refused while functions use the pair.
   * @param {string} a @param {string} b
   * @returns {{ok: boolean, usedBy?: number}}
   */
  toggleInteraction(a, b) {
    if (!a || !b || a === b) return { ok: false, usedBy: 0 };
    const k = pairKey(a, b);
    if (this.isExcluded(a, b)) {
      this.exclusions = this.exclusions.filter((x) => pairKey(x.a, x.b) !== k);
      return { ok: true };
    }
    if (!this.hasInteraction(a, b)) {
      this._tick(a, b);
      return { ok: true };
    }
    const usedBy = this.usersOf(a, b);
    if (usedBy) return { ok: false, usedBy };
    this.interactions = this.interactions.filter((i) => pairKey(i.a, i.b) !== k);
    this._exclude(a, b);
    return { ok: true };
  }

  /** @param {string} id @returns {Object|null} */
  fn(id) {
    return this.functions.find((f) => f.id === id) || null;
  }

  /**
   * New function; ticks its pair once both ends are set.
   * @param {string} [carrier=''] @param {string} [object='']
   * @returns {Object} the (reactive) function object
   */
  addFunction(carrier = '', object = '') {
    const id = uid();
    this.functions.push({
      id, carrier, verb: '', object: carrier && carrier === object ? '' : object,
      parameter: '', type: 'useful', level: 'adequate', note: '',
    });
    const f = this.fn(id);
    if (isComplete(f)) this._tick(f.carrier, f.object);
    return f;
  }

  /** @param {string} id */
  swapDirection(id) {
    const f = this.fn(id);
    if (f) [f.carrier, f.object] = [f.object, f.carrier];
  }

  /** Switching to harmful clears the level, back to useful sets 'adequate'. @param {string} id @param {string} type */
  setType(id, type) {
    const f = this.fn(id);
    if (!f || !TYPES.includes(type) || f.type === type) return;
    f.type = type;
    f.level = type === 'harmful' ? null : 'adequate';
  }

  /** @param {string} id @param {string} level */
  setLevel(id, level) {
    const f = this.fn(id);
    if (f && f.type === 'useful' && LEVELS.includes(level)) f.level = level;
  }

  /** @param {string} id */
  removeFunction(id) {
    this.functions = this.functions.filter((f) => f.id !== id);
  }

  /** Store a dragged position (rounded, clamped to ≥ 0). @param {string} id @param {number} x @param {number} y */
  movePosition(id, x, y) {
    if (!this.component(id)) return;
    this.positions[id] = { x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)) };
  }

  resetPositions() {
    this.positions = {};
  }

  /**
   * Drop a component whose name is blank — unless functions or ticked pairs use it.
   * @param {string} id
   * @returns {boolean} true if removed
   */
  discardIfEmpty(id) {
    const c = this.component(id);
    if (!c || c.name.trim()) return false;
    if (this.impactOf(id) > 0 || this.interactions.some((i) => i.a === id || i.b === id)) return false;
    this.removeComponent(id);
    return true;
  }

  /** Tick a pair (sorted, no duplicates, no self pairs); lifts an exclusion. @private */
  _tick(a, b) {
    if (!a || !b || a === b) return;
    const k = pairKey(a, b);
    this.exclusions = this.exclusions.filter((x) => pairKey(x.a, x.b) !== k);
    if (this.interactions.some((i) => pairKey(i.a, i.b) === k)) return;
    this.interactions.push(a < b ? { a, b } : { a: b, b: a });
  }

  /** Exclude a pair (sorted, no duplicates, no self pairs). @private */
  _exclude(a, b) {
    if (!a || !b || a === b || this.isExcluded(a, b)) return;
    this.exclusions.push(a < b ? { a, b } : { a: b, b: a });
  }
}
