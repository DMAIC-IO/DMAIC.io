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
import {
  ActivityModel, MAIN_BRANCH, BRANCH_PREFIX, branchOwnerId,
} from './activity-flowchart-model.js';

const IMPORT_SOURCES = ['process-map', 'sipoc'];

export default createModule({
  config: {
    id: 'activity-flowchart',
    engine: 'alpine',
    phase: 'analyze',
    icon: 'module.activity-flowchart',
    version: '1.0.0',
    meta: import.meta,
    actions: [
      { icon: 'action.add', title: 'addStep',
        variant: 'primary', onClick: (d) => d.appendStep('activity') },
      { icon: 'action.branch', title: 'addDecision',
        onClick: (d) => d.appendStep('decision') },
      { icon: 'action.upload', title: 'importFrom',
        onClick: (d) => d._openImport() },
      { icon: 'action.download', title: 'export.label', children: [
        { icon: 'format.png',  title: 'export.png',  onClick: (d) => d.onExport('png') },
        { icon: 'format.svg',  title: 'export.svg',  onClick: (d) => d.onExport('svg') },
        { icon: 'format.json', title: 'export.json', onClick: (d) => d._exportJSON() },
      ] },
    ],
  },
  Model: ActivityModel,
  data: activityFlowchartData,
});

/**
 * Activity Flowchart data-fn — view transforms, drag/drop, decision popover,
 * import + export. Exported as a standalone function (not an inline object
 * shorthand) so its view transforms can be unit tested without mounting the
 * module via Alpine — see activity-flowchart.test.js.
 * @param {object} module - the createModule instance.
 * @param {(key: string) => string} _t - i18n helper.
 */
