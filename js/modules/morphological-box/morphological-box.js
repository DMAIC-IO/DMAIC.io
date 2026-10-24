/**
 * D.Mike — Morphological Box Module (morphological-box.js)
 * Parameters × options, incompatible pairs and concept paths. DMAIC: Improve,
 * DMADV: Design.
 *
 * The model (morphological-box-model.js) holds the persisted state and the
 * counting; this data function holds the view transforms, the event
 * unpackers and the named write sinks that both the UI and the agent
 * surface use.
 *
 * @agent  Fully controllable through the viewmodel: add, name and remove
 *   parameters and options, mark incompatible option pairs, add, name and
 *   remove concepts, pick an option per parameter for a concept, choose the
 *   active concept and the view. Focus handling stays with the UI.
 */

import { createModule } from '../../core/template-module.js';
import { State, VIEWS } from './morphological-box-model.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { requireEnum, requireKnownId, requireText } from '../../core/agent/agent-argcheck.js';

/** Concept marker colours cycle through the chart palette (`--color-chart-1 … 8`). */
const PALETTE_SIZE = 8;

/**
 * @typedef {object} AgentRead
 * @property {object[]} parameters the parameters with their options, in box order
 * @property {string[]} optionIds the ids of all options, in box order
 * @property {string[][]} conflicts the incompatible option pairs
 * @property {object[]} concepts the concepts with their picks
 * @property {string} activeConceptId the concept a click in the box edits
 * @property {string} view the visible view
 * @property {number} combinationCount all combinations of one option per parameter
 * @property {number} consistentCount combinations without an incompatible pair
 * @property {boolean} consistentExact false when consistentCount is only a lower bound
 * @property {object[]} conceptChecks per concept: id, complete, conflicts
 */
