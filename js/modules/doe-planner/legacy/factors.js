/**
 * D.Mike — DoE planner factors (viewmodel/factors.js)
 *
 * Sub-viewmodel of the factor and response lists: names, units, kinds and
 * levels of the factors; names and units of the responses. It writes to
 * the model and saves; the shell's signature watcher regenerates the
 * design. Knows the model, the pure doe-planner-*.js helpers and
 * core modules — never a sibling or the shell.
 */
import { letter } from '../doe-planner-model.js';
import { requireEnum, requireIndex, requireKnownId, requireNumericText, requireText } from '../../../core/agent/agent-argcheck.js';

/** Factor kinds. */
const FACTOR_KINDS = ['continuous', 'categorical'];

export class FactorsViewModel {
  /**
   * Gets only what exists before the mount; the model comes with attach().
   * @param {{t: function(string, object=): string, context: object, container: function(): ?Element}} deps
   */
  constructor({ t, context, container }) {
    this._t = t;
    this._context = context;
    this._container = container;
    /** @type {?object} the component's State, set by attach() */
    this.model = null;
    this._save = () => {};
  }

  /**
   * Binds the component's model and its save.
   * @noagent lifecycle
   * @param {{model: object, save: function(): void}} binding
   */
  attach({ model, save }) {
    this.model = model;
    this._save = save;
  }

  /**
   * Nothing to release: no listeners, timers or widgets.
   * @noagent lifecycle
   */
  detach() { this._save = () => {}; }

  // ── View helpers ──────────────────────────────────────────

  /** @noagent view transform @param {number} i @returns {string} A, B, … */
  factorLetter(i) { return letter(i); }

  /** @noagent view transform @param {number} i @returns {string} Y1, Y2, … */
  responseLetter(i) { return `Y${i + 1}`; }

  /** @noagent view transform @param {{kind: string}} f @returns {boolean} */
  isCategorical(f) { return f.kind === 'categorical'; }

  /** @noagent view transform @param {{kind: string}} f @returns {'continuous'|'categorical'} */
  factorKind(f) { return f.kind === 'categorical' ? 'categorical' : 'continuous'; }

  /** @noagent view transform @param {{name: string}} f @returns {string} error class for a duplicate name */
  factorNameClass(f) {
    const n = f.name.trim().toLowerCase();
    if (!n) return '';
    const count = this.model.factors.filter((x) => x.name.trim().toLowerCase() === n).length;
    return count > 1 ? 'field--error' : '';
  }

  /** @noagent view transform @param {{name: string}} f @returns {string} */
  factorNameTitle(f) { return this.factorNameClass(f) ? this._t('duplicateFactorError') : ''; }

  /** @noagent view transform @param {{kind: string}} f @returns {string} */
  factorUnitTitle(f) { return this.isCategorical(f) ? this._t('factorUnitCategoricalDisabled') : ''; }

  /** @noagent view transform @param {{kind: string}} f @returns {string} */
  levelPlaceholder(f) { return this.isCategorical(f) ? this._t('factorLevelLabelPlaceholder') : '…'; }

  // ── Factors ───────────────────────────────────────────────

  /**
   * Add an empty continuous factor with two empty levels. Forbidden factor
   * combinations of an optimal design are cleared: they list one value per factor.
   * @agent
   * @returns {number} the id of the new factor
   */
  addFactor() {
    this.model.addFactor('', '');
    if (Array.isArray(this.model.options.forbiddenVertices) && this.model.options.forbiddenVertices.length) {
      this.model.options.forbiddenVertices = [];
    }
    this._save();
    return this.model.factors[this.model.factors.length - 1].id;
  }

  /**
   * Remove a factor. The model terms and forbidden combinations of an optimal design are reset.
   * @agent
   * @param {number} factorId the factor
   * @returns {void}
   * @throws {Error} if the factor is unknown
   */
  removeFactor(factorId) {
    requireKnownId('factorId', factorId, this.model.factors.map((f) => f.id));
    this.model.removeFactor(factorId);
    this._save();
  }

  /**
   * Set a factor's name; names must differ, regardless of case.
   * @agent
   * @param {number} factorId the factor
   * @param {string} name the name; "" clears it
   * @returns {void}
   * @throws {Error} if the factor is unknown or the name not a string
   */
  setFactorName(factorId, name) {
    requireKnownId('factorId', factorId, this.model.factors.map((f) => f.id));
    const value = requireText('name', name);
    this.model.factors.find((f) => f.id === factorId).name = value;
    this._save();
  }

