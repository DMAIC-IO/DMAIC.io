/**
 * D.Mike — TRIZ function analysis module.
 *
 * Four tabs: components, interaction matrix, function model, value & cost. The diagram
 * follows the org-chart pattern of project-charter: HTML boxes moved by the
 * module, a links-only node-diagram overlay for the arrows.
 *
 * @agent  Vollständig über das Viewmodel steuerbar: Komponenten mit Art,
 *   Notiz und Kosten, Interaktionspaare, Funktionen mit Verb, Parameter, Art
 *   und Stufe, Reiter, Rangkennzeichen und die Lage von Kästen und
 *   Pfeilbeschriftungen. Der Oberfläche vorbehalten bleiben das Ziehen mit
 *   der Maus, die Auswahl, die Rückfrage vor dem Löschen und der Bildexport.
 */

import { createModule } from '../../core/template-module.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import {
  requireBoolean, requireEnum, requireKnownId, requireNumber, requireText,
} from '../../core/agent/agent-argcheck.js';
import {
  State, KINDS, GROUPS, TYPES, LEVELS, TABS, orderedComponents, openPairs, functionRanks, disadvantages, functionPairs, valueCostRows,
} from './triz-function-analysis-model.js';
import {
  NODE_W, NODE_H, resolvePositions, buildFunctionDiagram,
} from './triz-function-analysis-diagram.js';

/** Arrow overlay chart per component root (not reactive, not persisted). */
const arrowCharts = new WeakMap();
/** Value & cost scatter per component root (not reactive, not persisted). */
const valueCostCharts = new WeakMap();
/** Crosshair at the middle of both normalised axes; top left = trimming candidates. */
const VC_SPLIT = 5;
const DRAG_THRESHOLD = 3;
const CANVAS_PAD = 20;
const CANVAS_MIN = { w: 480, h: 240 };
/** Room right of / below a dragged verb label (its centre) so it stays on the canvas. */
const LABEL_ROOM = 60;

const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉';
/** @param {number|string} n @returns {string} the digits of n as Unicode subscripts */
const subscript = (n) => String(n).replace(/\d/g, (d) => SUBSCRIPT_DIGITS[d]);

/** Next state of a matrix cell on click: empty → ticked → excluded → empty. */
const NEXT_PAIR_STATE = { none: 'ticked', ticked: 'excluded', excluded: 'none' };
const PAIR_STATES = ['none', 'ticked', 'excluded'];

/**
 * @typedef {object} AgentRead
 * @property {Array<{ id: string, name: string, kind: 'target'|'system'|'supersystem', note: string, cost: number|null }>} components  the components; exactly one may be the target
 * @property {Array<{ a: string, b: string }>} interactions  the ticked component pairs (unordered)
 * @property {Array<{ a: string, b: string }>} exclusions  the pairs explicitly marked as not interacting
 * @property {Array<{ id: string, carrier: string, verb: string, object: string, parameter: string, type: 'useful'|'harmful', level: 'adequate'|'insufficient'|'excessive'|null, note: string }>} functions  the directed functions carrier → object
 * @property {Object<string, { x: number, y: number }>} positions  dragged box positions by component id
 * @property {Object<string, { x: number, y: number }>} labels  dragged verb-label positions by function id
 * @property {'components'|'interactions'|'model'|'valueCost'} activeTab  the open tab
 * @property {boolean} showRanks  whether the diagram shows rank codes
 * @property {Array<{ a: string, b: string }>} openPairs  ticked pairs no function uses yet
 * @property {Array<{ functionId: string, rank: 'basic'|'additional'|'auxiliary', level: number|null }>} ranks  derived rank of every useful complete function
 * @property {Array<{ functionId: string, carrier: string, verb: string, object: string, parameter: string, kind: 'harmful'|'insufficient'|'excessive' }>} disadvantages  harmful, insufficient and excessive functions
 * @property {ValueCostRow[]} valueCost  function value and cost of each system component
 */

