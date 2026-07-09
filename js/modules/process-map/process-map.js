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
 *   - export dropdown (createExportDropdown) — mounted in init(), disposed in destroy()
 *   - loop panels + loop brackets — appended to .pmap__flow and pixel-positioned from
 *     the live DOM (the POM asserts this exact placement); re-rendered after each
 *     structural change via a bounded rAF-poll (alpine.md #6 / correlation _whenAnchor).
 *   - PNG / SVG image export — pure helpers in process-map-export.js.
 *
 * Self-contained: no event bus (stateManager / i18n / notify only).
 */

import { createModule } from '../../core/template-module.js';
import {
  downloadFile, ensureXLSX, XLSX, createExportDropdown,
} from '../../core/export-utils.js';
import { exportPmapPNG, exportPmapSVG } from './process-map-export.js';
import { State } from './process-map-model.js';

export default createModule({
  config: {
    id: 'process-map',
    engine: 'alpine',
    phase: 'measure',
    icon: 'git-branch',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Transient UI state (never persisted) ──────────────────
      /** @type {{el:HTMLElement, destroy:function}|null} */
      _exportDropdown: null,
      /** @type {string|null} */
      _draggedId: null,
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
      stepNum(idx) {
        return String(idx + 1).padStart(2, '0');
      },
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
      /** Auto-grow an IO-name textarea to fit its content (mirror legacy). */
      autoSize(event) {
        const ta = event.target;
        if (!ta) return;
        ta.style.height = '0';
        ta.style.height = `${ta.scrollHeight  }px`;
      },
      /** Re-apply auto-grow to every IO textarea (mount + after re-render). */
      _autoSizeAll() {
        this.$el.querySelectorAll('.pmap__io-name').forEach((ta) => {
          ta.style.height = '0';
          ta.style.height = `${ta.scrollHeight  }px`;
        });
      },
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

      // ── Step drag (handle = step number) ──────────────────────
      armStepDrag(stepId, event) {
        const row = event.target.closest('.pmap__step-row');
        if (row) row.setAttribute('draggable', 'true');
      },
      stepDragStart(stepId, event) {
        this._draggedId = stepId;
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
        const row = event.target.closest('.pmap__step-row');
        setTimeout(() => row?.classList.add('pmap__step-row--dragging'), 0);
      },
      stepDragEnd(event) {
        const row = event.target.closest('.pmap__step-row');
        row?.removeAttribute('draggable');
        this.$el.querySelectorAll('.pmap__step-row').forEach((r) =>
          r.classList.remove('pmap__step-row--dragging', 'pmap__step-row--drag-over'));
        this._draggedId = null;
      },
      stepDragOver(stepId, event) {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        if (stepId !== this._draggedId) {
          event.currentTarget.classList.add('pmap__step-row--drag-over');
        }
      },
      stepDragLeave(stepId, event) {
        const row = event.currentTarget;
        if (!row.contains(event.relatedTarget)) {
          row.classList.remove('pmap__step-row--drag-over');
        }
      },
      stepDrop(stepId, event) {
        event.preventDefault();
        if (!this._draggedId || this._draggedId === stepId) return;
        this.model.moveStep(this._draggedId, stepId);
        this._draggedId = null;
        this._scheduleBrackets();
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
        this.$el.querySelectorAll('.pmap__io-item').forEach((i) =>
          i.classList.remove('pmap__io-item--dragging', 'pmap__io-item--drag-over'));
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
        this.$el.querySelectorAll('.pmap__substep-item').forEach((i) =>
          i.classList.remove('pmap__substep-item--dragging', 'pmap__substep-item--drag-over'));
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

      // ── Lifecycle (per Alpine instance) ───────────────────────
      init() {
        // Mount the central export dropdown into the toolbar anchor.
        this.$nextTick(() => {
          const anchor = this.$el.querySelector('[data-ref="exportAnchor"]');
          if (anchor) {
            this._exportDropdown = createExportDropdown(
              ['xlsx', 'csv', 'json', 'png', 'svg'],
              (fmt) => this.onExport(fmt),
            );
            anchor.replaceWith(this._exportDropdown.el);
          }
          this._autoSizeAll();
          this._scheduleBrackets();
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
        if (this._exportDropdown) {
          this._exportDropdown.destroy();
          this._exportDropdown = null;
        }
        if (this._onMouseUp) {
          document.removeEventListener('mouseup', this._onMouseUp);
          this._onMouseUp = null;
        }
        this._renderGen++; // abort any in-flight rAF-poll
      },
    };
  },
});