  /**
   * Set a continuous factor's unit.
   * @agent
   * @param {number} factorId the factor
   * @param {string} unit the unit; "" clears it
   * @returns {void}
   * @throws {Error} if the factor is unknown, or categorical and the unit not empty
   */
  setFactorUnit(factorId, unit) {
    requireKnownId('factorId', factorId, this.model.factors.map((f) => f.id));
    const value = requireText('unit', unit);
    const f = this.model.factors.find((x) => x.id === factorId);
    if (f.kind === 'categorical' && value !== '') throw new Error(`factor ${factorId} is categorical and has no unit`);
    f.unit = value;
    this._save();
  }

  /**
   * Make a factor continuous (numeric levels) or categorical (named levels, no unit).
   * @agent
   * @param {number} factorId the factor
   * @param {'continuous'|'categorical'} kind
   * @returns {void}
   * @throws {Error} if the factor or the kind is unknown
   */
  setFactorKind(factorId, kind) {
    requireKnownId('factorId', factorId, this.model.factors.map((f) => f.id));
    requireEnum('kind', kind, FACTOR_KINDS);
    const f = this.model.factors.find((x) => x.id === factorId);
    f.kind = kind;
    if (kind === 'categorical') f.unit = '';
    this._save();
  }

  /**
   * Set one level of a factor: a number for a continuous factor, a label for a categorical one.
   * @agent
   * @param {number} factorId the factor
   * @param {number} levelIdx 0 = lowest level
   * @param {string|number} value the level as text or number (stored as text)
   * @returns {void}
   * @throws {Error} if the factor or the level index is unknown, or value is neither text nor a finite number
   */
  setLevel(factorId, levelIdx, value) {
    requireKnownId('factorId', factorId, this.model.factors.map((f) => f.id));
    const f = this.model.factors.find((x) => x.id === factorId);
    requireIndex('levelIdx', levelIdx, f.levels.length, { existing: true });
    f.levels[levelIdx] = requireNumericText('value', value);
    this._save();
  }

  /**
   * Insert an empty level; more than two levels exclude the fractional and Plackett-Burman designs.
   * @agent
   * @param {number} factorId the factor
   * @param {number} at position of the new level, 0 = before the first
   * @returns {void}
   * @throws {Error} if the factor or the position is unknown
   */
  insertLevel(factorId, at) {
    requireKnownId('factorId', factorId, this.model.factors.map((f) => f.id));
    const f = this.model.factors.find((x) => x.id === factorId);
    requireIndex('at', at, f.levels.length);
    this.model.insertLevel(factorId, at);
    this._save();
  }

  /**
   * Remove a level; a factor keeps at least two.
   * @agent
   * @param {number} factorId the factor
   * @param {number} levelIdx the level
   * @returns {void}
   * @throws {Error} if the factor or level is unknown, or only two levels are left
   */
  removeLevel(factorId, levelIdx) {
    requireKnownId('factorId', factorId, this.model.factors.map((f) => f.id));
    const f = this.model.factors.find((x) => x.id === factorId);
    requireIndex('levelIdx', levelIdx, f.levels.length, { existing: true });
    if (f.levels.length <= 2) throw new Error(`factor ${factorId} keeps at least two levels`);
    this.model.removeLevel(factorId, levelIdx);
    this._save();
  }

  // ── Responses ─────────────────────────────────────────────

  /**
   * Add an empty response.
   * @agent
   * @returns {number} the index of the new response
   */
  addResponse() {
    this.model.addResponse();
    this._save();
    return this.model.responses.length - 1;
  }

  /**
   * Remove a response; the plan keeps at least one.
   * @agent
   * @param {number} index the response, 0 = Y1
   * @returns {void}
   * @throws {Error} if the index is unknown or it is the last response
   */
  removeResponse(index) {
    requireIndex('index', index, this.model.responses.length, { existing: true });
    if (this.model.responses.length <= 1) throw new Error('the plan keeps at least one response');
    this.model.removeResponse(index);
    this._save();
  }

  /**
   * Set a response's name.
   * @agent
   * @param {number} index the response, 0 = Y1
   * @param {string} name the name; "" clears it
   * @returns {void}
   * @throws {Error} if the index is unknown or the name not a string
   */
  setResponseName(index, name) {
    requireIndex('index', index, this.model.responses.length, { existing: true });
    this.model.responses[index].name = requireText('name', name);
    this._save();
  }

  /**
   * Set a response's unit.
   * @agent
   * @param {number} index the response, 0 = Y1
   * @param {string} unit the unit; "" clears it
   * @returns {void}
   * @throws {Error} if the index is unknown or the unit not a string
   */
  setResponseUnit(index, unit) {
    requireIndex('index', index, this.model.responses.length, { existing: true });
    this.model.responses[index].unit = requireText('unit', unit);
    this._save();
  }
}
