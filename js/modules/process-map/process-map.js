/**
 * D.Mike — Process Map Module (process-map.js)
 * Visual process flow builder with inputs/outputs per step. DMAIC phase: Measure.
 *
 * Migrated to createModule + Alpine CSP. The Model (process-map-model.js) holds the
 * persisted state (steps[] with IO / substeps / loops) plus all CRUD and reorder
 * logic. This data-fn owns the view transforms (value/input-type badge labels,
 * titles and CSS classes), the three nested drag contexts (step / IO / substep),
 * the textarea auto-grow + focus render side-effects and the export dropdown +
 * CSV / XLSX / JSON exporters. Loops render declaratively as one
 * `<tbody class="pmap__loop">` band per loop (see loopRows()).
 *
 * Imperative exceptions (documented):
 *   - PNG / SVG image export — pure helpers in process-map-export.js.
 *
 * Self-contained: no event bus (stateManager / i18n / notify only).
 */

import { createModule } from '../../core/template-module.js';
import {
  downloadFile, ensureXLSX, XLSX,
} from '../../core/export-utils.js';
import { exportPmapPNG, exportPmapSVG } from './process-map-export.js';
import { State, loopRailCells, loopPassColumns, loopArrowColumns } from './process-map-model.js';
import { listSipocInstances, appendSipocProcess } from './process-map-sipoc-import.js';
import { chainViewMixin } from '../../core/flowchart/flowchart-view.js';

