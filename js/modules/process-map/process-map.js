/**
 * D.Mike — Process Map Module (process-map.js)
 * Visual process flow builder with inputs/outputs per step. DMAIC phase: Measure.
 *
 * Migrated to createModule + Alpine CSP. The Model (process-map-model.js) holds the
 * persisted state (steps[] with IO / substeps / loops) plus all CRUD and reorder
 * logic. This data-fn owns the view transforms (value/input-type badge labels,
 * titles and CSS classes), the three nested drag contexts (step / IO / substep),
 * the textarea auto-grow + focus render side-effects, the export dropdown + CSV /
 * XLSX / JSON exporters, and the imperative loop panels + loop brackets.
 *
 * Imperative exceptions (documented):
 *   - loop panels + loop brackets — appended to .pmap__flow and pixel-positioned from
 *     the live DOM (the POM asserts this exact placement); re-rendered after each
 *     structural change via a bounded rAF-poll (alpine.md #6 / correlation _whenAnchor).
 *   - PNG / SVG image export — pure helpers in process-map-export.js.
 *
 * Self-contained: no event bus (stateManager / i18n / notify only).
 */

import { createModule } from '../../core/template-module.js';
import {
  downloadFile, ensureXLSX, XLSX,
} from '../../core/export-utils.js';
import { exportPmapPNG, exportPmapSVG } from './process-map-export.js';
import { State } from './process-map-model.js';
import { listSipocInstances, appendSipocProcess } from './process-map-sipoc-import.js';
import { chainViewMixin } from '../../core/flowchart/flowchart-view.js';

// Loop rendering is temporarily disabled while the map switches to a
// horizontal (L→R) layout. The loop toggle in the step header still
// persists state; only the imperative brackets/panels are suppressed
// until they are redesigned for horizontal rows.
const LOOPS_ENABLED = false;

