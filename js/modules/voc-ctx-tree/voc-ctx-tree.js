/**
 * D.Mike — VoC → CTx Tree Module (voc-ctx-tree.js)
 * Define phase: translate Voice of Customer statements into a CTx hierarchy
 * (Needs → Drivers → Requirements).
 *
 * Migrated to createModule + Alpine CSP. The Model (voc-ctx-tree-model.js) holds
 * the persisted state (vocs tree + activeVocId + appearance styles) plus all node
 * CRUD, sibling reorder, and export-row flattening. This data-fn owns the view
 * transforms (card/ node CSS classes, i18n badge/ count text), the add/edit/delete
 * form-popout handlers (declarative popout via the draggablePopout mixin), the
 * badge-handle drag reordering (transient state), the export dropdown + exporters,
 * and the imperative appearance settings panel (chart-editor building blocks).
 *
 * No HTML is built in JS for the module UI — the tree, cards, and form popout
 * live in voc-ctx-tree.html. The settings panel and the SVG export image are the
 * documented imperative exceptions (chart-editor widgets / pure SVG export util).
 *
 * Spec: docs/modules/VOC-CTX-TREE.md
 */

import { createModule } from '../../core/template-module.js';
import { exportSvgAsPNG, exportSvgAsFile } from '../../core/chart/modebar.js';
import {
  edSection, edColorPair, edRangeRow, openColorPicker, parseRGBA, rgbaStr,
} from '../../core/chart/chart-editor.js';
import { ensureXLSX, XLSX, downloadBlob } from '../../core/export-utils.js';
import { shortcutRegistry } from '../../core/shortcut-registry.js';
import { draggablePopout } from '../../ui/draggable-popout.js';
import { State } from './voc-ctx-tree-model.js';
import { buildTreeSVG } from './voc-ctx-tree-svg.js';

/** CSS custom-property map for the node colours. */
const COLOR_PROP = {
  voc:  '--color-vct-voc',
  need: '--color-vct-need',
  ctq:  '--color-vct-ctq',
  ctd:  '--color-vct-ctd',
  ctc:  '--color-vct-ctc',
  req:  '--color-vct-req',
};