export function activityFlowchartData(module, _t) {
  return {
    ...chainViewMixin(module, _t, {
      autoSizeSelector: 'textarea.af__step-title, textarea.af__decision-label, textarea.af__step-description',
      dragRowSelector: '.af__step',
      canvasSelector: '.af__canvas',
    }),

    // ── Lifecycle (per Alpine instance) ───────────────────────
    init() {
      this.$nextTick(() => this._autoSizeAll());
    },

    // Entry-point picker state (transient — never persisted): the band whose
    // exit is waiting for a card to be clicked, or null.
    _pickBandId: null,

    // Insert-menu state (transient — never persisted): {idx, bandId} of the
    // arrow whose menu is open, or null.
    _insertMenu: null,

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
     * @returns {string} Target text, or `''` when the branch does not rejoin.
     */
    branchTarget(step) {
      const target = step?.decision?.noTarget;
      if (!target || target === 'end') return '';
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
     * "Next free" counts in the band's own DIRECTION. A rework loop re-enters
     * the chain to the LEFT of its diamond, so its stream runs right to left
     * — and a value stream only ever runs one way. Its cards therefore march
     * leftwards from the diamond towards the card they rejoin at, instead of
     * away from it: appending to such a band puts the new card at the head of
     * the return path, not behind the eye's back at the far right.
     *
     * Either way the band's exit control needs a column of its own between
     * its last card and the card it rejoins at, so a detour has to clear its
     * target by two. Where it does not, the chain makes room:
     *
     * - flowing right, the target and everything after it move right, all but
     *   this band's own cards — pulling those along would tear apart the very
     *   detour we are making room for;
     * - flowing left, everything BEHIND the target moves right, this band
     *   included: its cards hang off the diamond and travel with it, which is
     *   exactly what opens the gap on the target's right.
     *
     * Repeated until nothing is left to push, because one shift can create the
     * next. A dead end constrains nothing.
     *
     * @returns {{colOf: Map<string, number>, count: number}} 1-based columns.
     */
    _layout() {
      const steps = this.model.steps;
      const colOf = new Map();
      const next = new Map([[MAIN_BRANCH, 1]]);
      const dir = new Map([[MAIN_BRANCH, 1]]);

      steps.forEach((s) => {
        const c = next.get(s.branchId) ?? 1;
        colOf.set(s.id, c);
        next.set(s.branchId, c + (dir.get(s.branchId) ?? 1));
        if (s.kind === 'decision') {
          next.set(BRANCH_PREFIX + s.id, c);
          dir.set(BRANCH_PREFIX + s.id, this._bandFlow(s)?.backward ? -1 : 1);
        }
      });

      const indexOf = new Map(steps.map((s, i) => [s.id, i]));
      for (let guard = 0; guard < steps.length + 1; guard++) {
        let shifted = false;
        for (const d of steps) {
          if (d.kind !== 'decision') continue;
          const flow = this._bandFlow(d);
          if (!flow) continue;                         // dead end
          const band = BRANCH_PREFIX + d.id;
          const members = steps.filter((s) => s.branchId === band);
          const cols = [colOf.get(d.id), ...members.map((s) => colOf.get(s.id))];
          const targetCol = colOf.get(flow.target.id);
          const from = indexOf.get(flow.target.id);
          // +2, not +1: the band's exit control sits in the column right past
          // its last card, so a target one column further would stand directly
          // above that control rather than beyond it. The eye should read
          // detour cards, then the exit, then the card it rejoins at.
          const need = flow.backward
            ? targetCol + 2 - Math.min(...cols)
            : Math.max(...cols) + 2 - targetCol;
          if (need <= 0) continue;
          const own = flow.backward
            ? new Set()
            : new Set([d.id, ...members.map((s) => s.id)]);
          const start = flow.backward ? from + 1 : from;
          steps.forEach((s, i) => {
            if (i >= start && !own.has(s.id)) colOf.set(s.id, colOf.get(s.id) + need);
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
     * Where a decision's detour goes, and which way that makes its band run.
     * A target EARLIER in the chain is a rework loop: the band flows right to
     * left, from the diamond back to the card it re-enters at. A later target
     * flows on to the right like everything else. A dead end has neither.
     * @param {object} decision
     * @returns {{target: object, backward: boolean}|null}
     */
    _bandFlow(decision) {
      const steps = this.model.steps;
      const own = steps.indexOf(decision);
      const id = decision?.decision?.noTarget || 'end';
      if (id === 'end') return null;
      const i = steps.findIndex((s) => s.id === id);
      if (i === -1) return null;
      return { target: steps[i], backward: i < own };
    },

    /**
     * Does this step sit in a band that runs right to left? Read off the
     * decision that owns the band, not off columns — the direction is a fact
     * about the CHAIN, and the columns are derived from it.
     * @param {object} step
     * @returns {boolean}
     */
    isBackwardStep(step) {
      const ownerId = branchOwnerId(step?.branchId);
      if (!ownerId) return false;
      const owner = this.model.steps.find((s) => s.id === ownerId);
      return !!(owner && this._bandFlow(owner)?.backward);
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
     * The re-entry markers: one per band that rejoins at a card. Each sits in
     * the band's OWN row, in the column of the card it rejoins at — directly
     * under that card — and carries the arrow plus the exit control itself, so
     * the chosen re-entry is named at the place it happens rather than at the
     * far end of the band. A band that has not picked one yet has no marker;
     * its invitation to pick stays in the tail behind its cards.
     * @returns {Array<{id: string, band: object, style: string}>}
     */
    rejoinMarkers() {
      const { colOf } = this._layout();
      const off = this.hasBands() ? 1 : 0;
      return this.bands().map((band, i) => {
        const owner = this.model.steps.find((s) => s.id === band.ownerId);
        const targetId = owner?.decision?.noTarget;
        if (!targetId || targetId === 'end') return null;
        const col = colOf.get(targetId);
        if (!col) return null;
        return { id: band.id, band, style: `grid-row: ${i + 1}; grid-column: ${col + off}` };
      }).filter(Boolean);
    },

    /**
     * Grid placement for a band's tail — placeholder and exit, directly past
     * that band's last card rather than in a column shared by every band.
     * "Past" follows the band's direction: a rework loop runs right to left,
     * so its tail sits LEFT of its cards, where the stream is heading and
     * where the next card will land.
     * @param {object} band
     * @returns {string}
     */
    tailStyle(band) {
      const { colOf } = this._layout();
      const owner = this.model.steps.find((s) => s.id === band.ownerId);
      const cols = owner ? [colOf.get(owner.id)] : [0];
      this.model.steps.forEach((s) => {
        if (s.branchId === band.id) cols.push(colOf.get(s.id));
      });
      const back = owner ? !!this._bandFlow(owner)?.backward : false;
      const edge = back ? Math.min(...cols) - 1 : Math.max(...cols) + 1;
      const row = this.bands().findIndex((b) => b.id === band.id) + 1;
      return `grid-row: ${row}; grid-column: ${edge + (this.hasBands() ? 1 : 0)}`;
    },

    /**
     * The tail's gap sits between it and the card it follows, so it changes
     * sides with the band's direction.
     * @param {object} band
     * @returns {string}
     */
    tailClass(band) {
      const owner = this.model.steps.find((s) => s.id === band.ownerId);
      return owner && this._bandFlow(owner)?.backward ? 'af__tail--back' : '';
    },


    /**
     * Which way the arrow in front of step `idx` points. In a band that
     * rejoins backwards the whole stream runs leftwards — not just the return
     * path beyond its first card — so EVERY arrow in it turns, or the band
     * would claim two directions at once. A forward rejoin, a dead end and the
     * whole main path all follow the chain, left to right.
     * @param {number} idx chain index of the step the arrow belongs to
     * @returns {string}
     */
    arrowClass(idx) {
      return this.isBackwardStep(this.model.steps[idx])
        ? 'af__connector-arrow--back' : '';
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
      const step = this.model.insertStep(idx, { kind: 'activity', branchId: bandId });
      this.$nextTick(() => { this._autoSizeAll(); this.revealStep(step); });
    },

    /**
     * Open the small menu at the arrow in gap `idx`, or close it if it was
     * already open there. The arrow used to insert an activity outright, which
     * left a decision addable only at the END of a band — never between two
     * cards. Now the arrow asks which of the two.
     * @param {number} idx gap index, the chain position the new step takes
     * @param {string} bandId band the new step belongs to
     * @returns {void}
     */
    toggleInsertMenu(idx, bandId) {
      this._insertMenu = this._insertMenu?.idx === idx ? null : { idx, bandId };
    },

    /** @param {number} idx @returns {boolean} is the menu open at this gap? */
    isInsertMenuOpen(idx) { return this._insertMenu?.idx === idx; },

    /**
     * Insert a step of `kind` at the open menu's gap, then close the menu.
     * @param {'activity'|'decision'} kind
     * @returns {void}
     */
    insertAtMenu(kind) {
      const m = this._insertMenu;
      if (!m) return;
      this._insertMenu = null;
      const step = this.model.insertStep(m.idx, { kind, branchId: m.bandId });
      this.$nextTick(() => { this._autoSizeAll(); this.revealStep(step); });
    },

    /**
     * Close whatever is open on the canvas — the insert menu, the re-entry
     * picker. One method because Alpine CSP allows a single plain call per
     * binding (.claude/alpine.md), and the canvas click has to end both.
     * @returns {void}
     */
    closeOverlays() {
      this._insertMenu = null;
      this.cancelPick();
    },

    /**
     * Creates an activity at the end of the band.
     * @param {string} bandId @returns {void}
     */
    addActivityToBand(bandId) {
      const step = this.model.addStepToBranch(bandId, { kind: 'activity' });
      this.$nextTick(() => { this._autoSizeAll(); this.revealStep(step); });
    },

    /**
     * Creates a decision at the end of the band — which opens a band of its
     * own below it.
     * @param {string} bandId @returns {void}
     */
    addDecisionToBand(bandId) {
      const step = this.model.addStepToBranch(bandId, { kind: 'decision' });
      this.$nextTick(() => { this._autoSizeAll(); this.revealStep(step); });
    },

    /**
     * Append to the MAIN path, from the toolbar. Same reveal as every other
     * way of adding a card — the toolbar is the one that most often adds
     * beyond the right edge, because the main path is the longest band.
     * @param {'activity'|'decision'} kind
     * @returns {void}
     */
    appendStep(kind) {
      const at = this.model.steps.length;
      const step = kind === 'decision'
        ? this.model.addDecision(at) : this.model.addStep(at);
      this.$nextTick(() => { this._autoSizeAll(); this.revealStep(step); });
    },

    /**
     * The text at the end of a band. Unlike at the diamond, the target is
     * ALWAYS spelled out here — a rail that runs off into nothing says nothing.
     * @param {object} band
     * @returns {string}
     */
    bandExitLabel(band) {
      return this.exitPickLabel(band);
    },

    /**
     * Does this band rejoin at a card, or does it end where its cards end?
     * @param {object} band
     * @returns {'end'|'step'}
     */
    exitKind(band) {
      const owner = this.model.steps.find((s) => s.id === band?.ownerId);
      return (owner?.decision?.noTarget || 'end') === 'end' ? 'end' : 'step';
    },

    /**
     * The pick exit: the chosen step once there is one, otherwise the
     * invitation to choose. It doubles as the display so the band's state is
     * readable without opening anything.
     * @param {object} band
     * @returns {string}
     */
    exitPickLabel(band) {
      const owner = this.model.steps.find((s) => s.id === band?.ownerId);
      if (!owner || this.exitKind(band) !== 'step') return _t('pickEntry');
      return this.branchTarget(owner) || _t('pickEntry');
    },

    /**
     * Marks the exit once a card is chosen. Assembled here because Alpine CSP
     * allows one plain method call per binding (.claude/alpine.md).
     * @param {object} band
     * @returns {string}
     */
    exitClass(band) {
      return this.exitKind(band) === 'step' ? 'af__band-exit--active' : '';
    },

    /** True once this band rejoins somewhere — the ✕ only makes sense then. */
    hasRejoin(band) { return this.exitKind(band) === 'step'; },

    /**
     * Drop the chosen re-entry. The detour then ends where its cards end,
     * which is the state a band starts in.
     * @param {object} band
     * @returns {void}
     */
    clearExit(band) {
      this._pickBandId = null;
      this.model.setDecisionTarget(band?.ownerId, 'end');
    },
    /**
     * Arm the entry-point picker for a band — or disarm it if it was already
     * armed. The next click on an eligible card sets the exit.
     *
     * This replaces a dropdown that listed every step in the chart. In a real
     * process map that is dozens of entries, several of them reading
     * "(unnamed)", and nothing in the list says where any of them sits. The
     * chart itself already shows that, so the chart is where the choice is
     * made.
     * @param {object} band
     * @returns {void}
     */
    togglePick(band) {
      this._pickBandId = this._pickBandId === band?.id ? null : band?.id;
    },

    /** @returns {void} */
    cancelPick() { this._pickBandId = null; },

    /** @param {object} band @returns {boolean} */
    isPicking(band) { return this._pickBandId === band?.id; },

    /**
     * Can this step be picked right now? Only the cards of the band the
     * decision branches OFF — for a decision in the main path that is the
     * main lane. A detour rejoins where it came from, not sideways into a
     * foreign branch, and never into itself.
     * @param {object} step
     * @returns {boolean}
     */
    isPickTarget(step) {
      if (!this._pickBandId) return false;
      const owner = this.model.steps.find((s) => s.id === branchOwnerId(this._pickBandId));
      if (!owner || step.id === owner.id) return false;
      return step.branchId === owner.branchId;
    },

    /**
     * Every class a card carries: its kind, whether it is a choice while the
     * picker is armed, and whether its arrow carries the open insert menu —
     * that card has to rise above the one after it, or the menu is covered.
     * Merged into one binding because an element can only have one `:class`;
     * two of them and the browser drops the second while parsing, silently.
     * @param {object} step
     * @returns {string}
     */
    stepClass(step) {
      const kind = this.isDecision(step) ? 'af__step--decision' : 'af__step--activity';
      const menu = this.isInsertMenuOpen(this.model.steps.indexOf(step)) ? 'af__step--menu-open' : '';
      return [kind, this.pickClass(step), menu].filter(Boolean).join(' ');
    },

    /**
     * Extra class for a card while the picker is armed: eligible cards invite
     * the click, the rest step back so the choice is obvious.
     * @param {object} step
     * @returns {string}
     */
    pickClass(step) {
      if (!this._pickBandId) return '';
      return this.isPickTarget(step) ? 'af__step--pickable' : 'af__step--dimmed';
    },

    /**
     * Take a card as the armed band's entry point.
     * @param {object} step
     * @returns {void}
     */
    pickStep(step) {
      if (!this.isPickTarget(step)) return;
      const ownerId = branchOwnerId(this._pickBandId);
      this._pickBandId = null;
      this.model.setDecisionTarget(ownerId, step.id);
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
        if (target === 'end') return;
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
      module._context.notify?.('JSON', 'success', 'status.ok');
    },

    onExport(format) {
      if (format === 'json') { this._exportJSON(); return; }
      // PNG/SVG rendering (with rework-arc layout) lands once the arcs are
      // measured/drawn — see reworkLoops() above.
      module._context.notify?.(_t('exportImageComingSoon'), 'info');
    },
  };
}
