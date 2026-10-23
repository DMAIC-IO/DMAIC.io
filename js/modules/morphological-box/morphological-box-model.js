/**
 * D.Mike — Morphological Box Model (morphological-box-model.js)
 *
 * Parameters with alternative options, pairwise incompatibilities between
 * options of different parameters (cross-consistency assessment) and named
 * concepts that pick one option per parameter. No DOM, no i18n.
 */
import { uid } from '../../core/uid.js';

export const VIEWS = ['box', 'consistency'];

/** Search steps the consistent-combination count may take before it settles for a lower bound. */
export const COUNT_BUDGET = 200000;

/**
 * Canonical key of an unordered option pair.
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Count the combinations (one option per parameter) that contain no
 * conflicting pair. Backtracking that prunes a branch as soon as the new pick
 * conflicts with an earlier one; after `budget` visited nodes it stops and
 * reports the count so far as a lower bound.
 * @param {Array<{ options: Array<{ id: string }> }>} parameters
 * @param {Set<string>} conflictKeys keys built by `pairKey`
 * @param {number} [budget]
 * @returns {{ count: number, exact: boolean }}
 */
export function countConsistent(parameters, conflictKeys, budget = COUNT_BUDGET) {
  const levels = parameters.filter(p => p.options.length > 0).map(p => p.options.map(o => o.id));
  if (levels.length === 0) return { count: 0, exact: true };
  if (conflictKeys.size === 0) {
    return { count: levels.reduce((n, opts) => n * opts.length, 1), exact: true };
  }
  const picked = [];
  let count = 0;
  let steps = 0;
  let exact = true;
  const visit = (depth) => {
    if (depth === levels.length) { count++; return; }
    for (const id of levels[depth]) {
      if (++steps > budget) { exact = false; return; }
      if (picked.some(p => conflictKeys.has(pairKey(p, id)))) continue;
      picked.push(id);
      visit(depth + 1);
      picked.pop();
      if (!exact) return;
    }
  };
  visit(0);
  return { count, exact };
}

export class Option {
  id = uid()
  label = ''

  toJSON() {
    return { id: this.id, label: this.label };
  }

  static fromJSON(d) {
    const o = new Option();
    if (typeof d?.id === 'string' && d.id) o.id = d.id;
    if (typeof d?.label === 'string') o.label = d.label;
    return o;
  }
}

export class Parameter {
  id = uid()
  name = ''
  /** @type {Option[]} */
  options = []

  toJSON() {
    return { id: this.id, name: this.name, options: this.options.map(o => o.toJSON()) };
  }

  static fromJSON(d) {
    const p = new Parameter();
    if (typeof d?.id === 'string' && d.id) p.id = d.id;
    if (typeof d?.name === 'string') p.name = d.name;
    if (Array.isArray(d?.options)) p.options = d.options.map(o => Option.fromJSON(o));
    return p;
  }
}

export class Concept {
  id = uid()
  name = ''
  /** @type {Record<string, string>} parameter id → option id */
  picks = {}

  toJSON() {
    return { id: this.id, name: this.name, picks: { ...this.picks } };
  }

  static fromJSON(d) {
    const c = new Concept();
    if (typeof d?.id === 'string' && d.id) c.id = d.id;
    if (typeof d?.name === 'string') c.name = d.name;
    if (d?.picks && typeof d.picks === 'object') {
      for (const [k, v] of Object.entries(d.picks)) if (typeof v === 'string') c.picks[k] = v;
    }
    return c;
  }
}

export class State {
  static VERSION = '1.0';
  static ID = 'morphological-box';

  _schema = { name: State.ID, version: State.VERSION }
  /**
   * @type {Parameter[]} the parameters (rows of the box) in display order;
   *   each has `id`, `name` and `options` (`{ id, label }` in display order)
   */
  parameters = []
  /**
   * @type {string[][]} the incompatible option pairs, each `[optionIdA,
   *   optionIdB]` sorted, always options of two different parameters
   */
  conflicts = []
  /**
   * @type {Concept[]} the concepts in creation order; each has `id`, `name`
   *   and `picks` (parameter id → chosen option id, at most one per parameter)
   */
  concepts = []
  /** @type {string} id of the concept a click in the box edits; empty without concepts */
  activeConceptId = ''
  /** @type {string} the visible view: `box` or `consistency` */
  view = 'box'