export default createModule({
  config: {
    id: 'voc-ctx-tree',
    engine: 'alpine',
    phase: 'define',
    icon: 'message-circle',
    version: '0.1.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      ...draggablePopout({
        size: 'width:480px;height:auto;min-height:240px;max-height:80vh;',
        initialPosition: 'left:calc(50% - 240px);top:calc(50% - 180px)',
      }),

      // ── Transient UI state (never persisted) ──────────────────
      /** @type {string|null} export dropdown open flag */
      exportMenuOpen: false,
      /** @type {string|null} 'voc' | 'need' | 'driver' | 'req' — open form kind */
      modalKind: null,
      /** @type {object} working copy of the form fields */
      modalData: { text: '', source: '', type: 'ctq', target: '', measure: '' },
      /** @type {object} context ids for the current edit (vocId/needId/drvId) + editId */
      modalCtx: {},
      /** @type {{kind:string, scope:object, id:string}|null} active drag source */
      _drag: null,

      // ── View transforms ───────────────────────────────────────
      cardClass(voc) {
        return voc.id === this.model.activeVocId ? 'vct__card--active' : '';
      },
      /** Card meta: "{needs} Needs · {reqs} Req." (mirrors legacy). */
      cardCountText(voc) {
        return `${voc.needs.length  } ${  _t('needCount') 
          } · ${  this.model.totalReqs(voc)  } Req.`;
      },
      quoted(text) { return `„${  text  }“`; },
      sourceLine(src) { return `${_t('source')  }: ${  src}`; },
      targetLine(v) { return `${_t('target')  }: ${  v}`; },
      measureLine(v) { return `${_t('measurement')  }: ${  v}`; },
      driverBadge(type) { return type.toUpperCase(); },
      driverNodeClass(drv) { return `vct__node--${  drv.type}`; },
      driverChildrenClass(drv) { return `vct__children--${  drv.type}`; },
      typeOptClass(type) {
        return this.modalData.type === type ? `vct__type-option--${  type}` : '';
      },

      // ── Form labels / placeholders (per modal kind) ───────────
      textLabel() {
        const k = this.modalKind;
        if (k === 'voc') return `${_t('vocText')  } *`;
        if (k === 'need') return `${_t('needText')  } *`;
        if (k === 'driver') return `${_t('driverText')  } *`;
        return `${_t('reqText')  } *`;
      },
      textPlaceholder() {
        const k = this.modalKind;
        if (k === 'voc') return _t('vocPlaceholder');
        if (k === 'need') return _t('needPlaceholder');
        if (k === 'driver') return _t('driverPlaceholder');
        return _t('reqPlaceholder');
      },
      textMaxLength() {
        return this.modalKind === 'voc' ? 1000 : 500;
      },
      modalTitle() {
        const editing = Boolean(this.modalCtx.editId);
        const k = this.modalKind;
        if (k === 'voc') return _t(editing ? 'editVoc' : 'addVoc');
        if (k === 'need') return _t(editing ? 'editNeed' : 'addNeed');
        if (k === 'driver') return _t(editing ? 'editDriver' : 'addDriver');
        return _t(editing ? 'editReq' : 'addReq');
      },

      // ── VoC handlers ──────────────────────────────────────────
      /** Re-apply the per-node inline border width after the tree re-renders. */
      _afterMutate() {
        this.$nextTick(() => this.applyStyles());
      },
      selectVoc(id, event) {
        if (event && event.target.closest('.vct__card-action-btn')) return;
        this.model.setActiveVoc(id);
        this._afterMutate();
      },
      openVocModal() {
        this._openModal('voc', {}, { text: '', source: '' });
      },
      editVoc(voc, event) {
        event?.stopPropagation?.();
        this._openModal('voc', { editId: voc.id }, { text: voc.text, source: voc.source || '' });
      },
      async deleteVoc(voc, event) {
        event?.stopPropagation?.();
        const ok = await module._context.confirmPopout(
          _t('deleteVocConfirm'), { danger: true }
        );
        if (!ok) return;
        this.model.deleteVoc(voc.id);
        this._afterMutate();
      },

      // ── Need handlers ─────────────────────────────────────────
      openNeedModal(vocId) {
        this._openModal('need', { vocId }, { text: '' });
      },
      editNeed(vocId, need) {
        this._openModal('need', { vocId, editId: need.id }, { text: need.text });
      },
      deleteNeed(vocId, needId) {
        this.model.deleteNeed(vocId, needId);
        this._afterMutate();
      },

      // ── Driver handlers ───────────────────────────────────────
      openDriverModal(vocId, needId) {
        this._openModal('driver', { vocId, needId }, { text: '', type: 'ctq' });
      },
      editDriver(vocId, needId, drv) {
        this._openModal('driver', { vocId, needId, editId: drv.id }, { text: drv.text, type: drv.type });
      },
      deleteDriver(vocId, needId, drvId) {
        this.model.deleteDriver(vocId, needId, drvId);
        this._afterMutate();
      },

      // ── Requirement handlers ──────────────────────────────────
      openReqModal(vocId, needId, drvId) {
        this._openModal('req', { vocId, needId, drvId }, { text: '', target: '', measure: '' });
      },
      editReq(vocId, needId, drvId, req) {
        this._openModal('req', { vocId, needId, drvId, editId: req.id },
          { text: req.text, target: req.target || '', measure: req.measure || '' });
      },
      deleteReq(vocId, needId, drvId, reqId) {
        this.model.deleteRequirement(vocId, needId, drvId, reqId);
        this._afterMutate();
      },

      // ── Modal open / save ─────────────────────────────────────
      _openModal(kind, ctx, fields) {
        this.modalCtx = ctx;
        this.modalData = { text: '', source: '', type: 'ctq', target: '', measure: '', ...fields };
        this.popoutResetPosition();
        this.modalKind = kind;
        this.$nextTick(() => {
          const ta = this.$el.querySelector('[data-ref="modalText"]');
          ta?.focus();
        });
      },
      closeModal() {
        this.modalKind = null;
        this.popoutResetPosition();
      },
      /** Ctrl+Enter (configurable) commits the form. */
      commitKey(event) {
        if (shortcutRegistry.matches(event, 'vocCtxTree.commit')) {
          event.preventDefault();
          this.saveModal();
        }
      },
      saveModal() {
        const d = this.modalData;
        const text = (d.text || '').trim();
        if (!text) {
          this.$el.querySelector('[data-ref="modalText"]')?.focus();
          return; // empty text rejected — form stays open
        }
        const ctx = this.modalCtx;
        const k = this.modalKind;
        if (k === 'voc') {
          const source = (d.source || '').trim();
          if (ctx.editId) this.model.updateVoc(ctx.editId, text, source);
          else this.model.addVoc(text, source);
        } else if (k === 'need') {
          if (ctx.editId) this.model.updateNeed(ctx.vocId, ctx.editId, text);
          else this.model.addNeed(ctx.vocId, text);
        } else if (k === 'driver') {
          const type = d.type || 'ctq';
          if (ctx.editId) this.model.updateDriver(ctx.vocId, ctx.needId, ctx.editId, text, type);
          else this.model.addDriver(ctx.vocId, ctx.needId, text, type);
        } else if (k === 'req') {
          const target = (d.target || '').trim();
          const measure = (d.measure || '').trim();
          if (ctx.editId) this.model.updateRequirement(ctx.vocId, ctx.needId, ctx.drvId, ctx.editId, text, target, measure);
          else this.model.addRequirement(ctx.vocId, ctx.needId, ctx.drvId, text, target, measure);
        }
        this.closeModal();
        this._afterMutate();
      },

      // ── Drag-and-drop reordering (badge handle → native drag) ─
      // Mirror legacy: arming a node for native HTML5 drag happens synchronously
      // on the badge mousedown (so the subsequent dragstart can fire). The node
      // is disarmed on the global mouseup (registered in init()).
      startDrag(event) {
        const node = event.target.closest('.vct__node[data-drag-type]');
        if (node) node.setAttribute('draggable', 'true');
      },
      dragStart(scope, id, kind, event) {
        this._drag = { kind, scope, id };
        const node = event.target.closest('.vct__node[data-drag-type]');
        if (node) node.classList.add('vct__node--dragging');
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      },
      dragOver(event) {
        const drag = this._drag;
        const treeArea = event.currentTarget;
        const target = event.target.closest('.vct__node[data-drag-type]');
        if (!drag || !target || target.dataset.dragType !== drag.kind) return;
        if (!this._areDragSiblings(drag, target.dataset)) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        treeArea.querySelectorAll('.vct__node--drag-over').forEach((n) =>
          n.classList.remove('vct__node--drag-over'));
        target.classList.add('vct__node--drag-over');
      },
      drop(event) {
        event.preventDefault();
        const drag = this._drag;
        if (!drag) return;
        const target = event.target.closest('.vct__node[data-drag-type]');
        if (!target || target.dataset.dragType !== drag.kind) { this._clearDrag(event.currentTarget); return; }
        if (!this._areDragSiblings(drag, target.dataset)) { this._clearDrag(event.currentTarget); return; }
        const toId = this._targetId(drag.kind, target.dataset);
        this.model.reorderNodes(drag.kind, drag.scope, drag.id, toId);
        this._clearDrag(event.currentTarget);
        this._afterMutate();
      },
      dragEnd(event) {
        this._clearDrag(event.currentTarget);
      },
      _clearDrag(treeArea) {
        this._drag = null;
        if (treeArea) {
          treeArea.querySelectorAll('.vct__node--dragging').forEach((n) =>
            n.classList.remove('vct__node--dragging'));
          treeArea.querySelectorAll('.vct__node--drag-over').forEach((n) =>
            n.classList.remove('vct__node--drag-over'));
        }
      },
      _areDragSiblings(drag, targetDs) {
        const s = drag.scope;
        switch (drag.kind) {
          case 'need':   return s.vocId === targetDs.vocId;
          case 'driver': return s.vocId === targetDs.vocId && s.needId === targetDs.needId;
          case 'req':    return s.vocId === targetDs.vocId && s.needId === targetDs.needId && s.drvId === targetDs.drvId;
        }
        return false;
      },
      _targetId(kind, ds) {
        if (kind === 'need') return ds.needId;
        if (kind === 'driver') return ds.drvId;
        return ds.reqId;
      },

      // ── Export ────────────────────────────────────────────────
      toggleExportMenu(event) {
        event.stopPropagation();
        this.exportMenuOpen = !this.exportMenuOpen;
        if (this.exportMenuOpen) this.$nextTick(() => this._positionExportMenu());
      },
      _positionExportMenu() {
        const btn = this.$el.querySelector('.vct__export-btn');
        const menu = this.$el.querySelector('[data-ref="exportMenu"]');
        if (!btn || !menu) return;
        const rect = btn.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.top = `${rect.bottom + 4  }px`;
        menu.style.left = `${rect.left  }px`;
        menu.style.right = 'auto';
      },
      onExport(fmt) {
        this.exportMenuOpen = false;
        if (fmt === 'csv') this.exportCSV();
        if (fmt === 'xlsx') this.exportXLSX();
        if (fmt === 'png') this.exportPNG();
        if (fmt === 'svg') this.exportSVG();
      },
      _exportHeaders() {
        const tk = _t;
        return [
          tk('legendVoc'), tk('vocSource'), tk('legendNeed'),
          tk('driverType'), 'CTx', tk('legendReq'), tk('target'), tk('measurement'),
        ];
      },
      exportCSV() {
        const rows = this.model.getExportRows();
        if (rows.length === 0) return;
        const esc = (v) => {
          const s = String(v ?? '');
          return (s.includes(';') || s.includes('"') || s.includes('\n'))
            ? `"${  s.replace(/"/g, '""')  }"`
            : s;
        };
        const lines = [this._exportHeaders().map(esc).join(';')];
        for (const row of rows) lines.push(row.map(esc).join(';'));
        const blob = new Blob([`\uFEFF${  lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
        downloadBlob(blob, 'voc-ctx-tree.csv');
      },
      async exportXLSX() {
        const rows = this.model.getExportRows();
        if (rows.length === 0) return;
        try { await ensureXLSX(); } catch { module._context.notify?.('XLSX library not loaded'); return; }
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([this._exportHeaders(), ...rows]);
        XLSX.utils.book_append_sheet(wb, ws, 'VoC-CTx');
        XLSX.writeFile(wb, 'voc-ctx-tree.xlsx');
      },
      _buildSvg() {
        const voc = this.model.activeVoc;
        if (!voc) return null;
        const tk = _t;
        return buildTreeSVG(voc, this.model.styles, {
          source: tk('source'),
          badgeNeed: tk('badgeNeed'),
          badgeReq: tk('badgeReq'),
          target: tk('target'),
          measurement: tk('measurement'),
        });
      },
      exportPNG() {
        const svg = this._buildSvg();
        if (svg) exportSvgAsPNG(svg, 'voc-ctx-tree.png');
      },
      exportSVG() {
        const svg = this._buildSvg();
        if (svg) exportSvgAsFile(svg, 'voc-ctx-tree.svg');
      },

      // ── Appearance settings panel (chart-editor widgets) ──────
      applyStyles() {
        const root = this.$el.querySelector('.vct') || this.$el;
        if (!root) return;
        const s = this.model.styles;
        for (const [key, prop] of Object.entries(COLOR_PROP)) {
          const c = parseRGBA(s.colors[key]);
          root.style.setProperty(prop, rgbaStr({ ...c, a: 1 }));
          root.style.setProperty(`${prop}-bg`, rgbaStr({ ...c, a: 0.06 }));
          root.style.setProperty(`${prop}-border`, rgbaStr({ ...c, a: 0.20 }));
          root.style.setProperty(`${prop}-badge-bg`, rgbaStr({ ...c, a: 0.12 }));
          root.style.setProperty(`${prop}-line`, rgbaStr({ ...c, a: 0.25 }));
        }
        root.querySelectorAll('.vct__node').forEach((node) => {
          node.style.borderWidth = `${s.borderWidth}px`;
        });
      },
      _buildSettingsPanel() {
        const panel = this.$el.querySelector('[data-ref="settingsPanel"]');
        if (!panel) return;
        panel.replaceChildren();
        const tk = _t;
        const section = edSection(tk('settings'));

        const colorKeys = [
          { key: 'voc',  label: tk('colorVoc'),  tip: tk('colorVocTip') },
          { key: 'need', label: tk('colorNeed') },
          { key: 'ctq',  label: tk('colorCtq'),  tip: tk('colorCtqTip') },
          { key: 'ctd',  label: tk('colorCtd'),  tip: tk('colorCtdTip') },
          { key: 'ctc',  label: tk('colorCtc'),  tip: tk('colorCtcTip') },
          { key: 'req',  label: tk('colorReq') },
        ];
        for (const { key, label, tip } of colorKeys) {
          const { el, swatch } = edColorPair(label, this.model.styles.colors[key], (e) => {
            openColorPicker(e, this.model.styles.colors[key], (newColor) => {
              this.model.styles.colors[key] = newColor;
              swatch.style.background = newColor;
              this.applyStyles();
            });
          });
          if (tip) el.title = tip;
          section.appendChild(el);
        }
        section.appendChild(edRangeRow(tk('borderWidth'), this.model.styles.borderWidth, (val) => {
          this.model.styles.borderWidth = val;
          this.applyStyles();
        }, 0, 4, 0.5));

        panel.appendChild(section);
      },

      // ── Lifecycle (per Alpine instance) ───────────────────────
      init() {
        // Re-arm native drag once the dragId flips a node to draggable=true:
        // bind a single dragstart on the tree area that reads the armed node.
        this.$nextTick(() => {
          this._buildSettingsPanel();
          this.applyStyles();
          const treeArea = this.$el.querySelector('[data-ref="treeArea"]');
          if (treeArea) {
            this._onDragStart = (event) => {
              const node = event.target.closest('.vct__node[data-drag-type]');
              if (!node || node.getAttribute('draggable') !== 'true') return;
              const ds = node.dataset;
              const kind = ds.dragType;
              const scope = { vocId: ds.vocId, needId: ds.needId, drvId: ds.drvId };
              const id = this._targetId(kind, ds);
              this.dragStart(scope, id, kind, event);
            };
            treeArea.addEventListener('dragstart', this._onDragStart);
          }
          // Release draggable after mouseup anywhere (mirror legacy mouseup reset).
          this._onMouseUp = () => {
            const ta = this.$el.querySelector('[data-ref="treeArea"]');
            ta?.querySelectorAll('.vct__node[draggable]').forEach((n) => n.removeAttribute('draggable'));
          };
          document.addEventListener('mouseup', this._onMouseUp);
        });
      },
      destroy() {
        if (this._onMouseUp) {
          document.removeEventListener('mouseup', this._onMouseUp);
          this._onMouseUp = null;
        }
        this._onDragStart = null;
      },
    };
  },
});