export default createModule({
  config: {
    id: 'process-map',
    engine: 'alpine',
    phase: 'measure',
    icon: 'git-branch',
    version: '1.0.0',
    meta: import.meta,
    actions: [
      { icon: 'plus', title: 'addStep', variant: 'primary', onClick: (d) => d.addStep(d.model.steps.length) },
      { icon: 'upload', title: 'importFromSipoc', onClick: (d) => d._openSipocImport() },
      { icon: 'download', title: 'export.label', children: [
        { icon: 'export-xlsx', title: 'export.xlsx', onClick: (d) => d._exportXLSX() },
        { icon: 'export-csv',  title: 'export.csv',  onClick: (d) => d._exportCSV() },
        { icon: 'export-json', title: 'export.json', onClick: (d) => d._exportJSON() },
        { icon: 'export-png',  title: 'export.png',  onClick: (d) => d.onExport('png') },
        { icon: 'export-svg',  title: 'export.svg',  onClick: (d) => d.onExport('svg') },
      ] },
    ],
  },
  Model: State,

  data(module, _t) {
    const _core = chainViewMixin(module, _t, {
      autoSizeSelector: 'textarea.pmap__io-name, textarea.pmap__title, textarea.pmap__step-title, textarea.pmap__loop-step-title',
    });
    return {
      ..._core,

      // PM-local override of the mixin's stepDragEnd (F1/F2 fixes): the mixin
      // only clears _draggedStepId + the is-dragging class, but PM's
      // armStepDrag sets a `draggable` attribute directly on the row that
      // must be removed again on dragend (else the row stays draggable from
      // anywhere, not just the arm handle) — and PM's own drag-marker
      // classes (set by stepDragStart/stepDragOver) need the same defensive
      // sweep as the IO/substep drag contexts.
      stepDragEnd(event) {
        _core.stepDragEnd.call(this, event);
        const row = event?.target?.closest?.('.pmap__step-row');
        row?.removeAttribute?.('draggable');
        this._clearDragMarkers();
      },

      // ── Transient UI state (never persisted) ──────────────────
      /** @type {string|null} */
      _draggedIOId: null,
      /** @type {string|null} */
      _draggedIOStepId: null,
      /** @type {string|null} */
      _draggedIOType: null,
      /** @type {string|null} */
      _draggedSubId: null,
      /** @type {string|null} */
      _draggedParentId: null,
      /** @type {number} bumped each loop-bracket render to abort stale rAF-polls */
      _renderGen: 0,

      // ── Loop layer (declarative — pixel-positioned from live DOM rects) ──
      // The panels/brackets are absolutely positioned next to measured step rows,
      // so positions are computed imperatively from getBoundingClientRect() — but
      // the MARKUP is declarative: reactive arrays feed <template x-for> blocks in
      // the template, with :style carrying the measured top/left/height.
      /** @type {Array<{stepId:string, top:number, height:number, left:number}>} */
      loopBrackets: [],
      /** @type {Array<{stepId:string, idx:number, top:number, left:number, targetOptions:Array<{id:string,label:string}>}>} */
      loopPanels: [],

      // ── Value-type badge (data-Fn view transforms) ────────────
      valueBadgeLabel(step) {
        return step.valueType ? _t(step.valueType) : '–';
      },
      valueBadgeTitle(step) {
        return step.valueType ? _t(`${step.valueType  }Long`) : _t('valueTypeLabel');
      },
      valueBadgeClass(step) {
        return step.valueType
          ? `pmap__value-badge--${  step.valueType}`
          : 'pmap__value-badge--none';
      },

      // ── Input-type badge ──────────────────────────────────────
      inputTypeLabel(io) {
        if (!io.inputType) return '?';
        return io.inputType === 'param' ? _t('inputTypeParam') : _t('inputTypeNoise');
      },
      inputTypeTitle(io) {
        if (!io.inputType) return _t('inputTypeLabel');
        return io.inputType === 'param' ? _t('inputTypeParamLong') : _t('inputTypeNoiseLong');
      },
      inputTypeClass(io) {
        if (!io.inputType) return 'pmap__input-type--none';
        return io.inputType === 'param' ? 'pmap__input-type--param' : 'pmap__input-type--noise';
      },

      // ── Misc view transforms ──────────────────────────────────
      substepNum(parentIdx, subIdx) {
        return `${parentIdx + 1  }.${  subIdx + 1}`;
      },
      substepsBarLabel(step) {
        const has = step.substeps && step.substeps.length > 0;
        return _t('substepsLabel') + (has ? ` (${  step.substeps.length  })` : '');
      },
      substepsBarClass(step) {
        return (step.substeps && step.substeps.length > 0) ? 'pmap__substeps-bar--has' : '';
      },
      loopToggleClass(step) {
        return step.loop ? 'pmap__step-loop-toggle--active' : '';
      },
      hasLoops() {
        if (!LOOPS_ENABLED) return false;
        return this.model.steps.some((s) => s.loop);
      },
      // IO panel labels as single text runs (mirror legacy "{label} »" / "» {label}").
      ioLabelIn() {
        return `${_t('inputs')  } »`;
      },
      ioLabelOut() {
        return `» ${  _t('outputs')}`;
      },

      // ── Render side-effects ───────────────────────────────────
      /** Focus the title input of the step at the given index after a render. */
      _focusStepTitle(atIndex) {
        this.$nextTick(() => setTimeout(() => {
          const rows = this.$el.querySelectorAll('.pmap__step-row');
          rows[atIndex]?.querySelector('.pmap__step-title')?.focus();
        }, 50));
      },
      _focusLastIO(stepId, type) {
        this.$nextTick(() => setTimeout(() => {
          const row = this.$el.querySelector(`.pmap__step-row[data-step-id="${stepId}"]`);
          if (!row) return;
          const itemClass = type === 'inputs' ? 'pmap__io-item--input' : 'pmap__io-item--output';
          const items = row.querySelectorAll(`.${itemClass} .pmap__io-name`);
          if (items.length) items[items.length - 1].focus();
        }, 50));
      },
      _focusLastSubstep(stepId) {
        this.$nextTick(() => setTimeout(() => {
          const el = this.$el.querySelector(`.pmap__substeps[data-step-id="${stepId}"]`);
          if (!el) return;
          const inputs = el.querySelectorAll('.pmap__substep-title');
          if (inputs.length) inputs[inputs.length - 1].focus();
        }, 50));
      },
      _focusLastLoopStep(stepId) {
        this.$nextTick(() => setTimeout(() => {
          const panel = this.$el.querySelector(`.pmap__loop-panel[data-step-id="${stepId}"]`);
          if (!panel) return;
          const inputs = panel.querySelectorAll('.pmap__loop-step-title');
          if (inputs.length) inputs[inputs.length - 1].focus();
        }, 50));
      },

      // ── Step handlers ─────────────────────────────────────────
      addStep(atIndex) {
        this.model.addStep(atIndex);
        this._scheduleBrackets();
        this._focusStepTitle(atIndex);
      },
      removeStep(id) {
        this.model.removeStep(id);
        this._scheduleBrackets();
      },

      // ── IO handlers ───────────────────────────────────────────
      addIO(stepId, type) {
        this.model.addIO(stepId, type);
        this._scheduleBrackets();
        this._focusLastIO(stepId, type);
      },
      removeIO(stepId, type, ioId) {
        this.model.removeIO(stepId, type, ioId);
        this._scheduleBrackets();
      },
      cycleInputType(stepId, ioId) {
        this.model.cycleInputType(stepId, ioId);
      },

      // ── Value type ────────────────────────────────────────────
      cycleValueType(stepId) {
        this.model.cycleValueType(stepId);
      },

      // ── Substep handlers ──────────────────────────────────────
      toggleSubsteps(stepId) {
        this.model.toggleSubsteps(stepId);
        this._scheduleBrackets();
      },
      addSubstep(stepId) {
        this.model.addSubstep(stepId);
        this._scheduleBrackets();
        this._focusLastSubstep(stepId);
      },
      removeSubstep(parentId, substepId) {
        this.model.removeSubstep(parentId, substepId);
        this._scheduleBrackets();
      },

      // ── Loop handlers ─────────────────────────────────────────
      toggleLoop(stepId) {
        this.model.toggleLoop(stepId);
        this._scheduleBrackets();
      },

      // ── Drag markers ──────────────────────────────────────────
      /**
       * Strip every transient drag marker (--dragging / --drag-over) after a
       * reorder or drag-end. Two reasons the per-handler `dragEnd` clears are
       * not enough:
       *   1. They query `this.$el`, which is NOT the live rendered `.pmap` root
       *      for this createModule/Alpine instance — so `this.$el.querySelectorAll`
       *      finds none of the marked nodes and removes nothing.
       *   2. A drag-end that reorders leaves markers stuck because they were set
       *      imperatively on keyed nodes that Alpine then moves, and each dragEnd
       *      only clears its own marker type (a step-row marker picked up while
       *      dragging an IO item is never swept).
       * A single document-scoped sweep is correct: only one HTML5 drag can be
       * active at a time (one pointer), so exactly the dragged instance's
       * transient markers exist. The double rAF lets the DnD sequence and Alpine's
       * keyed reorder settle first; a microtask ($nextTick) fires too early.
       */
      _clearDragMarkers() {
        const sel = '.pmap__step-row--dragging, .pmap__step-row--drag-over, '
          + '.pmap__io-item--dragging, .pmap__io-item--drag-over, '
          + '.pmap__substep-item--dragging, .pmap__substep-item--drag-over';
        requestAnimationFrame(() => requestAnimationFrame(() => {
          document.querySelectorAll(sel).forEach((el) => el.classList.remove(
            'pmap__step-row--dragging', 'pmap__step-row--drag-over',
            'pmap__io-item--dragging', 'pmap__io-item--drag-over',
            'pmap__substep-item--dragging', 'pmap__substep-item--drag-over',
          ));
        }));
      },

      // ── Step drag (handle = step number) ──────────────────────
      armStepDrag(stepId, event) {
        const row = event.target.closest('.pmap__step-row');
        if (row) row.setAttribute('draggable', 'true');
      },

      // ── IO drag (within a step's input or output list) ────────
      armIODrag(event) {
        const item = event.target.closest('.pmap__io-item');
        if (item && item.dataset.ioId) item.setAttribute('draggable', 'true');
      },
      ioDragStart(stepId, type, ioId, event) {
        event.stopPropagation();
        this._draggedIOId = ioId;
        this._draggedIOStepId = stepId;
        this._draggedIOType = type;
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
        const item = event.target.closest('.pmap__io-item');
        setTimeout(() => item?.classList.add('pmap__io-item--dragging'), 0);
      },
      ioDragEnd(event) {
        const item = event.target.closest('.pmap__io-item');
        item?.removeAttribute('draggable');
        this._clearDragMarkers();
        this._draggedIOId = null;
        this._draggedIOStepId = null;
        this._draggedIOType = null;
      },
      ioDragOver(stepId, type, ioId, event) {
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        if (ioId !== this._draggedIOId
            && stepId === this._draggedIOStepId
            && type === this._draggedIOType) {
          event.currentTarget.classList.add('pmap__io-item--drag-over');
        }
      },
      ioDragLeave(ioId, event) {
        const item = event.currentTarget;
        if (!item.contains(event.relatedTarget)) {
          item.classList.remove('pmap__io-item--drag-over');
        }
      },
      ioDrop(stepId, type, ioId, event) {
        event.preventDefault();
        event.stopPropagation();
        if (!this._draggedIOId || this._draggedIOId === ioId) return;
        if (stepId !== this._draggedIOStepId || type !== this._draggedIOType) return;
        this.model.moveIO(stepId, type, this._draggedIOId, ioId);
        this._draggedIOId = null;
        this._draggedIOStepId = null;
        this._draggedIOType = null;
        this._clearDragMarkers();
        this._scheduleBrackets();
      },

      // ── Substep drag (within a step) ──────────────────────────
      armSubDrag(event) {
        const item = event.target.closest('.pmap__substep-item');
        if (item) item.setAttribute('draggable', 'true');
      },
      subDragStart(parentId, subId, event) {
        event.stopPropagation();
        this._draggedSubId = subId;
        this._draggedParentId = parentId;
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
        const item = event.target.closest('.pmap__substep-item');
        setTimeout(() => item?.classList.add('pmap__substep-item--dragging'), 0);
      },
      subDragEnd(event) {
        const item = event.target.closest('.pmap__substep-item');
        item?.removeAttribute('draggable');
        this._clearDragMarkers();
        this._draggedSubId = null;
        this._draggedParentId = null;
      },
      subDragOver(parentId, subId, event) {
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        if (subId !== this._draggedSubId && parentId === this._draggedParentId) {
          event.currentTarget.classList.add('pmap__substep-item--drag-over');
        }
      },
      subDragLeave(subId, event) {
        const item = event.currentTarget;
        if (!item.contains(event.relatedTarget)) {
          item.classList.remove('pmap__substep-item--drag-over');
        }
      },
      subDrop(parentId, subId, event) {
        event.preventDefault();
        event.stopPropagation();
        if (!this._draggedSubId || this._draggedSubId === subId) return;
        if (parentId !== this._draggedParentId) return;
        this.model.moveSubstep(parentId, this._draggedSubId, subId);
        this._draggedSubId = null;
        this._draggedParentId = null;
        this._clearDragMarkers();
        this._scheduleBrackets();
      },

      // ── Imperative loop panels + brackets ─────────────────────
      _scheduleBrackets() {
        const gen = ++this._renderGen;
        const tick = (left) => {
          if (gen !== this._renderGen) return;
          const flow = this.$el.querySelector('[data-ref="flow"]');
          // Wait until the step rows for this render exist in the DOM.
          const ready = flow && (this.model.steps.length === 0
            || flow.querySelector('.pmap__step-row'));
          if (ready) { this._renderLoopBrackets(flow); return; }
          if (left <= 0) return;
          requestAnimationFrame(() => tick(left - 1));
        };
        this.$nextTick(() => requestAnimationFrame(() => tick(30)));
      },

      _renderLoopBrackets(flow) {
        if (!flow) return;
        if (!LOOPS_ENABLED) {
          this.loopBrackets = [];
          this.loopPanels = [];
          return;
        }

        const steps = this.model.steps;
        const loops = [];
        steps.forEach((step, idx) => {
          if (!step.loop) return;
          const targetIdx = step.loop.targetStepId
            ? this.model.stepIndexById(step.loop.targetStepId)
            : -1;
          loops.push({ step, idx, targetIdx, span: targetIdx >= 0 ? idx - targetIdx : 0 });
        });
        if (!loops.length) { this.loopBrackets = []; this.loopPanels = []; return; }

        loops.sort((a, b) => b.span - a.span);
        const flowRect = flow.getBoundingClientRect();
        const table = flow.querySelector('.pmap__table');
        const tableRight = table
          ? table.getBoundingClientRect().right - flowRect.left
          : flowRect.width;
        const bracketBaseX = tableRight + 24;
        const panelX = bracketBaseX + 28;

        const brackets = [];
        const panels = [];

        loops.forEach((lp, lane) => {
          const sourceRow = flow.querySelector(`.pmap__step-row[data-step-id="${lp.step.id}"]`);
          const bracketX = bracketBaseX + lane * 28;

          if (lp.targetIdx >= 0 && lp.targetIdx < lp.idx) {
            const targetRow = flow.querySelector(`.pmap__step-row[data-step-id="${lp.step.loop.targetStepId}"]`);
            if (sourceRow && targetRow) {
              const sourceRect = sourceRow.getBoundingClientRect();
              const targetRect = targetRow.getBoundingClientRect();
              const bTop = targetRect.top - flowRect.top + targetRect.height * 0.3;
              const bBottom = sourceRect.bottom - flowRect.top - sourceRect.height * 0.3;
              const bHeight = bBottom - bTop;
              if (bHeight >= 10) {
                brackets.push({ stepId: lp.step.id, top: bTop, height: bHeight, left: bracketX });
              }
            }
          }

          panels.push({
            stepId: lp.step.id,
            idx: lp.idx,
            // Initial top before measuring the rendered panel height; refined in
            // _positionPanels() after Alpine materialises the panel.
            top: 0,
            left: panelX + lane * 28,
            targetIdx: lp.targetIdx,
            targetStepId: lp.step.loop.targetStepId || null,
            targetOptions: this._loopTargetOptions(lp.idx),
          });
        });

        this.loopBrackets = brackets;
        this.loopPanels = panels;

        // Second pass: the panels' vertical center depends on their own height,
        // which is only known once Alpine has rendered them.
        this.$nextTick(() => requestAnimationFrame(() => this._positionPanels(flow, flowRect)));

        this._autoSizeAll();
      },

      /** Build the loop-target <select> options for the step at stepIdx. */
      _loopTargetOptions(stepIdx) {
        return this.model.steps
          .map((s, i) => (i < stepIdx ? s : null))
          .filter(Boolean)
          .map((s, i) => {
            const num = String(i + 1).padStart(2, '0');
            const label = s.title ? `${num} — ${s.title}` : `${_t('csvStep')} ${num}`;
            return { id: s.id, label };
          });
      },

      /** Refine each panel's top from its measured height (post-render pass). */
      _positionPanels(flow, flowRect) {
        const fRect = flowRect || flow.getBoundingClientRect();
        this.loopPanels.forEach((p) => {
          const sourceRow = flow.querySelector(`.pmap__step-row[data-step-id="${p.stepId}"]`);
          const panelEl = flow.querySelector(`.pmap__loop-panel[data-step-id="${p.stepId}"]`);
          if (!sourceRow || !panelEl) return;
          const sourceRect = sourceRow.getBoundingClientRect();
          const panelH = panelEl.offsetHeight;
          if (p.targetIdx >= 0 && p.targetIdx < p.idx) {
            const targetRow = flow.querySelector(`.pmap__step-row[data-step-id="${p.targetStepId}"]`);
            if (targetRow) {
              const targetRect = targetRow.getBoundingClientRect();
              const bTop = targetRect.top - fRect.top + targetRect.height * 0.3;
              const bBottom = sourceRect.bottom - fRect.top - sourceRect.height * 0.3;
              const midY = (bTop + bBottom) / 2;
              p.top = midY - panelH / 2;
              return;
            }
          }
          const rowMidY = sourceRect.top - fRect.top + sourceRect.height / 2;
          p.top = rowMidY - panelH / 2;
        });
      },

      // ── Loop-panel style helpers (declarative :style) ─────────
      bracketStyle(b) {
        return `top:${b.top}px;height:${b.height}px;left:${b.left}px`;
      },
      panelStyle(p) {
        return `position:absolute;left:${p.left}px;top:${p.top}px`;
      },

      // ── Loop-panel field handlers (declarative @input/@change/@click) ──
      loopConditionOf(stepId) {
        const step = this.model.steps.find((s) => s.id === stepId);
        return (step && step.loop && step.loop.condition) ? step.loop.condition : '';
      },
      loopConditionInput(stepId, event) {
        const step = this.model.steps.find((s) => s.id === stepId);
        if (step && step.loop) step.loop.condition = event.target.value;
      },
      loopTargetChange(stepId, event) {
        const step = this.model.steps.find((s) => s.id === stepId);
        if (step && step.loop) {
          step.loop.targetStepId = event.target.value || null;
          this._scheduleBrackets();
        }
      },
      loopTargetSelected(stepId, optId) {
        const step = this.model.steps.find((s) => s.id === stepId);
        return Boolean(step && step.loop && step.loop.targetStepId === optId);
      },
      removeLoopPanel(stepId) {
        this.model.removeLoop(stepId);
        this._scheduleBrackets();
      },
      addLoopStep(stepId) {
        this.model.addLoopStep(stepId);
        this._scheduleBrackets();
        this._focusLastLoopStep(stepId);
      },
      removeLoopStep(stepId, loopStepId) {
        this.model.removeLoopStep(stepId, loopStepId);
        this._scheduleBrackets();
      },
      loopStepTitleInput(stepId, loopStepId, event) {
        const step = this.model.steps.find((s) => s.id === stepId);
        if (!step || !step.loop) return;
        const ls = step.loop.steps.find((s) => s.id === loopStepId);
        if (ls) ls.title = event.target.value;
      },
      /** Loop steps for the panel of the given step (for the nested x-for). */
      loopStepsOf(stepId) {
        const step = this.model.steps.find((s) => s.id === stepId);
        return (step && step.loop && step.loop.steps) ? step.loop.steps : [];
      },

      // ── Export ────────────────────────────────────────────────
      onExport(fmt) {
        if (fmt === 'csv')  this._exportCSV();
        if (fmt === 'xlsx') this._exportXLSX();
        if (fmt === 'json') this._exportJSON();
        if (fmt === 'png')  exportPmapPNG(this.model.steps, _t, module._context.notify);
        if (fmt === 'svg')  exportPmapSVG(this.model.steps, _t, module._context.notify);
      },

      _exportJSON() {
        const out = this.model.toExportJSON();
        downloadFile(JSON.stringify(out, null, 2), 'process-map.json', 'application/json');
        module._context.notify('JSON ✓', 'success');
      },

      _csvRows() {
        const csvEsc = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
        const vtLabel = (vt) => (vt ? _t(`${vt  }Long`) : '');
        const fmtInput = (io) => {
          if (!io.name) return '';
          if (io.inputType === 'param') return `${io.name} (x)`;
          if (io.inputType === 'noise') return `${io.name} (n)`;
          return io.name;
        };
        const fmtLoop = (s) => {
          if (!s.loop) return '';
          const parts = [];
          if (s.loop.condition) parts.push(s.loop.condition);
          if (s.loop.targetStepId) {
            const ti = this.model.stepIndexById(s.loop.targetStepId);
            if (ti !== -1) parts.push(`→ ${_t('csvStep')} ${String(ti + 1).padStart(2, '0')}`);
          }
          const ls = (s.loop.steps || []).map((l) => l.title).filter(Boolean);
          if (ls.length) parts.push(`[${ls.join(', ')}]`);
          return parts.join(' ');
        };
        return { csvEsc, vtLabel, fmtInput, fmtLoop };
      },

      _exportCSV() {
        const { csvEsc, vtLabel, fmtInput, fmtLoop } = this._csvRows();
        let csv = 'sep=;\n';
        csv += `${[
          `"${_t('csvStep')}"`, `"${_t('csvTitle')}"`, `"${_t('csvDescription')}"`,
          `"${_t('csvValueType')}"`, `"${_t('inputs')}"`, `"${_t('outputs')}"`,
          `"${_t('loopLabel')}"`,
        ].join(';')  }\n`;

        this.model.steps.forEach((s, i) => {
          csv += `${[
            csvEsc(i + 1),
            csvEsc(s.title),
            csvEsc(s.description),
            csvEsc(vtLabel(s.valueType)),
            csvEsc(s.inputs.map(fmtInput).filter(Boolean).join(', ')),
            csvEsc(s.outputs.map((io) => io.name).filter(Boolean).join(', ')),
            csvEsc(fmtLoop(s)),
          ].join(';')  }\n`;

          (s.substeps || []).forEach((ss, si) => {
            csv += `${[
              csvEsc(`${i + 1}.${si + 1}`), csvEsc(`  ${ss.title}`),
              csvEsc(''), csvEsc(''), csvEsc(''), csvEsc(''), csvEsc(''),
            ].join(';')  }\n`;
          });
        });

        downloadFile(csv, 'process-map.csv', 'text/csv;charset=utf-8');
        module._context.notify('CSV ✓', 'success');
      },

      async _exportXLSX() {
        try { await ensureXLSX(); } catch { module._context.notify?.('XLSX library not loaded'); return; }
        const { vtLabel, fmtInput, fmtLoop } = this._csvRows();

        const rows = [];
        rows.push([_t('csvStep'), _t('csvTitle'), _t('csvDescription'), _t('csvValueType'), _t('inputs'), _t('outputs'), _t('loopLabel')]);

        this.model.steps.forEach((s, i) => {
          rows.push([
            i + 1, s.title, s.description, vtLabel(s.valueType),
            s.inputs.map(fmtInput).filter(Boolean).join(', '),
            s.outputs.map((io) => io.name).filter(Boolean).join(', '),
            fmtLoop(s),
          ]);
          (s.substeps || []).forEach((ss, si) => {
            rows.push([`${i + 1}.${si + 1}`, `  ${ss.title}`, '', '', '', '', '']);
          });
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, 'Process Map');
        XLSX.writeFile(wb, 'process-map.xlsx');
        module._context.notify('Excel ✓', 'success');
      },

      // ── SIPOC import (picker + append) ────────────────────────
      /** @type {Array<{instanceId:string,label:string,processCount:number,processPreview:string[]}>} */
      _sipocOptions: [],
      /** @type {string|null} */
      _sipocSelectedId: null,

      _pickSipoc(opt) {
        if (!opt || opt.processCount === 0) return;
        this._sipocSelectedId = opt.instanceId;
      },

      _openSipocImport() {
        const sm = module._context.stateManager;
        this._sipocOptions = listSipocInstances(sm);
        if (this._sipocOptions.length === 0) {
          module._context.notify?.(_t('importFromSipocHint'), 'info');
          return;
        }
        const firstUsable = this._sipocOptions.find(o => o.processCount > 0);
        this._sipocSelectedId = firstUsable ? firstUsable.instanceId : null;
        // Wait one Alpine tick so the x-for renders the option rows into the
        // sipocForm subtree before the modal borrows it — otherwise onMount
        // sees an empty form (no radios) and the initial check never lands.
        this.$nextTick(() => {
          module._context.showModal.form(
            _t('importFromSipocTitle'),
            this.$refs.sipocForm,
            {
              confirmLabel: _t('importFromSipocConfirm'),
              onMount: (body) => this._sipocFormMount(body),
              onConfirm: (body) => this._runSipocImport(body),
            },
          );
        });
      },

      /**
       * Modal-mount hook: wire plain-DOM click listeners on the radios so the
       * checked state is authoritative even though the form node has been
       * borrowed out of its Alpine root. Also stamps the initial selection.
       */
      _sipocFormMount(body) {
        const form = body?.querySelector?.('.pmap__sipoc-form');
        if (!form) return;
        // Alpine's x-for may render on a later tick even after the modal has
        // already borrowed the form node; defer the wiring until the radios
        // actually exist. rAF is enough because the modal body is on-screen.
        const wire = () => {
          const initId = this._sipocSelectedId;
          const radios = form.querySelectorAll('.pmap__sipoc-option input[type="radio"]');
          if (radios.length === 0) { requestAnimationFrame(wire); return; }
          radios.forEach((radio) => {
            const label = radio.closest('.pmap__sipoc-option');
            // Alpine's :class on the borrowed element does not always
            // propagate, so mirror the disabled state in plain DOM.
            const opt = this._sipocOptions.find(o => o.instanceId === radio.value);
            if (opt && opt.processCount === 0) {
              radio.disabled = true;
              label?.classList.add('pmap__sipoc-option--disabled');
            }
            if (radio.value === initId) radio.checked = true;
            radio.addEventListener('change', () => {
              form.setAttribute('data-selected', radio.value);
              form.querySelectorAll('.pmap__sipoc-option').forEach((lbl) => {
                lbl.classList.toggle('pmap__sipoc-option--selected',
                  lbl.querySelector('input[type="radio"]') === radio);
              });
            });
          });
          if (initId) {
            form.setAttribute('data-selected', initId);
            const initLabel = form.querySelector(`.pmap__sipoc-option input[value="${initId}"]`)?.closest('.pmap__sipoc-option');
            initLabel?.classList.add('pmap__sipoc-option--selected');
          }
        };
        wire();
      },

      /** Read the picked SIPOC id from the borrowed form's checked radio and append. */
      _runSipocImport(body) {
        const checked = body?.querySelector?.('.pmap__sipoc-option input[type="radio"]:checked');
        const id = checked?.value || null;
        if (!id) return false;
        const opt = this._sipocOptions.find(o => o.instanceId === id);
        if (!opt || opt.processCount === 0) return false;
        const state = module._context.stateManager.getModuleState(id);
        const n = appendSipocProcess(this.model, state);
        module._context.notify?.(_t('importFromSipocDone').replace('{n}', n), 'success');
        return true;
      },

      /** Mark this Process Map instance as "seen" so the auto-picker never fires again. */
      _seedEmptyIfFresh() {
        const sm = module._context.stateManager;
        if (sm.getModuleState(module._context.instanceId) === null) {
          sm.setModuleState(module._context.instanceId, this.model.toJSON());
        }
      },

      // ── Lifecycle (per Alpine instance) ───────────────────────
      init() {
        this.$nextTick(() => {
          this._autoSizeAll();
          this._scheduleBrackets();
        });

        // Auto-open the SIPOC picker on the very first init of a fresh Process
        // Map instance (never persisted) when ≥ 1 SIPOC exists in the project.
        // After the user picks or dismisses, persist a {steps:[]} stub so the
        // picker does not reappear on later tab switches.
        this.$nextTick(() => {
          const sm = module._context.stateManager;
          const isFresh = sm.getModuleState(module._context.instanceId) === null
                        && this.model.steps.length === 0;
          if (!isFresh) return;
          const sipocs = listSipocInstances(sm);
          if (sipocs.length === 0) return;
          this._sipocOptions = sipocs;
          const firstUsable = sipocs.find(o => o.processCount > 0);
          this._sipocSelectedId = firstUsable ? firstUsable.instanceId : null;
          // Second $nextTick so the x-for renders the option rows before the
          // modal borrows the sipocForm subtree (empty form → onMount sees
          // no radios and the initial check never lands).
          this.$nextTick(() => {
            module._context.showModal.form(
              _t('importFromSipocTitle'),
              this.$refs.sipocForm,
              {
                confirmLabel: _t('importFromSipocConfirm'),
                onMount: (body) => this._sipocFormMount(body),
                onConfirm: (body) => {
                  const ok = this._runSipocImport(body);
                  if (!ok) this._seedEmptyIfFresh();
                },
              },
            ).then((confirmed) => { if (!confirmed) this._seedEmptyIfFresh(); });
          });
        });

        // Release any armed draggable rows/items after the mouse is released.
        this._onMouseUp = () => {
          this.$el.querySelectorAll('[draggable="true"]').forEach((el) => el.removeAttribute('draggable'));
        };
        document.addEventListener('mouseup', this._onMouseUp);

        // Re-render the imperative loop panels/brackets on any structural change.
        // A compact signature (ids + loop fields + expansion) keeps this cheap —
        // it is NOT a second persist deep-clone of model.toJSON().
        this.$watch(() => this._loopSignature(), () => this._scheduleBrackets());
      },

      /** Compact change signal for the imperative loop layer (cheap string). */
      _loopSignature() {
        return this.model.steps.map((s) => {
          const l = s.loop
            ? `${s.loop.targetStepId  }|${  s.loop.steps ? s.loop.steps.length : 0}`
            : '';
          return `${s.id  }:${  s.expanded ? '1' : '0'  }:${
             s.substeps.length  }:${  s.inputs.length  }:${  s.outputs.length
             }:${  s.valueType || ''  }:${  l}`;
        }).join(';');
      },

      destroy() {
        if (this._onMouseUp) {
          document.removeEventListener('mouseup', this._onMouseUp);
          this._onMouseUp = null;
        }
        this._renderGen++; // abort any in-flight rAF-poll
      },
    };
  },
});
