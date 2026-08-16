/**
 * D.Mike — Opportunity Flowchart Module (opportunity-flowchart.js)
 * Two-column chain: value-added steps on the left, rework / non-value-added
 * steps on the right. DMAIC phase: Analyze.
 *
 * createModule + Alpine CSP entry point, modeled on the Activity Flowchart
 * (see activity-flowchart.js). The Model (opportunity-flowchart-model.js)
 * holds the persisted state (steps[] with `side`) plus all CRUD/reorder
 * logic. This data-fn owns the view transforms (column predicates, the
 * per-connector insert menu), the chain drag/drop + textarea autosize (via
 * chainViewMixin), the generic cross-module import picker, and the export
 * dropdown (JSON now; PNG/SVG follow with the shared flowchart renderer).
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
import { OpportunityModel } from './opportunity-flowchart-model.js';

const IMPORT_SOURCES = ['process-map', 'sipoc'];

export default createModule({
  config: {
    id: 'opportunity-flowchart',
    engine: 'alpine',
    phase: 'analyze',
    icon: 'columns',
    version: '1.0.0',
    meta: import.meta,
    actions: [
      { icon: 'plus', title: 'addStepVA', variant: 'primary',
        onClick: (d) => d.model.addStep(d.model.steps.length, { side: 'va' }) },
      { icon: 'plus', title: 'addStepNVA',
        onClick: (d) => d.model.addStep(d.model.steps.length, { side: 'nva' }) },
      { icon: 'upload', title: 'importFrom',
        onClick: (d) => d._openImport() },
      { icon: 'download', title: 'export.label', children: [
        { icon: 'export-png',  title: 'export.png',  onClick: (d) => d.onExport('png') },
        { icon: 'export-svg',  title: 'export.svg',  onClick: (d) => d.onExport('svg') },
        { icon: 'export-json', title: 'export.json', onClick: (d) => d._exportJSON() },
      ] },
    ],
  },
  Model: OpportunityModel,

  data(module, _t) {
    return {
      ...chainViewMixin(module, _t, {
        autoSizeSelector: 'textarea.of__step-title, textarea.of__step-description',
        dragRowSelector: '.of__row',
      }),

      // ── Lifecycle (per Alpine instance) ───────────────────────
      init() {
        this.$nextTick(() => this._autoSizeAll());
      },

      // ── Columns ───────────────────────────────────────────────
      /** @param {object} step @returns {boolean} true when the step belongs in the VA column */
      isVA(step) { return step?.side === 'va'; },

      /** Flip a step into the other column — its sequence index never changes. */
      toggleSide(stepId) {
        const s = this.model.steps.find((x) => x.id === stepId);
        if (!s) return;
        this.model.setSide(s.id, s.side === 'va' ? 'nva' : 'va');
      },

      // ── Insert menu (which column does the new step go into?) ──
      /** @type {number|null} connector slot currently showing the add-left/right menu */
      _insertMenuIdx: null,

      isInsertOpen(idx) { return this._insertMenuIdx === idx; },
      toggleInsertMenu(idx) {
        this._insertMenuIdx = this._insertMenuIdx === idx ? null : idx;
      },
      insertAt(idx, side) {
        this.model.insertStep(idx, { side });
        this._insertMenuIdx = null;
      },

      // ── Cross-module import (SIPOC / Process Map → Opportunity) ──
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
        // importForm subtree before the modal borrows it (mirrors Activity
        // Flowchart / Process Map's SIPOC picker).
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
        const form = body?.querySelector?.('.of__import-form');
        if (!form) return;
        const wire = () => {
          const radios = form.querySelectorAll('.of__import-option input[type="radio"]');
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
        const checked = body?.querySelector?.('.of__import-option input[type="radio"]:checked');
        const id = checked?.value || this._importSelectedId;
        const opt = this._importOptions.find((o) => o.instanceId === id);
        if (!opt) return false;
        const appended = appendFromInstance({
          targetModuleId: 'opportunity-flowchart',
          sourceModuleId: opt.moduleId,
          instanceId: opt.instanceId,
          stateManager: module._context.stateManager,
          targetState: this.model,
        });
        module._context.notify?.(_t('importDone', { n: appended ? appended.length : 0 }), 'success');
        return true;
      },

      // ── Export ─────────────────────────────────────────────────
      _exportJSON() {
        downloadFile(JSON.stringify(this.model.toJSON(), null, 2), 'opportunity-flowchart.json', 'application/json');
        module._context.notify?.('JSON ✓', 'success');
      },

      onExport(format) {
        if (format === 'json') { this._exportJSON(); return; }
        // PNG/SVG rendering lands with the shared flowchart renderer — see
        // the Activity Flowchart's onExport for the same placeholder.
        module._context.notify?.(_t('exportImageComingSoon'), 'info');
      },
    };
  },
});
