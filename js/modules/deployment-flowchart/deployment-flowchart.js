/**
 * D.Mike — Deployment Flowchart Module (deployment-flowchart.js)
 * Horizontal lanes (roles / departments) with the process chain running
 * left-to-right inside them. DMAIC phase: Analyze.
 *
 * createModule + Alpine CSP entry point, modeled on the Activity and
 * Opportunity Flowcharts. The Model (deployment-flowchart-model.js) holds
 * the persisted state (steps[] with laneId, plus the state-level lanes[])
 * and all CRUD/reorder logic. This data-fn owns the view transforms
 * (per-lane step lists, lane labels), the active-lane selection that new
 * steps land in, lane drag-drop assignment, the generic cross-module import
 * picker, and the export dropdown (JSON now; PNG/SVG follow with the shared
 * flowchart renderer).
 *
 * `help` is intentionally not imported/wired here — createModule resolves it
 * automatically from `<id>-help.js` via the build-generated help registry.
 */

import { createModule } from '../../core/template-module.js';
import { downloadFile } from '../../core/export-utils.js';
import { chainViewMixin } from '../../core/flowchart/flowchart-view.js';
import {
  listSourceInstances, appendFromInstance,
} from '../../core/flowchart/flowchart-import.js';
import { DeploymentModel, UNASSIGNED_ID } from './deployment-flowchart-model.js';

const IMPORT_SOURCES = ['process-map', 'sipoc'];

export default createModule({
  config: {
    id: 'deployment-flowchart',
    engine: 'alpine',
    phase: 'analyze',
    icon: 'layout-grid',
    version: '1.0.0',
    meta: import.meta,
    actions: [
      { icon: 'plus', title: 'addStep', variant: 'primary',
        onClick: (d) => d.addStepInActiveLane() },
      { icon: 'plus', title: 'addLane',
        onClick: (d) => d.addLaneInline() },
      { icon: 'upload', title: 'importFrom',
        onClick: (d) => d._openImport() },
      { icon: 'download', title: 'export.label', children: [
        { icon: 'export-png',  title: 'export.png',  onClick: (d) => d.onExport('png') },
        { icon: 'export-svg',  title: 'export.svg',  onClick: (d) => d.onExport('svg') },
        { icon: 'export-json', title: 'export.json', onClick: (d) => d._exportJSON() },
      ] },
    ],
  },
  Model: DeploymentModel,

  data(module, _t) {
    return {
      ...chainViewMixin(module, _t, {
        autoSizeSelector: 'textarea.df__step-title, textarea.df__step-description',
        dragRowSelector: '.df__col',
      }),

      // ── Lifecycle (per Alpine instance) ───────────────────────
      init() {
        this.$nextTick(() => this._autoSizeAll());
      },

      // ── Lanes ─────────────────────────────────────────────────
      /** @type {string|null} lane new steps land in — transient, never persisted */
      _activeLaneId: null,

      /** Steps of one lane, in chain order (the filter preserves the array order). */
      stepsForLane(laneId) {
        return this.model.steps.filter((s) => s.laneId === laneId);
      },

      /**
       * The reserved lane's label comes from i18n so it follows the UI
       * language; user lanes fall back to a placeholder while unnamed.
       */
      laneLabel(lane) {
        if (lane?.id === UNASSIGNED_ID) return _t('unassigned');
        return lane?.name || _t('unnamedLane');
      },
      isUnassigned(lane) { return lane?.id === UNASSIGNED_ID; },

      /** @returns {string} the lane new steps go into (first user lane by default) */
      activeLaneId() {
        if (this._activeLaneId && this.model.lanes.some((l) => l.id === this._activeLaneId)) {
          return this._activeLaneId;
        }
        const first = this.model.lanes.find((l) => l.id !== UNASSIGNED_ID);
        return first ? first.id : UNASSIGNED_ID;
      },
      setActiveLane(laneId) { this._activeLaneId = laneId; },

      addStepInActiveLane() {
        this.model.addStep(this.model.steps.length, { laneId: this.activeLaneId() });
        this.$nextTick(() => this._autoSizeAll());
      },

      /**
       * Append an unnamed lane, make it the active one, and focus its name
       * input so the role can be typed in place — same interaction as adding
       * a step, no prompt dialog in between.
       */
      addLaneInline() {
        const lane = this.model.addLane('');
        this._activeLaneId = lane.id;
        this.$nextTick(() => {
          const input = this.$root?.querySelector(`.df__lane-name[data-lane-id="${lane.id}"]`);
          input?.focus();
        });
      },

      removeLaneById(laneId) { this.model.removeLane(laneId); },

      /** Drop on a lane band: re-assign the dragged step, keep its chain position. */
      dropOnLane(laneId, event) {
        event?.preventDefault();
        const from = this._draggedStepId;
        this._draggedStepId = null;
        event?.currentTarget?.classList?.remove('is-drop-target');
        if (!from) return;
        this.model.setLaneForStep(from, laneId);
      },

      // ── Cross-module import (SIPOC / Process Map → Deployment) ──
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
        // importForm subtree before the modal borrows it.
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
        const form = body?.querySelector?.('.df__import-form');
        if (!form) return;
        const wire = () => {
          const radios = form.querySelectorAll('.df__import-option input[type="radio"]');
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
        const checked = body?.querySelector?.('.df__import-option input[type="radio"]:checked');
        const id = checked?.value || this._importSelectedId;
        const opt = this._importOptions.find((o) => o.instanceId === id);
        if (!opt) return false;
        const appended = appendFromInstance({
          targetModuleId: 'deployment-flowchart',
          sourceModuleId: opt.moduleId,
          instanceId: opt.instanceId,
          stateManager: module._context.stateManager,
          targetState: this.model,
        });
        module._context.notify?.(_t('importDone', { n: appended ? appended.length : 0 }), 'success');
        this.$nextTick(() => this._autoSizeAll());
        return true;
      },

      // ── Export ─────────────────────────────────────────────────
      _exportJSON() {
        downloadFile(JSON.stringify(this.model.toJSON(), null, 2), 'deployment-flowchart.json', 'application/json');
        module._context.notify?.('JSON ✓', 'success');
      },

      onExport(format) {
        if (format === 'json') { this._exportJSON(); return; }
        // PNG/SVG rendering lands with the shared flowchart renderer.
        module._context.notify?.(_t('exportImageComingSoon'), 'info');
      },
    };
  },
});
