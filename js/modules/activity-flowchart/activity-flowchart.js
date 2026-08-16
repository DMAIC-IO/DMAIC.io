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
import { ActivityModel } from './activity-flowchart-model.js';

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

  data(module, _t) {
    return {
      ...chainViewMixin(module, _t, {
        autoSizeSelector: 'textarea.af__step-title, textarea.af__decision-label, textarea.af__step-description',
      }),

      // ── Lifecycle (per Alpine instance) ───────────────────────
      init() {
        this.$nextTick(() => this._autoSizeAll());
      },

      // Decision popover state (transient — never persisted)
      _openBranchStepId: null,
      _openBranch: null,   // 'yes' | 'no' | null

      isDecision(step) { return step?.kind === 'decision'; },
      branchLabel(step, branch) {
        const target = step?.decision?.[`${branch}Target`];
        if (target === 'next') return _t('next');
        if (target === 'end') return _t('end');
        const targetStep = this.model.steps.find((s) => s.id === target);
        return targetStep ? (targetStep.title || _t('unnamedStep')) : _t('next');
      },
      isBranchOpen(stepId, branch) {
        return this._openBranchStepId === stepId && this._openBranch === branch;
      },
      /** Steps excluding the given one — used by branch-popover to list jump targets. */
      otherSteps(stepId) {
        return this.model.steps.filter((s) => s.id !== stepId);
      },
      toggleBranchMenu(stepId, branch) {
        if (this.isBranchOpen(stepId, branch)) {
          this._openBranchStepId = null; this._openBranch = null;
        } else {
          this._openBranchStepId = stepId; this._openBranch = branch;
        }
      },
      pickBranchTarget(stepId, branch, target) {
        this.model.setDecisionTarget(stepId, branch, target);
        this._openBranchStepId = null; this._openBranch = null;
      },

      /** Compute rework-loop {fromId,toId,branch} triples for arcs (rendering follows in a later task). */
      reworkLoops() {
        const loops = [];
        this.model.steps.forEach((s, i) => {
          if (s.kind !== 'decision' || !s.decision) return;
          ['yes', 'no'].forEach((br) => {
            const target = s.decision[`${br}Target`];
            if (target === 'next' || target === 'end') return;
            const targetIdx = this.model.steps.findIndex((x) => x.id === target);
            if (targetIdx !== -1 && targetIdx < i) {
              loops.push({ fromId: s.id, toId: target, branch: br });
            }
          });
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
  },
});
