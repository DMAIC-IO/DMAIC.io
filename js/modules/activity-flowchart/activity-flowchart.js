/**
 * D.Mike — Activity Flowchart Module (activity-flowchart.js)
 * Chain of activities and decision diamonds. DMAIC phase: Analyze.
 *
 * Migrated-from-scratch createModule + Alpine CSP entry point (see Process
 * Map for the reference pattern this module follows). The Model
 * (activity-flowchart-model.js) holds the persisted state (steps[] with
 * kind/decision) plus all CRUD/reorder logic. This data-fn owns the view
 * transforms (decision-branch labels, rework-loop arc computation), the
 * chain drag/drop + textarea autosize (via chainViewMixin), the decision
 * branch-target popover, the generic cross-module import picker, and the
 * export dropdown (JSON now; PNG/SVG rendering follows in a later task once
 * the rework-arc layout is measured — see reworkLoops()).
 *
 * `help` is intentionally not imported/wired here — createModule resolves
 * it automatically from `<id>-help.js` via the build-generated help
 * registry (see core/help-registry.js), matching every other module.
 */

import { createModule } from '../../core/template-module.js';
import { downloadFile } from '../../core/export-utils.js';
import { chainViewMixin } from '../../core/flowchart/flowchart-view.js';
import {
  listSourceInstances, appendFromInstance,
} from '../../core/flowchart/flowchart-import.js';
import { ActivityModel, MAIN_BRANCH, BRANCH_PREFIX } from './activity-flowchart-model.js';

const IMPORT_SOURCES = ['process-map', 'sipoc'];

export default createModule({
  config: {
    id: 'activity-flowchart',
    engine: 'alpine',
    phase: 'analyze',
    icon: 'git-fork',
    version: '1.0.0',
    meta: import.meta,
    actions: [
      { icon: 'plus', title: 'addStep',
        variant: 'primary', onClick: (d) => d.model.addStep(d.model.steps.length) },
      { icon: 'git-fork', title: 'addDecision',
        onClick: (d) => d.model.addDecision(d.model.steps.length) },
      { icon: 'upload', title: 'importFrom',
        onClick: (d) => d._openImport() },
      { icon: 'download', title: 'export.label', children: [
        { icon: 'export-png',  title: 'export.png',  onClick: (d) => d.onExport('png') },
        { icon: 'export-svg',  title: 'export.svg',  onClick: (d) => d.onExport('svg') },
        { icon: 'export-json', title: 'export.json', onClick: (d) => d._exportJSON() },
      ] },
    ],
  },
  Model: ActivityModel,
  data: activityFlowchartData,
});

/**
 * Activity Flowchart data-fn — view transforms, drag/drop, decision popover,
 * import + export. Exported as a standalone function (not an inline object
 * shorthand) so connectorClass's diamond/gap class merge can be unit tested
 * without mounting the module via Alpine — see activity-flowchart.test.js.
 * @param {object} module - the createModule instance.
 * @param {(key: string) => string} _t - i18n helper.
 */