  hasContent() {
    return this.parameters.length > 0;
  }

  // ── Parameters and options ─────────────────────────────────

  /**
   * @param {string} id
   * @returns {Parameter|undefined}
   */
  findParameter(id) {
    return this.parameters.find(p => p.id === id);
  }

  /**
   * The parameter that holds an option.
   * @param {string} optionId
   * @returns {Parameter|undefined}
   */
  parameterOf(optionId) {
    return this.parameters.find(p => p.options.some(o => o.id === optionId));
  }

  /**
   * @param {string} optionId
   * @returns {Option|undefined}
   */
  findOption(optionId) {
    return this.parameterOf(optionId)?.options.find(o => o.id === optionId);
  }

  /** @returns {string[]} every option id, in box order */
  optionIds() {
    return this.parameters.flatMap(p => p.options.map(o => o.id));
  }

  /**
   * Append a parameter with one empty option.
   * @param {string} [name]
   * @returns {string} id of the new parameter
   */
  addParameter(name = '') {
    const p = new Parameter();
    p.name = name;
    p.options.push(new Option());
    this.parameters.push(p);
    return p.id;
  }

  /**
   * Remove a parameter together with its options' conflicts and picks.
   * @param {string} parameterId
   */
  removeParameter(parameterId) {
    const p = this.findParameter(parameterId);
    if (!p) return;
    const gone = new Set(p.options.map(o => o.id));
    this.parameters = this.parameters.filter(x => x !== p);
    this.conflicts = this.conflicts.filter(([a, b]) => !gone.has(a) && !gone.has(b));
    for (const c of this.concepts) delete c.picks[parameterId];
  }

  /**
   * Append an option to a parameter.
   * @param {string} parameterId
   * @param {string} [label]
   * @returns {string} id of the new option
   */
  addOption(parameterId, label = '') {
    const o = new Option();
    o.label = label;
    this.findParameter(parameterId).options.push(o);
    return o.id;
  }

  /**
   * Remove an option together with its conflicts and the picks that name it.
   * @param {string} optionId
   */
  removeOption(optionId) {
    const p = this.parameterOf(optionId);
    if (!p) return;
    p.options = p.options.filter(o => o.id !== optionId);
    this.conflicts = this.conflicts.filter(([a, b]) => a !== optionId && b !== optionId);
    for (const c of this.concepts) if (c.picks[p.id] === optionId) delete c.picks[p.id];
  }

  // ── Conflicts ──────────────────────────────────────────────

  /**
   * @param {string} a option id
   * @param {string} b option id
   * @returns {boolean}
   */
  isConflict(a, b) {
    const key = pairKey(a, b);
    return this.conflicts.some(([x, y]) => pairKey(x, y) === key);
  }

  /**
   * Mark or clear an incompatibility between two options.
   * @param {string} a option id
   * @param {string} b option id
   * @param {boolean} incompatible
   * @throws {Error} when both options belong to the same parameter
   */
  setConflict(a, b, incompatible) {
    if (this.parameterOf(a) === this.parameterOf(b)) {
      throw new Error('options of the same parameter exclude each other already');
    }
    const key = pairKey(a, b);
    this.conflicts = this.conflicts.filter(([x, y]) => pairKey(x, y) !== key);
    if (incompatible) this.conflicts.push(a < b ? [a, b] : [b, a]);
  }

  // ── Counting ───────────────────────────────────────────────

  /** @returns {number} all combinations of one option per non-empty parameter */
  combinationCount() {
    const sizes = this.parameters.map(p => p.options.length).filter(n => n > 0);
    return sizes.length ? sizes.reduce((n, k) => n * k, 1) : 0;
  }

  /** @returns {{ count: number, exact: boolean }} combinations without a conflicting pair */
  consistentCount() {
    return countConsistent(this.parameters, new Set(this.conflicts.map(([a, b]) => pairKey(a, b))));
  }

  // ── Concepts ───────────────────────────────────────────────