/**
 * @typedef {object} ValueCostRow
 * @property {string} id  id of the system component
 * @property {string} name  name of the component
 * @property {number} value  function value: 3 per basic, 2 per additional, 1 per auxiliary function it carries
 * @property {number} normValue  value normalised to 0…10 against the largest value
 * @property {number|null} cost  entered cost in euro, null when none
 * @property {number|null} normCost  cost normalised to 0…10 against the largest cost, null when none
 */

export default createModule({
  config: {
    id: 'triz-function-analysis',
    engine: 'alpine',
    phase: 'improve',
    icon: 'module.triz-function-analysis',
    version: '0.1.0',
    meta: import.meta,
    actions: [
      { icon: 'action.download', title: 'export.label', children: [
        { icon: 'format.png', title: 'export.png', onClick: (d) => d.exportDiagram('png') },
        { icon: 'format.svg', title: 'export.svg', onClick: (d) => d.exportDiagram('svg') },
      ] },
    ],
  },
  Model: State,

  data(module, _t) {
    const notify = (msg) => module._context.notify?.(msg);
    const label = (c) => c.name.trim() || _t('unnamed');
    /** B, Ad, A₁…Aₙ (subscript level saves room on the arrows); A without a way to a basic or additional function. */
    const rankCode = (r) => _t(`rankCode.${r.rank}`, { level: subscript(r.level ?? '') });

    return {
      TABS,
      KINDS,
      GROUPS,
      LEVELS,
      selectedId: null,

      /**
       * Den vollständigen Lesezustand dieser Instanz liefern.
       * @agent
       * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
       * @returns {AgentRead} Komponenten, Paare, Funktionen und die abgeleiteten Ränge, Nachteile und Wert-Kosten-Zeilen
       */
      read(options) {
        return readAgentState('triz-function-analysis', {
          ...this.model.toJSON(),
          openPairs: openPairs(this.model),
          ranks: [...functionRanks(this.model)].map(([functionId, r]) => ({ functionId, rank: r.rank, level: r.level })),
          disadvantages: disadvantages(this.model),
          valueCost: valueCostRows(this.model),
        }, options);
      },

      // ── Tabs ──
      /**
       * Open a tab.
       * @agent
       * @param {'components'|'interactions'|'model'|'valueCost'} tab the tab to open
       * @returns {void}
       * @throws {Error} if `tab` is not one of the four tabs
       */
      setTab(tab) {
        requireEnum('tab', tab, TABS);
        this.model.activeTab = tab;
      },
      /** @noagent view transform */
      tabLabel(tab) { return _t(`tab.${tab}`); },
      /** @noagent view transform */
      tabClass(tab) { return tab === this.model.activeTab ? 'dmike-tab--active' : ''; },
      /** @noagent view transform */
      contentClass(tab) { return tab === this.model.activeTab ? 'dmike-tab-content--active' : ''; },

      // ── Components ──
      /** @noagent view transform */
      groupLabel(kind) { return _t(`group.${kind}`); },
      /** @noagent view transform */
      componentsOf(kind) { return this.model.components.filter((c) => c.kind === kind); },
      /** @noagent view transform: the target group offers no second target. */
      canAdd(kind) { return kind !== 'target' || !this.model.components.some((c) => c.kind === 'target'); },
      /**
       * Append a component.
       * @agent
       * @param {'target'|'system'|'supersystem'} kind the kind of component
       * @param {string} [name] the name, empty by default
       * @returns {string|null} id of the new component, or null when `kind` is
       *   'target' and there already is a target (turn it into a system
       *   component with setComponentKind first)
       * @throws {Error} if `kind` is unknown or `name` is not a string
       */
      addComponent(kind, name = '') {
        requireEnum('kind', kind, KINDS);
        requireText('name', name);
        if (!this.canAdd(kind)) return null;
        return this.model.addComponent(kind, name).component.id;
      },
      /** @noagent UI handler: adds a component and focuses its name field. */
      newComponent(kind) {
        const id = this.addComponent(kind);
        if (!id) return;
        this.$nextTick(() => {
          this.$root.querySelector(`[data-role="component"][data-id="${id}"] [data-role="component-name"]`)?.focus();
        });
      },
      /**
       * Rename a component.
       * @agent
       * @param {string} componentId id of the component
       * @param {string} name the new name
       * @returns {void}
       * @throws {Error} if no component has this id or `name` is not a string
       */
      setComponentName(componentId, name) {
        this._component(componentId).name = requireText('name', name);
      },
      /**
       * Set the note of a component.
       * @agent
       * @param {string} componentId id of the component
       * @param {string} note the note; "" clears it
       * @returns {void}
       * @throws {Error} if no component has this id or `note` is not a string
       */
      setComponentNote(componentId, note) {
        this._component(componentId).note = requireText('note', note);
      },
      /**
       * Set the euro cost of a component for the value & cost analysis.
       * @agent
       * @param {string} componentId id of the component
       * @param {number|null} cost the cost in euro, at least 0; null clears it
       * @returns {void}
       * @throws {Error} if no component has this id or `cost` is neither null nor a number ≥ 0
       */
      setComponentCost(componentId, cost) {
        this._component(componentId);
        this.model.setCost(componentId, cost === null ? null : requireNumber('cost', cost, { min: 0 }));
      },
      /** @noagent UI handler: an invalid entry snaps back to the stored cost. */
      costChanged(c, ev) {
        // Unparsable text ('2e') reads as '' and would otherwise clear the cost.
        if (ev.target.validity.badInput || !this.model.setCost(c.id, ev.target.value)) {
          ev.target.value = this.costValue(c);
        }
      },
      /** @noagent view transform */
      costValue(c) { return c.cost ?? ''; },
      /**
       * Change the kind of a component. Making it the target turns the former
       * target into a system component.
       * @agent
       * @param {string} componentId id of the component
       * @param {'target'|'system'|'supersystem'} kind the new kind
       * @returns {string|null} id of the former target that became a system component, else null
       * @throws {Error} if no component has this id or `kind` is unknown
       */
      setComponentKind(componentId, kind) {
        this._component(componentId);
        requireEnum('kind', kind, KINDS);
        return this.model.setKind(componentId, kind)?.id ?? null;
      },
      /** @noagent UI handler: reports a demoted target. */
      kindChanged(c, ev) {
        const demotedId = this.setComponentKind(c.id, ev.target.value);
        if (demotedId) notify(_t('targetDemoted', { name: label(this.model.component(demotedId)) }));
      },
      /** @noagent UI handler: a row left without a name disappears on blur. */
      discardIfEmpty(c) {
        if (this.model.discardIfEmpty(c.id) && this.selectedId === c.id) this.selectedId = null;
      },
      /**
       * Remove a component together with its interactions and functions.
       * @agent
       * @param {string} componentId id of the component
       * @returns {void}
       * @throws {Error} if no component has this id
       */
      removeComponent(componentId) {
        this._component(componentId);
        this.model.removeComponent(componentId);
        if (this.selectedId === componentId) this.selectedId = null;
      },
      /**
       * @noagent UI handler: asks before deleting and then delegates to
       *   removeComponent(). An agent must not trigger a confirmation dialog.
       */
      async deleteComponent(c) {
        const count = this.model.impactOf(c.id);
        const message = count
          ? _t('confirmDeleteUsed', { name: label(c), count })
          : _t('confirmDelete', { name: label(c) });
        const ok = await module._context.dialog.confirm({ message, danger: true });
        if (ok) this.removeComponent(c.id);
      },

      // ── Interaction matrix ──
      /** @noagent view transform */
      matrixComponents() { return orderedComponents(this.model.components); },
      /** @noagent view transform */
      headClass(c) { return `tfa__mh tfa__mh--${c.kind}`; },
      /** @noagent view transform */
      cellClass(ri, ci) {
        if (ci === ri) return 'tfa__cell tfa__cell--diag';
        return ci > ri ? 'tfa__cell' : 'tfa__cell tfa__cell--off';
      },
      /** @noagent view transform */
      isTicked(r, c) { return this.model.hasInteraction(r.id, c.id); },
      /** @noagent view transform */
      isExcluded(r, c) { return this.model.isExcluded(r.id, c.id); },
      /** @noagent view transform */
      cellState(r, c) { return this.model.pairState(r.id, c.id); },
      /** @noagent view transform */
      cellTitle(r, c) {
        if (this.isExcluded(r, c)) return _t('pairExcluded');
        const n = this.model.usersOf(r.id, c.id);
        return n ? _t('pairLocked', { count: n }) : '';
      },
      /**
       * Set whether two components interact.
       * @agent
       * @param {string} a id of the first component
       * @param {string} b id of the second component (order does not matter)
       * @param {'none'|'ticked'|'excluded'} state 'ticked' = they interact,
       *   'excluded' = explicitly no interaction, 'none' = not assessed yet
       * @returns {boolean} false when the pair is ticked and functions use it —
       *   it stays ticked until those functions are removed
       * @throws {Error} if an id is unknown, both ids are equal, or `state` is unknown
       */
      setPairState(a, b, state) {
        const ids = this.model.components.map((c) => c.id);
        requireKnownId('componentId', a, ids);
        requireKnownId('componentId', b, ids);
        if (a === b) throw new Error(`invalid b ${JSON.stringify(b)}; allowed: a component other than a`);
        requireEnum('state', state, PAIR_STATES);
        // The model only cycles; at most two steps reach any state.
        for (let i = 0; i < 2 && this.model.pairState(a, b) !== state; i++) {
          if (!this.model.toggleInteraction(a, b).ok) return false;
        }
        return true;
      },
      /** @noagent UI handler: one click advances the cell by one state. */
      toggleCell(r, c) {
        if (!this.setPairState(r.id, c.id, NEXT_PAIR_STATE[this.model.pairState(r.id, c.id)])) {
          notify(_t('pairLocked', { count: this.model.usersOf(r.id, c.id) }));
        }
      },
      /** @noagent view transform */
      matrixSummary() {
        return _t('matrixSummary', { count: this.model.interactions.length, open: openPairs(this.model).length });
      },

      // ── Function model: open pairs and function cards ──
      /** @noagent view transform */
      openPairChips() {
        const order = new Map(this.matrixComponents().map((c, i) => [c.id, i]));
        const name = (id) => label(this.model.component(id));
        return openPairs(this.model).map((p) => {
          const [a, b] = order.get(p.a) <= order.get(p.b) ? [p.a, p.b] : [p.b, p.a];
          return { key: `${a}|${b}`, a, b, label: `${name(a)} — ${name(b)}` };
        });
      },
      /**
       * Add a function carrier → object. Ticks the pair in the matrix.
       * @agent
       * @param {string} carrier id of the component that performs the function
       * @param {string} object id of the component it acts on
       * @returns {string} id of the new function (useful, adequate, no verb yet)
       * @throws {Error} if an id is unknown or both ids are equal
       */
      addFunction(carrier, object) {
        const ids = this.model.components.map((c) => c.id);
        requireKnownId('componentId', carrier, ids);
        requireKnownId('componentId', object, ids);
        if (carrier === object) throw new Error(`invalid object ${JSON.stringify(object)}; allowed: a component other than carrier`);
        return this.model.addFunction(carrier, object).id;
      },
      /** @noagent UI handler: a click on an open pair creates and selects a function. */
      createFromPair(p) { this.selectedId = this.addFunction(p.a, p.b); },
      /** @noagent view transform: function blocks, one per pair; a/b follow the matrix order so the header never flips. */
      pairBlocks() {
        const order = new Map(this.matrixComponents().map((c, i) => [c.id, i]));
        return functionPairs(this.model).map((g) => {
          const [a, b] = g.complete && order.get(g.b) < order.get(g.a) ? [g.b, g.a] : [g.a, g.b];
          return { ...g, a, b, label: `${this.endName(a)} — ${this.endName(b)}` };
        });
      },
      /** @noagent UI handler: another arrow on a pair, selected. */
      addOnPair(g) { this.selectedId = this.addFunction(g.a, g.b); },
      /** @noagent view transform */
      endName(id) {
        const c = this.model.component(id);
        return c ? label(c) : '—';
      },
      /** @noagent view transform */
      isForward(fn, g) { return fn.carrier === g.a; },
      /** @noagent view transform */
      isBackward(fn, g) { return fn.carrier !== g.a; },
      /** @noagent view transform */
      directionLabel(fn) { return `${this.endName(fn.carrier)} → ${this.endName(fn.object)}`; },
      /**
       * Set the verb of a function, e.g. "entfernt".
       * @agent
       * @param {string} functionId id of the function
       * @param {string} verb the verb
       * @returns {void}
       * @throws {Error} if no function has this id or `verb` is not a string
       */
      setFunctionVerb(functionId, verb) {
        this._fn(functionId).verb = requireText('verb', verb);
      },
      /**
       * Set the parameter of the object the function changes, e.g. "Belag".
       * @agent
       * @param {string} functionId id of the function
       * @param {string} parameter the parameter; "" clears it
       * @returns {void}
       * @throws {Error} if no function has this id or `parameter` is not a string
       */
      setFunctionParameter(functionId, parameter) {
        this._fn(functionId).parameter = requireText('parameter', parameter);
      },
      /**
       * Mark a function useful or harmful. Harmful clears the level, useful
       * sets it back to 'adequate'.
       * @agent
       * @param {string} functionId id of the function
       * @param {'useful'|'harmful'} type the function type
       * @returns {void}
       * @throws {Error} if no function has this id or `type` is unknown
       */
      setFunctionType(functionId, type) {
        this._fn(functionId);
        requireEnum('type', type, TYPES);
        this.model.setType(functionId, type);
      },
      /**
       * Set how well a useful function is performed.
       * @agent
       * @param {string} functionId id of the function
       * @param {'adequate'|'insufficient'|'excessive'} level the level
       * @returns {boolean} false when the function is harmful (it has no level)
       * @throws {Error} if no function has this id or `level` is unknown
       */
      setFunctionLevel(functionId, level) {
        const f = this._fn(functionId);
        requireEnum('level', level, LEVELS);
        if (f.type !== 'useful') return false;
        this.model.setLevel(functionId, level);
        return true;
      },
      /**
       * Swap carrier and object of a function.
       * @agent
       * @param {string} functionId id of the function
       * @returns {void}
       * @throws {Error} if no function has this id
       */
      swapDirection(functionId) {
        this._fn(functionId);
        this.model.swapDirection(functionId);
      },
      /**
       * Remove a function.
       * @agent
       * @param {string} functionId id of the function
       * @returns {void}
       * @throws {Error} if no function has this id
       */
      removeFunction(functionId) {
        this._fn(functionId);
        this.model.removeFunction(functionId);
        if (this.selectedId === functionId) this.selectedId = null;
      },
      /** @noagent view transform */
      rankLabel(fn) {
        const r = functionRanks(this.model).get(fn.id);
        return r ? `${_t(`rank.${r.rank}`)} (${rankCode(r)})` : '';
      },
      /**
       * Show or hide the rank codes (B, Ad, A₁ …) next to the verbs in the diagram.
       * @agent
       * @param {boolean} show true shows them
       * @returns {void}
       * @throws {Error} if `show` is not true or false
       */
      setShowRanks(show) {
        requireBoolean('show', show);
        this.model.showRanks = show;
      },
      /**
       * @noagent view transform
       * @returns {Map<string,string>|null} rank code per function id, null while switched off
       */
      rankLabels() {
        if (!this.model.showRanks) return null;
        return new Map([...functionRanks(this.model)].map(([id, r]) => [id, rankCode(r)]));
      },
      /** @noagent view transform */
      fnClass(fn) {
        return [
          // The row itself, or a component it uses, is selected
          this.selectedId && [fn.id, fn.carrier, fn.object].includes(this.selectedId) ? 'tfa__fn--selected' : '',
          fn.type === 'harmful' ? 'tfa__fn--harmful' : '',
        ].filter(Boolean).join(' ');
      },

      // ── Disadvantages ──
      /** @noagent view transform */
      disadvantageGroups() {
        const all = disadvantages(this.model);
        return ['harmful', 'insufficient', 'excessive']
          .map((kind) => ({
            kind,
            title: _t(`disadvantage.${kind}`),
            items: all.filter((d) => d.kind === kind).map((d) => ({ ...d, verb: d.verb || _t('verbMissing') })),
          }))
          .filter((g) => g.items.length > 0);
      },
      /** @noagent view transform */
      paramText(d) { return d.parameter ? ` (${d.parameter})` : ''; },

      // ── Value & cost ──
      /** @noagent view transform: table rows of the system components, formatted for the UI language. */
      vcRows() {
        const locale = module._context.i18n.getLanguage() === 'en' ? 'en-US' : 'de-DE';
        const int = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
        const dec = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
        const eur = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' });
        return valueCostRows(this.model).map((r) => ({
          id: r.id,
          name: label(r),
          value: int.format(r.value),
          normValue: dec.format(r.normValue),
          cost: r.cost === null ? '–' : eur.format(r.cost),
          normCost: r.normCost === null ? '–' : dec.format(r.normCost),
        }));
      },
      /**
       * @noagent view transform
       * @returns {string} hint shown instead of the plot, '' when there is something to plot
       */
      valueCostEmpty() {
        const rows = valueCostRows(this.model);
        if (rows.length === 0) return _t('vc.emptyComponents');
        return rows.some((r) => r.cost !== null) ? '' : _t('vc.emptyCosts');
      },
      /** @noagent chart redraw; called by x-effect, reads the model and writes nothing reactive. */
      drawValueCost() {
        const rows = valueCostRows(this.model).filter((r) => r.cost !== null);
        const chart = valueCostCharts.get(this.$root);
        if (!chart) return;
        module._context.chartManager.update(chart, {
          xLabel: _t('vc.axisValue'),
          yLabel: _t('vc.axisCost'),
          series: [{
            name: _t('vc.cost'),
            x: rows.map((r) => r.normValue),
            y: rows.map((r) => r.normCost),
            labels: rows.map((r) => label(r)),
          }],
        });
      },

      // ── Lifecycle: arrow overlay and value & cost chart ──
      /** @noagent per-instance lifecycle */
      init() {
        this.$nextTick(() => { this._mountArrows(); this._mountValueCost(); });
      },
      /** @noagent per-instance lifecycle */
      destroy() {
        this._unmounted = true;
        const cm = module._context.chartManager;
        for (const charts of [arrowCharts, valueCostCharts]) {
          const chart = charts.get(this.$root);
          if (chart) { cm.destroy(chart); charts.delete(this.$root); }
        }
      },
      _mountValueCost() {
        const host = this.$root.querySelector('[data-ref="value-cost-chart"]');
        if (!host) return;
        const root = this.$root;
        const cm = module._context.chartManager;
        const split = { value: VC_SPLIT, dash: 'dash', color: 'var(--color-text-secondary)' };
        cm.create(host, 'scatter', {
          title: '', xLabel: _t('vc.axisValue'), yLabel: _t('vc.axisCost'), showLegend: false,
          // Half a unit of margin keeps a point at 0 or 10 from being cut off.
          xMin: -0.5, xMax: 10.5, yMin: -0.5, yMax: 10.5,
          refLines: [{ dir: 'v', ...split }, { dir: 'h', ...split }],
          series: [],
        }).then((chart) => {
          if (!chart) return;
          // Unmounted while the chart type was loading: do not keep an orphan.
          if (this._unmounted || !root.isConnected) { cm.destroy(chart); return; }
          valueCostCharts.set(root, chart);
          this.drawValueCost();
        });
      },
      _mountArrows() {
        const host = this.$root.querySelector('[data-ref="arrows"]');
        if (!host) return;
        const root = this.$root;
        const cm = module._context.chartManager;
        cm.create(host, 'node-diagram', {
          showModebar: false, origin: 'zero', padding: 0, nodes: [], links: [], highlightClass: 'tfa__arrow--hl',
        }).then((chart) => {
          if (!chart) return;
          // Unmounted while the chart type was loading: do not keep an orphan.
          if (this._unmounted || !root.isConnected) { cm.destroy(chart); return; }
          arrowCharts.set(root, chart);
          this.drawArrows();
        });
      },

      /**
       * @noagent chart redraw. Called by x-effect (reads model + selection, writes
       * nothing reactive) and on every pointer move of a drag with the
       * dragged box's or verb label's live position as override.
       * @param {{positions?: Object, labels?: Object}} [override]
       */
      drawArrows(override = {}) {
        const { nodes, links } = buildFunctionDiagram({
          components: this.model.components,
          functions: this.model.functions,
          positions: { ...this.model.positions, ...override.positions },
          labels: { ...this.model.labels, ...override.labels },
        }, { selectedId: this.selectedId, rankLabels: this.rankLabels() });
        const chart = arrowCharts.get(this.$root);
        // Outlines come from the SVG (ellipse/hexagon), names from the draggable HTML boxes.
        const outlines = nodes.map((n) => ({ ...n, lines: [] }));
        if (chart) module._context.chartManager.update(chart, { nodes: outlines, links });
      },

      // ── Boxes ──
      /** @noagent view transform */
      canvasStyle() {
        const pos = Object.values(resolvePositions(this.model));
        const labels = Object.values(this.model.labels);
        const w = Math.max(CANVAS_MIN.w, ...pos.map((p) => p.x + NODE_W + CANVAS_PAD), ...labels.map((p) => p.x + LABEL_ROOM));
        const h = Math.max(CANVAS_MIN.h, ...pos.map((p) => p.y + NODE_H + CANVAS_PAD), ...labels.map((p) => p.y + LABEL_ROOM));
        return `width:${w}px;height:${h}px`;
      },
      /** @noagent view transform */
      nodeStyle(c) {
        const p = resolvePositions(this.model)[c.id];
        return `left:${p.x}px;top:${p.y}px;width:${NODE_W}px;height:${NODE_H}px`;
      },
      /** @noagent view transform */
      nodeClass(c) {
        return [`tfa__node--${c.kind}`, c.id === this.selectedId ? 'tfa__node--selected' : ''].filter(Boolean).join(' ');
      },
      /** @noagent pointer handler: drags a box, a click without moving selects it. */
      startDrag(c, ev) {
        if (ev.button !== 0) return;
        const el = ev.currentTarget;
        const start = resolvePositions(this.model)[c.id];
        const sx = ev.clientX, sy = ev.clientY;
        let moved = false, x = start.x, y = start.y;
        const onMove = (e) => {
          const dx = e.clientX - sx, dy = e.clientY - sy;
          if (!moved && Math.abs(dx) <= DRAG_THRESHOLD && Math.abs(dy) <= DRAG_THRESHOLD) return;
          moved = true;
          x = Math.max(0, start.x + dx);
          y = Math.max(0, start.y + dy);
          el.style.left = `${x}px`;
          el.style.top = `${y}px`;
          el.classList.add('tfa__node--drag');
          this.drawArrows({ positions: { [c.id]: { x, y } } });
        };
        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          el.classList.remove('tfa__node--drag');
          if (moved) this.moveComponent(c.id, x, y);
          else this.select(c.id);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      },
      /**
       * @noagent pointer handler. Drag a verb label (SVG overlay, delegated): the arrow bends at the
       * label. A click without moving selects the function.
       * @param {PointerEvent} ev
       */
      startLabelDrag(ev) {
        if (ev.button !== 0) return;
        const id = ev.target.closest?.('[data-part^="link-label"]')?.getAttribute('data-id');
        const link = id && buildFunctionDiagram(this.model).links.find((l) => l.id === id);
        if (!link) return;
        ev.preventDefault();
        const start = link.via ?? { x: (link.x1 + link.x2) / 2, y: (link.y1 + link.y2) / 2 };
        const sx = ev.clientX, sy = ev.clientY;
        let moved = false, x = start.x, y = start.y;
        const onMove = (e) => {
          const dx = e.clientX - sx, dy = e.clientY - sy;
          if (!moved && Math.abs(dx) <= DRAG_THRESHOLD && Math.abs(dy) <= DRAG_THRESHOLD) return;
          moved = true;
          x = Math.max(0, start.x + dx);
          y = Math.max(0, start.y + dy);
          this.drawArrows({ labels: { [id]: { x, y } } });
        };
        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          if (moved) this.moveLabel(id, x, y);
          else this.select(id);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      },
      /**
       * Place the box of a component in the function model.
       * @agent
       * @param {string} componentId id of the component
       * @param {number} x left edge in pixels, at least 0
       * @param {number} y top edge in pixels, at least 0
       * @returns {void}
       * @throws {Error} if no component has this id or a coordinate is not a number ≥ 0
       */
      moveComponent(componentId, x, y) {
        this._component(componentId);
        this.model.movePosition(componentId, requireNumber('x', x, { min: 0 }), requireNumber('y', y, { min: 0 }));
      },
      /**
       * Place the verb label of a function; the arrow bends there.
       * @agent
       * @param {string} functionId id of the function
       * @param {number} x label centre in pixels, at least 0
       * @param {number} y label centre in pixels, at least 0
       * @returns {void}
       * @throws {Error} if no function has this id or a coordinate is not a number ≥ 0
       */
      moveLabel(functionId, x, y) {
        this._fn(functionId);
        this.model.moveLabel(functionId, requireNumber('x', x, { min: 0 }), requireNumber('y', y, { min: 0 }));
      },
      /**
       * Put every box back to its automatic slot and straighten every arrow.
       * @agent
       * @returns {void}
       */
      resetLayout() { this.model.resetPositions(); },
      /** @noagent downloads a file. Export the function model offscreen (the canvas is HTML boxes); nothing without components. */
      async exportDiagram(fmt) {
        if (this.model.components.length === 0) return;
        const { nodes, links } = buildFunctionDiagram(this.model, { rankLabels: this.rankLabels() });
        await module._context.chartManager.exportOffscreen('node-diagram', { nodes, links, padding: 30 }, fmt, 'funktionsmodell');
      },

      // ── Selection ──
      /** @noagent UI selection, not persisted */
      select(id) { this.selectedId = this.selectedId === id ? null : id; },
      /** @noagent UI selection. Card clicks only select: editing a row must not toggle its selection. */
      selectFunction(id) { this.selectedId = id; },

      // ── Lookups with id check ──
      /** Component by id; throws with the known ids so an agent sees its typo. */
      _component(componentId) {
        requireKnownId('componentId', componentId, this.model.components.map((c) => c.id));
        return this.model.component(componentId);
      },
      /** Function by id; throws with the known ids. */
      _fn(functionId) {
        requireKnownId('functionId', functionId, this.model.functions.map((f) => f.id));
        return this.model.fn(functionId);
      },
    };
  },
});