export function activityFlowchartData(module, _t) {
  return {
    ...chainViewMixin(module, _t, {
      autoSizeSelector: 'textarea.af__step-title, textarea.af__decision-label, textarea.af__step-description',
      dragRowSelector: '.af__step',
    }),

    // ── Lifecycle (per Alpine instance) ───────────────────────
    init() {
      this.$nextTick(() => this._autoSizeAll());
    },

    // Decision popover state (transient — never persisted). One id is
    // enough: only the no branch has a target to pick.
    _openMenuStepId: null,

    isDecision(step) { return step?.kind === 'decision'; },
    /**
     * The word that names a branch at its vertex.
     * @param {'yes'|'no'} branch
     * @returns {string} translated "Yes" / "No".
     */
    branchWord(branch) { return _t(branch === 'yes' ? 'yes' : 'no'); },
    /**
     * How a step names itself when another step points at it. A diamond keeps
     * its text in `decision.label` and never sets `title`, so reading `title`
     * alone left every decision reading as "(unnamed)" wherever it was a
     * target — in an exit, in the picker list.
     * @param {object} step
     * @returns {string}
     */
    stepLabel(step) {
      if (step?.kind === 'decision') return step.decision?.label || _t('unnamedDecision');
      return step?.title || _t('unnamedStep');
    },
    /**
     * The NO branch's target, spelled out only where it deviates from simply
     * flowing on to the next step — process end, or a jump to another step.
     * A jump BACK is a rework loop and says so with a ↩.
     *
     * The yes branch has no counterpart here: yes IS the flow on to the
     * right, so the chain arrow to the next step already says where it goes.
     *
     * @param {object} step - The decision step.
     * @returns {string} Target text, or `''` when the branch just flows on.
     */
    branchTarget(step) {
      const target = step?.decision?.noTarget;
      if (!target || target === 'next') return '';
      if (target === 'end') return _t('end');
      const targetIdx = this.model.steps.findIndex((s) => s.id === target);
      if (targetIdx === -1) return '';
      const ownIdx = this.model.steps.findIndex((s) => s.id === step.id);
      const label = this.stepLabel(this.model.steps[targetIdx]);
      return targetIdx < ownIdx ? `↩ ${label}` : label;
    },
    /**
     * The bands as rows, top to bottom: main path, then one band per decision,
     * depth-first under the band its decision stands in. None of this is
     * persisted — the rows are a view onto the decisions in `steps[]`.
     * @returns {Array<{id: string, ownerId: string|null, label: string, depth: number}>}
     */
    bands() {
      const rows = [];
      const walk = (branchId, owner, depth) => {
        rows.push({
          id: branchId,
          ownerId: owner ? owner.id : null,
          label: owner
            ? _t('bandLabel', { q: owner.decision?.label || _t('unnamedDecision') })
            : _t('mainPath'),
          depth,
        });
        this.model.steps
          .filter((s) => s.kind === 'decision' && s.branchId === branchId)
          .forEach((d) => walk(BRANCH_PREFIX + d.id, d, depth + 1));
      };
      walk(MAIN_BRANCH, null, 0);
      return rows;
    },

    /**
     * Column for every step, and how many columns the chart needs.
     *
     * Each band packs its own steps: a step takes its band's next free column,
     * and a decision hands its own column on to the band it opens — which is
     * what puts the first detour card directly below the diamond. Nothing else
     * reserves a column, so the main path stays dense where a detour runs
     * beside it instead of tearing open across it.
     *
     * Only a detour that rejoins FORWARD imposes anything: its target has to
     * sit at least one column past the detour's last card, or the rejoin would
     * point backwards. Where that does not hold, the target and everything
     * after it in the chain move right — repeated until nothing is left to
     * push, because one shift can create the next. A dead end or a rework loop
     * constrains nothing.
     *
     * @returns {{colOf: Map<string, number>, count: number}} 1-based columns.
     */
    _layout() {
      const steps = this.model.steps;
      const colOf = new Map();
      const next = new Map([[MAIN_BRANCH, 1]]);

      steps.forEach((s) => {
        const c = next.get(s.branchId) ?? 1;
        colOf.set(s.id, c);
        next.set(s.branchId, c + 1);
        if (s.kind === 'decision') next.set(BRANCH_PREFIX + s.id, c);
      });

      const indexOf = new Map(steps.map((s, i) => [s.id, i]));
      for (let guard = 0; guard < steps.length + 1; guard++) {
        let shifted = false;
        for (const d of steps) {
          if (d.kind !== 'decision') continue;
          const target = this._rejoinTarget(d);
          if (!target) continue;                       // dead end or rework loop
          const band = BRANCH_PREFIX + d.id;
          let last = colOf.get(d.id);
          steps.forEach((s) => {
            if (s.branchId === band) last = Math.max(last, colOf.get(s.id));
          });
          const need = last + 1 - colOf.get(target.id);
          if (need <= 0) continue;
          const from = indexOf.get(target.id);
          steps.forEach((s, i) => {
            if (i >= from) colOf.set(s.id, colOf.get(s.id) + need);
          });
          shifted = true;
        }
        if (!shifted) break;
      }

      let count = 0;
      colOf.forEach((c) => { count = Math.max(count, c); });
      return { colOf, count };
    },

    /**
     * The step a decision's detour rejoins, but only when that is FORWARD in
     * the chain — a dead end and a rework loop both pull nothing along.
     * @param {object} decision
     * @returns {object|null}
     */
    _rejoinTarget(decision) {
      const steps = this.model.steps;
      const own = steps.indexOf(decision);
      const target = decision.decision?.noTarget || 'next';
      if (target === 'end') return null;
      const found = target === 'next'
        ? steps.slice(own + 1).find((s) => s.branchId === decision.branchId)
        : steps.find((s) => s.id === target);
      if (!found) return null;
      return steps.indexOf(found) > own ? found : null;
    },

    /**
     * Grid placement for a step: its band's row, its packed column.
     * Assembled here because Alpine CSP allows one plain method call per
     * binding (.claude/alpine.md).
     * @param {object} step
     * @returns {string}
     */
    stepStyle(step) {
      const rows = this.bands();
      const row = rows.findIndex((b) => b.id === step.branchId) + 1;
      const col = this._layout().colOf.get(step.id) + (this.hasBands() ? 1 : 0);
      return `grid-row: ${row}; grid-column: ${col}`;
    },

    /**
     * Grid placement for a band's lane — the full-width strip behind its
     * cards. It carries the band's rail and takes the drop that moves a card
     * into this band.
     * @param {object} band
     * @returns {string}
     */
    laneStyle(band) {
      const row = this.bands().findIndex((b) => b.id === band.id) + 1;
      const off = this.hasBands() ? 1 : 0;
      // Spelled out rather than `/ -1`: -1 counts from the end of the EXPLICIT
      // grid, and every column here is implicit — created by placing an item
      // beyond the template. The lane would collapse onto the label column.
      // +2 covers the tail that sits one column past the last card.
      const end = this._layout().count + off + 2;
      return `grid-row: ${row}; grid-column: ${1 + off} / ${end}`;
    },

    /**
     * Grid placement for a band's tail — placeholder and exit, directly after
     * that band's last card rather than in a column shared by every band.
     * @param {object} band
     * @returns {string}
     */
    tailStyle(band) {
      const { colOf } = this._layout();
      const owner = this.model.steps.find((s) => s.id === band.ownerId);
      let last = owner ? colOf.get(owner.id) : 0;
      this.model.steps.forEach((s) => {
        if (s.branchId === band.id) last = Math.max(last, colOf.get(s.id));
      });
      const row = this.bands().findIndex((b) => b.id === band.id) + 1;
      return `grid-row: ${row}; grid-column: ${last + 1 + (this.hasBands() ? 1 : 0)}`;
    },

    /**
     * Grid placement for a band's rail — the continuous line that makes the
     * band read as one flow. It runs from the band's first column to its tail,
     * so a detour starts under the diamond it hangs off and ends at its own
     * exit. Now a plain grid child: with every item explicitly placed there is
     * no auto-placement left for it to disturb.
     * @param {object} band
     * @returns {string}
     */
    railStyle(band) {
      const { colOf } = this.model.steps.length ? this._layout() : { colOf: new Map() };
      const owner = this.model.steps.find((s) => s.id === band.ownerId);
      const own = this.model.steps.filter((s) => s.branchId === band.id).map((x) => colOf.get(x.id));
      if (owner) own.push(colOf.get(owner.id));
      if (own.length === 0) return 'display: none';
      const off = this.hasBands() ? 1 : 0;
      const row = this.bands().findIndex((b) => b.id === band.id) + 1;
      const from = Math.min(...own) + off;
      const to = Math.max(...own) + off + (this.isMainBand(band) ? 1 : 2);
      return `grid-row: ${row}; grid-column: ${from} / ${to}`;
    },

    /**
     * Is this step the first card of its band? Such a card has no arrow to its
     * left — what precedes it is the diamond one row up, not a card beside it.
     * @param {object} step
     * @returns {boolean}
     */
    isBandStart(step) {
      return this.model.steps.filter((s) => s.branchId === step.branchId)[0]?.id === step.id;
    },

    /** True as soon as there is at least one band besides the main path. */
    hasBands() { return this.bands().length > 1; },

    /** @param {object} band @returns {boolean} */
    isMainBand(band) { return band?.id === MAIN_BRANCH; },

    /**
     * Does this step belong in this band's row?
     * @param {object} step @param {string} bandId @returns {boolean}
     */
    stepInBand(step, bandId) { return step?.branchId === bandId; },

    /**
     * The swimlane grid's row count as an inline style. Alpine CSP allows only
     * one plain method call per binding, so the string is assembled here rather
     * than in the template (.claude/alpine.md).
     * @returns {string}
     */
    bandGridStyle() { return `--fc-lane-count: ${this.bands().length}`; },

    /**
     * Drop on a band row: the dragged step changes band and keeps its chain
     * position. The other gesture — a drop on an arrow — does the opposite and
     * leaves the band alone.
     * @param {string} bandId
     * @param {Event} event
     * @returns {void}
     */
    dropOnBand(bandId, event) {
      event?.preventDefault();
      const from = this._draggedStepId;
      this._draggedStepId = null;
      this._activeGap = null;
      event?.currentTarget?.classList?.remove('is-drop-target');
      if (!from) return;
      this.model.setStepBranch(from, bandId);
    },

    /**
     * Insert at a chain arrow. The new step inherits the arrow's band —
     * inserting between two detour cards means inserting INTO the detour; the
     * band is a drag away otherwise.
     * @param {number} idx Chain index the new step takes
     * @param {string} bandId
     * @returns {void}
     */
    insertInBand(idx, bandId) {
      this.model.insertStep(idx, { kind: 'activity', branchId: bandId });
      this.$nextTick(() => this._autoSizeAll());
    },

    /**
     * Creates an activity at the end of the band.
     * @param {string} bandId @returns {void}
     */
    addActivityToBand(bandId) {
      this.model.addStepToBranch(bandId, { kind: 'activity' });
      this.$nextTick(() => this._autoSizeAll());
    },

    /**
     * Creates a decision at the end of the band — which opens a band of its
     * own below it.
     * @param {string} bandId @returns {void}
     */
    addDecisionToBand(bandId) {
      this.model.addStepToBranch(bandId, { kind: 'decision' });
      this.$nextTick(() => this._autoSizeAll());
    },

    /**
     * The text at the end of a band. Unlike at the diamond, the target is
     * ALWAYS spelled out here — a rail that runs off into nothing says nothing.
     * @param {object} band
     * @returns {string}
     */
    bandExitLabel(band) {
      const owner = this.model.steps.find((s) => s.id === band?.ownerId);
      if (!owner) return '';
      const target = owner.decision?.noTarget || 'next';
      if (target === 'end') return _t('end');
      if (target === 'next') {
        const oi = this.model.steps.indexOf(owner);
        const next = this.model.steps
          .slice(oi + 1)
          .find((s) => s.branchId === owner.branchId);
        return next ? this.stepLabel(next) : _t('end');
      }
      return this.branchTarget(owner) || _t('end');
    },
    /**
     * Whether the target picker at the end of THIS band should render. Two
     * things are merged here because Alpine CSP allows only one plain method
     * call per binding (.claude/alpine.md):
     *  - the main band never owns a picker — it has no `ownerId`, so
     *    `isBranchOpen(null)` would read true in the default (nothing open)
     *    state and show a phantom, unclickable-through menu under its
     *    placeholder;
     *  - the actual open/closed state from `isBranchOpen`.
     * @param {object} band
     * @returns {boolean}
     */
    bandMenuOpen(band) {
      return !this.isMainBand(band) && this.isBranchOpen(band?.ownerId);
    },
    /**
     * Extra classes for the connector rendered in front of step `idx`.
     * Two things are merged here because Alpine CSP allows only one plain
     * method call per binding (.claude/alpine.md):
     *  - the diamond offset — connectors line up with the card header
     *    everywhere in the chain, but a diamond has no header; its vertices
     *    sit on its middle line, so a connector touching one drops to that
     *    height and meets the tip;
     *  - the gap classes from chainViewMixin (hit area + insert bar).
     * @param {number} idx - Index of the step the connector belongs to.
     * @returns {string}
     */
    connectorClass(idx) {
      const touchesDiamond = this.isDecision(this.model.steps[idx])
        || this.isDecision(this.model.steps[idx - 1]);
      return [touchesDiamond ? 'af__connector--diamond' : '', this.gapClass(idx)]
        .filter(Boolean).join(' ');
    },
    isBranchOpen(stepId) {
      return this._openMenuStepId === stepId;
    },
    /** Steps excluding the given one — used by branch-popover to list jump targets. */
    otherSteps(stepId) {
      return this.model.steps.filter((s) => s.id !== stepId);
    },
    toggleBranchMenu(stepId) {
      this._openMenuStepId = this.isBranchOpen(stepId) ? null : stepId;
    },
    pickBranchTarget(stepId, target) {
      this.model.setDecisionTarget(stepId, target);
      this._openMenuStepId = null;
    },

    /**
     * Compute rework-loop {fromId,toId,branch} triples for arcs (rendering
     * follows in a later task). Only the no branch can jump back — yes flows
     * on to the right — so every loop here is a `'no'` one.
     * @returns {Array<{fromId: string, toId: string, branch: 'no'}>}
     */
    reworkLoops() {
      const loops = [];
      this.model.steps.forEach((s, i) => {
        if (s.kind !== 'decision' || !s.decision) return;
        const target = s.decision.noTarget;
        if (target === 'next' || target === 'end') return;
        const targetIdx = this.model.steps.findIndex((x) => x.id === target);
        if (targetIdx !== -1 && targetIdx < i) {
          loops.push({ fromId: s.id, toId: target, branch: 'no' });
        }
      });
      return loops;
    },

    // ── Cross-module import (SIPOC / Process Map → Activity) ──────────
    /** @type {Array<{instanceId:string, moduleId:string, title:string}>} */
    _importOptions: [],
    /** @type {string|null} */
    _importSelectedId: null,

    _pickImportOption(opt) {
      this._importSelectedId = opt.instanceId;
    },

    _openImport() {
      const sm = module._context.stateManager;
      this._importOptions = listSourceInstances({ sources: IMPORT_SOURCES, stateManager: sm });
      if (this._importOptions.length === 0) {
        module._context.notify?.(_t('importEmptyHint'), 'info');
        return;
      }
      this._importSelectedId = this._importOptions[0].instanceId;
      // Wait one Alpine tick so the x-for renders the option rows into the
      // importForm subtree before the modal borrows it (mirrors Process
      // Map's SIPOC picker — see process-map.js _openSipocImport).
      this.$nextTick(() => {
        module._context.showModal.form(
          _t('importTitle'),
          this.$refs.importForm,
          {
            confirmLabel: _t('importConfirm'),
            onMount: (body) => this._importFormMount(body),
            onConfirm: (body) => this._runImport(body),
          },
        );
      });
    },

    /** Modal-mount hook: wire plain-DOM change listeners on the borrowed radios. */
    _importFormMount(body) {
      const form = body?.querySelector?.('.af__import-form');
      if (!form) return;
      const wire = () => {
        const radios = form.querySelectorAll('.af__import-option input[type="radio"]');
        if (radios.length === 0) { requestAnimationFrame(wire); return; }
        radios.forEach((radio) => {
          if (radio.value === this._importSelectedId) radio.checked = true;
          radio.addEventListener('change', () => {
            if (radio.checked) this._importSelectedId = radio.value;
          });
        });
      };
      wire();
    },

    /** Read the picked instance from the borrowed form's checked radio and append. */
    _runImport(body) {
      const checked = body?.querySelector?.('.af__import-option input[type="radio"]:checked');
      const id = checked?.value || this._importSelectedId;
      const opt = this._importOptions.find((o) => o.instanceId === id);
      if (!opt) return false;
      const appended = appendFromInstance({
        targetModuleId: 'activity-flowchart',
        sourceModuleId: opt.moduleId,
        instanceId: opt.instanceId,
        stateManager: module._context.stateManager,
        targetState: this.model,
      });
      module._context.notify?.(_t('importDone', { n: appended ? appended.length : 0 }), 'success');
      return true;
    },

    // ── Export ─────────────────────────────────────────────────────
    _exportJSON() {
      downloadFile(JSON.stringify(this.model.toJSON(), null, 2), 'activity-flowchart.json', 'application/json');
      module._context.notify?.('JSON ✓', 'success');
    },

    onExport(format) {
      if (format === 'json') { this._exportJSON(); return; }
      // PNG/SVG rendering (with rework-arc layout) lands once the arcs are
      // measured/drawn — see reworkLoops() above.
      module._context.notify?.(_t('exportImageComingSoon'), 'info');
    },
  };
}