export default createModule({
  config: {
    id: 'morphological-box',
    engine: 'alpine',
    phase: 'improve',
    icon: 'module.morphological-box',
    version: '1.0.0',
    meta: import.meta,
    actions: [
      { icon: 'action.add', title: 'addConcept', variant: 'primary', agentAction: 'addConcept', onClick: (d) => d.addConcept() },
    ],
  },
  Model: State,

  data(module, _t) {
    return {
      /**
       * Return the full read state of this instance, including the counts
       * and the per-concept checks.
       * @agent
       * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
       * @returns {AgentRead} the box, the counts and the concept checks
       */
      read(options) {
        const { count, exact } = this.model.consistentCount();
        return readAgentState('morphological-box', {
          ...this.model.toJSON(),
          optionIds: this.model.optionIds(),
          combinationCount: this.model.combinationCount(),
          consistentCount: count,
          consistentExact: exact,
          conceptChecks: this.model.concepts.map(c => ({
            id: c.id,
            complete: this.model.isConceptComplete(c.id),
            conflicts: this.model.conceptConflicts(c.id),
          })),
        }, options);
      },

      views: VIEWS,

      /** @noagent view transform: number in the active language. */
      formatCount(n) {
        return n.toLocaleString(module._context.i18n.getLanguage());
      },

      /** @noagent view transform: KPI text of the consistent count, "≥ n" when it is a lower bound. */
      consistentText() {
        const { count, exact } = this.model.consistentCount();
        return exact ? this.formatCount(count) : `≥ ${this.formatCount(count)}`;
      },

      /** @noagent view transform: warning colour when conflicts rule out every combination. */
      consistentKpiClass() {
        return this.model.combinationCount() > 0 && this.model.consistentCount().count === 0 ? 'dmike-kpi--warn' : '';
      },

      /** @noagent view transform: active class of a view tab. */
      tabClass(view) {
        return this.model.view === view ? 'dmike-tab--active' : '';
      },

      /** @noagent view transform: aria-selected of a view tab. */
      tabSelected(view) {
        return this.model.view === view ? 'true' : 'false';
      },

      /** @noagent view transform: roving tabindex of a view tab. */
      tabIndex(view) {
        return this.model.view === view ? 0 : -1;
      },

      /** @noagent view transform: colour class of the concept at an index. */
      colorClass(index) {
        return `morphological-box__color--c${(index % PALETTE_SIZE) + 1}`;
      },

      /** @noagent view transform: the concepts that pick an option, with their colour index. */
      markersFor(optionId) {
        const out = [];
        this.model.concepts.forEach((c, index) => {
          if (Object.values(c.picks).includes(optionId)) out.push({ id: c.id, name: c.name, index });
        });
        return out;
      },

      /** @noagent view transform: an option is picked by the active concept. */
      isPickedByActive(parameterId, optionId) {
        const c = this.model.findConcept(this.model.activeConceptId);
        return !!c && c.picks[parameterId] === optionId;
      },

      /** @noagent view transform: an option conflicts with a pick of the active concept in another parameter. */
      isBlockedByActive(parameterId, optionId) {
        const c = this.model.findConcept(this.model.activeConceptId);
        if (!c) return false;
        return Object.entries(c.picks).some(([p, o]) => p !== parameterId && this.model.isConflict(o, optionId));
      },

      /** @noagent view transform: state classes of an option cell. */
      optionCellClass(parameterId, optionId) {
        return {
          'morphological-box__option--picked': this.isPickedByActive(parameterId, optionId),
          'morphological-box__option--blocked': this.isBlockedByActive(parameterId, optionId),
        };
      },

      /** @noagent view transform: aria-pressed of a pick button. */
      pickPressed(parameterId, optionId) {
        return this.isPickedByActive(parameterId, optionId) ? 'true' : 'false';
      },

      /** @noagent view transform: pick buttons are disabled while no concept is active. */
      pickDisabled() {
        return !this.model.findConcept(this.model.activeConceptId);
      },

      /** @noagent view transform: radio group name of the active-concept choice, unique per instance. */
      activeRadioName() {
        return `morphological-box-active-${module._context.instanceId}`;
      },

      /** @noagent view transform: the label of an option, or a placeholder for an empty one. */
      optionText(optionId) {
        return this.model.findOption(optionId)?.label || _t('unnamedOption');
      },

      /** @noagent view transform: the name of a concept, or a placeholder for an empty one. */
      conceptText(concept) {
        return concept.name || _t('unnamedConcept');
      },

      /** @noagent view transform: status line of a concept (complete / incomplete / conflicts). */
      conceptStatus(concept) {
        const n = this.model.conceptConflicts(concept.id).length;
        if (n > 0) return _t('conceptConflicts').replace('{n}', String(n));
        return this.model.isConceptComplete(concept.id) ? _t('conceptComplete') : _t('conceptIncomplete');
      },

      /** @noagent view transform: status class of a concept. */
      conceptStatusClass(concept) {
        if (this.model.conceptConflicts(concept.id).length > 0) return 'morphological-box__concept-status--conflict';
        return this.model.isConceptComplete(concept.id) ? 'morphological-box__concept-status--complete' : '';
      },

      /** @noagent view transform: the incompatible pairs of a concept as "A ↔ B" texts. */
      conflictTexts(concept) {
        return this.model.conceptConflicts(concept.id).map(([a, b]) => `${this.optionText(a)} ↔ ${this.optionText(b)}`);
      },

      /** @noagent view transform: active class of a concept card. */
      conceptCardClass(concept) {
        return concept.id === this.model.activeConceptId ? 'morphological-box__concept--active' : '';
      },

      /** @noagent view transform: every option with its parameter, for the consistency matrix. */
      matrixOptions() {
        return this.model.parameters.flatMap(p => p.options.map(o => ({ id: o.id, parameterId: p.id })));
      },

      /** @noagent view transform: a matrix cell takes a checkbox (lower triangle, different parameters). */
      isPairCell(rowIndex, colIndex, row, col) {
        return colIndex < rowIndex && row.parameterId !== col.parameterId;
      },

      /** @noagent view transform: checked state of a matrix cell. */
      isConflictCell(row, col) {
        return this.model.isConflict(row.id, col.id);
      },

      /** @noagent view transform: aria label of a matrix checkbox. */
      pairLabel(row, col) {
        return _t('pairLabel').replace('{a}', this.optionText(row.id)).replace('{b}', this.optionText(col.id));
      },

      /** @noagent view transform: the parameter of a matrix row starts a new group. */
      rowGroupClass(rowIndex) {
        const opts = this.matrixOptions();
        return rowIndex > 0 && opts[rowIndex - 1].parameterId !== opts[rowIndex].parameterId ? 'morphological-box__matrix-row--group' : '';
      },

      /** @noagent view transform: the name of a parameter, or a placeholder for an empty one. */
      parameterText(parameterId) {
        return this.model.findParameter(parameterId)?.name || _t('unnamedParameter');
      },

      // ── Sinks: parameters and options ─────────────────────────

      /**
       * Append a parameter (a row of the box) with one empty option.
       * @agent
       * @returns {string} the id of the new parameter
       */
      addParameter() {
        const id = this.model.addParameter();
        this.$nextTick(() => {
          module._context.container?.querySelector(`[data-parameter-name="${id}"]`)?.focus();
        });
        return id;
      },

      /**
       * Set the name of a parameter.
       * @agent
       * @param {string} parameterId id of the parameter
       * @param {string} name the new name; the empty string clears it
       * @returns {void}
       * @throws {Error} when no parameter has this id or `name` is not a string
       */
      setParameterName(parameterId, name) {
        requireKnownId('parameterId', parameterId, this.model.parameters.map(p => p.id));
        requireText('name', name);
        this.model.findParameter(parameterId).name = name;
      },

      /**
       * Remove a parameter with its options, their incompatibilities and the
       * concept picks in it.
       * @agent
       * @param {string} parameterId id of the parameter
       * @returns {void}
       * @throws {Error} when no parameter has this id
       */
      removeParameter(parameterId) {
        requireKnownId('parameterId', parameterId, this.model.parameters.map(p => p.id));
        this.model.removeParameter(parameterId);
      },

      /**
       * Append an empty option to a parameter.
       * @agent
       * @param {string} parameterId id of the parameter
       * @returns {string} the id of the new option
       * @throws {Error} when no parameter has this id
       */
      addOption(parameterId) {
        requireKnownId('parameterId', parameterId, this.model.parameters.map(p => p.id));
        const id = this.model.addOption(parameterId);
        this.$nextTick(() => {
          module._context.container?.querySelector(`[data-option-label="${id}"]`)?.focus();
        });
        return id;
      },

      /**
       * Set the label of an option.
       * @agent
       * @param {string} optionId id of the option
       * @param {string} label the new label; the empty string clears it
       * @returns {void}
       * @throws {Error} when no option has this id or `label` is not a string
       */
      setOptionLabel(optionId, label) {
        requireKnownId('optionId', optionId, this.model.optionIds());
        requireText('label', label);
        this.model.findOption(optionId).label = label;
      },

      /**
       * Remove an option with its incompatibilities and the concept picks of it.
       * @agent
       * @param {string} optionId id of the option
       * @returns {void}
       * @throws {Error} when no option has this id
       */
      removeOption(optionId) {
        requireKnownId('optionId', optionId, this.model.optionIds());
        this.model.removeOption(optionId);
      },

      /**
       * Mark two options of different parameters as incompatible, or clear the mark.
       * @agent
       * @param {string} optionA id of the first option
       * @param {string} optionB id of the second option, from another parameter
       * @param {boolean} incompatible true marks the pair, false clears it
       * @returns {void}
       * @throws {Error} when an id names no option, both options belong to the
       *   same parameter, or `incompatible` is not true or false
       */
      setConflict(optionA, optionB, incompatible) {
        const ids = this.model.optionIds();
        requireKnownId('optionA', optionA, ids);
        requireKnownId('optionB', optionB, ids);
        requireEnum('incompatible', incompatible, [true, false]);
        this.model.setConflict(optionA, optionB, incompatible);
      },

      // ── Sinks: concepts ───────────────────────────────────────

      /**
       * Append an empty concept and make it the active one.
       * @agent
       * @returns {string} the id of the new concept
       */
      addConcept() {
        const id = this.model.addConcept();
        this.$nextTick(() => {
          module._context.container?.querySelector(`[data-concept-name="${id}"]`)?.focus();
        });
        return id;
      },

      /**
       * Set the name of a concept.
       * @agent
       * @param {string} conceptId id of the concept
       * @param {string} name the new name; the empty string clears it
       * @returns {void}
       * @throws {Error} when no concept has this id or `name` is not a string
       */
      setConceptName(conceptId, name) {
        requireKnownId('conceptId', conceptId, this.model.concepts.map(c => c.id));
        requireText('name', name);
        this.model.findConcept(conceptId).name = name;
      },

      /**
       * Remove a concept; if it was active, the first remaining one becomes active.
       * @agent
       * @param {string} conceptId id of the concept
       * @returns {void}
       * @throws {Error} when no concept has this id
       */
      removeConcept(conceptId) {
        requireKnownId('conceptId', conceptId, this.model.concepts.map(c => c.id));
        this.model.removeConcept(conceptId);
      },

      /**
       * Pick the option of a parameter for a concept, or clear the pick.
       * @agent
       * @param {string} conceptId id of the concept
       * @param {string} parameterId id of the parameter
       * @param {string} optionId id of one of the parameter's options; the
       *   empty string clears the pick
       * @returns {void}
       * @throws {Error} when an id is unknown or the option belongs to another parameter
       */
      setConceptPick(conceptId, parameterId, optionId) {
        requireKnownId('conceptId', conceptId, this.model.concepts.map(c => c.id));
        requireKnownId('parameterId', parameterId, this.model.parameters.map(p => p.id));
        const param = this.model.findParameter(parameterId);
        requireKnownId('optionId', optionId, ['', ...param.options.map(o => o.id)]);
        this.model.setConceptPick(conceptId, parameterId, optionId);
      },

      /**
       * Choose the concept a click in the box edits.
       * @agent
       * @param {string} conceptId id of the concept
       * @returns {void}
       * @throws {Error} when no concept has this id
       */
      setActiveConcept(conceptId) {
        requireKnownId('conceptId', conceptId, this.model.concepts.map(c => c.id));
        this.model.activeConceptId = conceptId;
      },

      /**
       * Switch between the box and the consistency matrix.
       * @agent
       * @param {'box'|'consistency'} view the view to show
       * @returns {void}
       * @throws {Error} when `view` is neither value
       */
      setView(view) {
        requireEnum('view', view, VIEWS);
        this.model.view = view;
      },

      // ── UI handlers ───────────────────────────────────────────

      /**
       * @noagent cell handler: toggles the active concept's pick in a
       * parameter. The outcome depends on the previous pick; the capability
       * is `setConceptPick`.
       */
      togglePick(parameterId, optionId) {
        const conceptId = this.model.activeConceptId;
        if (!this.model.findConcept(conceptId)) return;
        this.setConceptPick(conceptId, parameterId, this.isPickedByActive(parameterId, optionId) ? '' : optionId);
      },
    };
  },
});