export default createModule({
  config: {
    id: 'process-map',
    engine: 'alpine',
    phase: 'measure',
    icon: 'module.process-map',
    version: '1.0.0',
    meta: import.meta,
    actions: [
      { icon: 'action.add', title: 'addStep', variant: 'primary', onClick: (d) => d.addStep(d.model.steps.length) },
      { icon: 'action.upload', title: 'importFromSipoc', onClick: (d) => d._openSipocImport() },
      { icon: 'action.download', title: 'export.label', children: [
        { icon: 'format.xlsx', title: 'export.xlsx', onClick: (d) => d._exportXLSX() },
        { icon: 'format.csv',  title: 'export.csv',  onClick: (d) => d._exportCSV() },
        { icon: 'format.json', title: 'export.json', onClick: (d) => d._exportJSON() },
        { icon: 'format.png',  title: 'export.png',  onClick: (d) => d.onExport('png') },
        { icon: 'format.svg',  title: 'export.svg',  onClick: (d) => d.onExport('svg') },
      ] },
    ],
  },
  Model: State,

  data(module, _t) {
    const _core = chainViewMixin(module, _t, {
      autoSizeSelector: 'textarea.pmap__io-name, textarea.pmap__title, textarea.pmap__step-title, textarea.pmap__loop-step-title',
      dragRowSelector: '.pmap__step-row',
      substepItemSelector: '.fc-substep-item',
    });
    return {
      ..._core,

      // PM-local override of the mixin's stepDragEnd (F1/F2 fixes): the mixin
      // only clears _draggedStepId + the is-dragging class, but PM's
      // armStepDrag sets a `draggable` attribute directly on the row that
      // must be removed again on dragend (else the row stays draggable from
      // anywhere, not just the arm handle) — and PM's own drag-marker
      // classes (set by stepDragStart) need the same defensive
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

      /**
       * Status stripe down the card's leading edge (shared `.fc-card--accent`,
       * see js/core/flowchart/flowchart.css). Unclassified steps get no
       * stripe, so the colour reads as a deliberate judgement rather than a
       * default.
       * @param {object} step
       * @returns {string}
       */
      cardAccentClass(step) {
        return step.valueType ? `fc-card--accent pmap__step-card--${step.valueType}` : '';
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
      loopToggleClass(step) {
        return step.loop ? 'pmap__step-loop-toggle--active' : '';
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
          const band = this.$el.querySelector(`.pmap__loop[data-step-id="${stepId}"]`);
          if (!band) return;
          const inputs = band.querySelectorAll('.pmap__loop-step-title');
          if (inputs.length) inputs[inputs.length - 1].focus();
        }, 50));
      },

      // ── Step handlers ─────────────────────────────────────────
      addStep(atIndex) {
        this.model.addStep(atIndex);
        this._focusStepTitle(atIndex);
      },
      removeStep(id) {
        this.model.removeStep(id);
      },

      // ── IO handlers ───────────────────────────────────────────
      addIO(stepId, type) {
        this.model.addIO(stepId, type);
        this._focusLastIO(stepId, type);
      },
      removeIO(stepId, type, ioId) {
        this.model.removeIO(stepId, type, ioId);
      },
      cycleInputType(stepId, ioId) {
        this.model.cycleInputType(stepId, ioId);
      },

      // ── Value type ────────────────────────────────────────────
      cycleValueType(stepId) {
        this.model.cycleValueType(stepId);
      },

      // ── Substep handlers ──────────────────────────────────────
      // The mixin already mutates the model; PM only adds the focus jump on add
      // and the drag-marker cleanup on top — hence the explicit _core calls.
      toggleSubsteps(stepId) {
        _core.toggleSubsteps.call(this, stepId);
      },
      addSubstep(stepId) {
        _core.addSubstep.call(this, stepId);
        this._focusLastSubstep(stepId);
      },
      removeSubstep(parentId, substepId) {
        _core.removeSubstep.call(this, parentId, substepId);
      },
      subDrop(parentId, subId, event) {
        _core.subDrop.call(this, parentId, subId, event);
        this._clearDragMarkers();
      },
      subDragEnd(event) {
        _core.subDragEnd.call(this, event);
        this._clearDragMarkers();
      },

      // ── Loop handlers ─────────────────────────────────────────
      toggleLoop(stepId) {
        this.model.toggleLoop(stepId);
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
          + '.fc-substep-item.is-dragging, .fc-substep-item.is-drop-target';
        requestAnimationFrame(() => requestAnimationFrame(() => {
          document.querySelectorAll(sel).forEach((el) => el.classList.remove(
            'pmap__step-row--dragging', 'pmap__step-row--drag-over',
            'pmap__io-item--dragging', 'pmap__io-item--drag-over',
            'is-dragging', 'is-drop-target',
          ));
        }));
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

      /**
       * One entry per loop, ordered by source step index — feeds the loop
       * band <tbody> blocks below the outputs row. Pure function of the
       * model, so Alpine re-renders the bands on any change; no measuring.
       * @returns {Array<{stepId:string, sourceIdx:number, targetIdx:number,
       *   railCells:string[], passCols:number[], arrowCols:number[],
       *   preCols:Array<{col:number, pass:boolean}>, leadSpan:number,
       *   trailCols:Array<{col:number, pass:boolean}>,
       *   targetOptions:Array<{id:string,label:string}>}>}
       */
      loopRows() {
        const steps = this.model.steps;
        const rows = [];
        steps.forEach((step, idx) => {
          if (!step.loop) return;
          const targetIdx = step.loop.targetStepId
            ? this.model.stepIndexById(step.loop.targetStepId)
            : -1;
          rows.push({
            stepId: step.id,
            sourceIdx: idx,
            targetIdx,
            railCells: loopRailCells(steps.length, idx, targetIdx),
            targetOptions: this._loopTargetOptions(idx),
          });
        });
        // Lower bands' rails rise through the bands above them; all
        // arrowheads sit in the top band, right under the outputs row.
        const pass = loopPassColumns(steps.length, rows);
        const arrows = loopArrowColumns(steps.length, rows);
        // Columns a line passes get a cell of their own in the body row, so
        // the line sits at the column centre without measuring; the chip
        // cell spans from right of the last such column to the source.
        rows.forEach((row, lane) => {
          const passCols = pass[lane];
          const before = passCols.filter((c) => c < row.sourceIdx);
          const leadStart = before.length ? before[before.length - 1] + 1 : 0;
          const col = (c) => ({ col: c, pass: passCols.includes(c) });
          row.passCols = passCols;
          row.arrowCols = lane === 0 ? arrows : [];
          row.preCols = Array.from({ length: leadStart }, (_, c) => col(c));
          row.leadSpan = row.sourceIdx - leadStart + 1;
          row.trailCols = Array.from({ length: steps.length - row.sourceIdx - 1 },
            (_, k) => col(row.sourceIdx + 1 + k));
        });
        return rows;
      },
      /** CSS classes for rail cell ci of a band: its own modifier plus pass/arrow marks. */
      railCellClass(row, ci) {
        const cell = row.railCells[ci];
        return [
          cell ? `pmap__loop-rail-cell--${cell}` : '',
          row.passCols.includes(ci) ? 'pmap__loop-rail-cell--pass' : '',
          row.arrowCols.includes(ci) ? 'pmap__loop-rail-cell--arrow' : '',
        ].filter(Boolean).join(' ');
      },

      // ── Loop band field handlers (declarative @input/@change/@click) ──
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
        }
      },
      loopTargetSelected(stepId, optId) {
        const step = this.model.steps.find((s) => s.id === stepId);
        return Boolean(step && step.loop && step.loop.targetStepId === optId);
      },
      removeLoop(stepId) {
        this.model.removeLoop(stepId);
      },
      addLoopStep(stepId) {
        this.model.addLoopStep(stepId);
        this._focusLastLoopStep(stepId);
      },
      removeLoopStep(stepId, loopStepId) {
        this.model.removeLoopStep(stepId, loopStepId);
      },
      loopStepTitleInput(stepId, loopStepId, event) {
        const step = this.model.steps.find((s) => s.id === stepId);
        if (!step || !step.loop) return;
        const ls = step.loop.steps.find((s) => s.id === loopStepId);
        if (ls) ls.title = event.target.value;
      },
      /**
       * Width of a loop step title input in characters, so the chip grows
       * with its title (capped; the chip itself never exceeds its band).
       * @param {{title:string}} ls
       * @returns {number}
       */
      loopStepTitleSize(ls) {
        const len = Math.max((ls.title || '').length, _t('loopStepPlaceholder').length);
        return Math.min(len + 1, 48);
      },
      /** Loop steps for the band of the given step (for the nested x-for). */
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
        module._context.notify('JSON', 'success', 'status.ok');
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
        module._context.notify('CSV', 'success', 'status.ok');
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
        module._context.notify('Excel', 'success', 'status.ok');
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
        });

        // Auto-open the SIPOC picker on the very first init of a fresh Process
        // Map instance (never persisted) when ≥ 1 SIPOC exists in the project.
        // After the user picks or dismisses, persist a {steps:[]} stub so the
        // picker does not reappear on later tab switches.
        this.$nextTick(() => {
          const sm = module._context.stateManager;
          // A headless/detached mount (dev-tools seeding, scenario loading)
          // must not open UI of its own — the modal would outlive the seed and
          // block the page. See workspace.instantiateDetached.
          if (module._context.detached) return;
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
      },

      destroy() {
        if (this._onMouseUp) {
          document.removeEventListener('mouseup', this._onMouseUp);
          this._onMouseUp = null;
        }
      },
    };
  },
});