  /**
   * @param {string} id
   * @returns {Concept|undefined}
   */
  findConcept(id) {
    return this.concepts.find(c => c.id === id);
  }

  /**
   * Append a concept and make it the active one.
   * @param {string} [name]
   * @returns {string} id of the new concept
   */
  addConcept(name = '') {
    const c = new Concept();
    c.name = name;
    this.concepts.push(c);
    this.activeConceptId = c.id;
    return c.id;
  }

  /**
   * Remove a concept; the active one moves to the first remaining concept.
   * @param {string} conceptId
   */
  removeConcept(conceptId) {
    this.concepts = this.concepts.filter(c => c.id !== conceptId);
    if (this.activeConceptId === conceptId) this.activeConceptId = this.concepts[0]?.id ?? '';
  }

  /**
   * Pick an option of a parameter for a concept; `''` clears the pick.
   * @param {string} conceptId
   * @param {string} parameterId
   * @param {string} optionId
   * @throws {Error} when the option is not one of the parameter's
   */
  setConceptPick(conceptId, parameterId, optionId) {
    const c = this.findConcept(conceptId);
    if (optionId === '') { delete c.picks[parameterId]; return; }
    if (!this.findParameter(parameterId)?.options.some(o => o.id === optionId)) {
      throw new Error(`option ${optionId} does not belong to parameter ${parameterId}`);
    }
    c.picks[parameterId] = optionId;
  }

  /**
   * The picked option ids of a concept, in box order.
   * @param {string} conceptId
   * @returns {string[]}
   */
  conceptOptionIds(conceptId) {
    const c = this.findConcept(conceptId);
    if (!c) return [];
    return this.parameters.map(p => c.picks[p.id]).filter(Boolean);
  }

  /**
   * The incompatible pairs inside a concept, in box order.
   * @param {string} conceptId
   * @returns {string[][]}
   */
  conceptConflicts(conceptId) {
    const ids = this.conceptOptionIds(conceptId);
    const out = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        if (this.isConflict(ids[i], ids[j])) out.push([ids[i], ids[j]]);
      }
    }
    return out;
  }

  /**
   * True when the concept picks an option in every parameter that has options.
   * @param {string} conceptId
   * @returns {boolean}
   */
  isConceptComplete(conceptId) {
    const c = this.findConcept(conceptId);
    return !!c && this.parameters.every(p => p.options.length === 0 || !!c.picks[p.id]);
  }

  toJSON() {
    return {
      _schema: { ...this._schema },
      parameters: this.parameters.map(p => p.toJSON()),
      conflicts: this.conflicts.map(pair => [...pair]),
      concepts: this.concepts.map(c => c.toJSON()),
      activeConceptId: this.activeConceptId,
      view: this.view,
    };
  }

  static fromJSON(d) {
    const s = new State();
    if (!d) return s;
    if (Array.isArray(d.parameters)) s.parameters = d.parameters.map(p => Parameter.fromJSON(p));

    // Drop references to options that no longer exist, so every later
    // operation can trust the ids it finds.
    const seen = new Set();
    if (Array.isArray(d.conflicts)) {
      for (const pair of d.conflicts) {
        if (!Array.isArray(pair) || pair.length !== 2) continue;
        const [a, b] = pair;
        const pa = s.parameterOf(a);
        const pb = s.parameterOf(b);
        if (!pa || !pb || pa === pb || seen.has(pairKey(a, b))) continue;
        seen.add(pairKey(a, b));
        s.conflicts.push(a < b ? [a, b] : [b, a]);
      }
    }
    if (Array.isArray(d.concepts)) {
      s.concepts = d.concepts.map(c => Concept.fromJSON(c));
      for (const c of s.concepts) {
        for (const [paramId, optionId] of Object.entries(c.picks)) {
          if (!s.findParameter(paramId)?.options.some(o => o.id === optionId)) delete c.picks[paramId];
        }
      }
    }
    s.activeConceptId = s.findConcept(d.activeConceptId) ? d.activeConceptId : (s.concepts[0]?.id ?? '');
    if (VIEWS.includes(d.view)) s.view = d.view;
    return s;
  }
}
