/**
 * DMAIC.io — Makigami Matrix Module (makigami.js)
 *
 * Swim-lane process analysis with processing/waiting times and waste
 * classification. DMAIC phase: Analyze · DMADV: Analyze · 8D: Root cause.
 *
 * Migrated to createModule + Alpine CSP. The Model (makigami-model.js) owns the
 * persisted state and business logic (roles, steps, participation, muda markers,
 * time units, KPI). The pure free-text duration parser lives in
 * makigami-duration.js. This data-fn owns only view transforms (i18n labels,
 * KPI formatting, validity classes), the event handlers (which call Model
 * methods or mutate the reactive model), the table-header drag-reorder (transient
 * drag state — not the draggableList list mixin, which is clientY/list based and
 * does not fit a 2-axis table grid), and the export handlers. Settings toggle and
 * export are exposed via config.actions (unified workspace action bar) rather
 * than an in-content toolbar. No HTML is built in JS for the UI — the markup
 * lives in makigami.html.
 */

import { createModule } from '../../core/template-module.js';
import {
  downloadFile, downloadBlob, ensureXLSX, XLSX, svgStringToPngBlob,
} from '../../core/export-utils.js';
import { escAttr } from '../../core/html-utils.js';
import { parseDuration, formatDuration, canonicalize } from './makigami-duration.js';
import { State } from './makigami-model.js';

export default createModule({
  config: {
    id: 'makigami',
    engine: 'alpine',
    phase: 'analyze',
    icon: 'module.makigami',
    version: '1.0.0',
    meta: import.meta,
    actions: [
      { icon: 'action.settings', title: 'settings', onClick: (d) => d.toggleSettings() },
      {
        icon: 'action.download',
        title: 'export.label',
        children: [
          { icon: 'format.xlsx', title: 'export.xlsx', onClick: (d) => d._exportXLSX() },
          { icon: 'format.csv',  title: 'export.csv',  onClick: (d) => d._exportCSV() },
          { icon: 'format.json', title: 'export.json', onClick: (d) => d._exportJSON() },
          { icon: 'format.png',  title: 'export.png',  onClick: (d) => d._exportPNG() },
          { icon: 'format.svg',  title: 'export.svg',  onClick: (d) => d._exportSVG() },
        ],
      },
    ],
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Transient UI state (never persisted) ──────────────────
      /** @type {string|null} */
      _draggedId: null,
      /** @type {'step'|'role'|null} */
      _draggedType: null,
      /** @type {(()=>void)|null} */
      _dragMouseUpHandler: null,

      // ── Settings toggle ───────────────────────────────────────
      toggleSettings() {
        this.model.settingsOpen = !this.model.settingsOpen;
        if (this.model.settingsOpen) {
          this.$nextTick(() => {
            this.$el.querySelector('[data-ref="settings"]')
              ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          });
        }
      },
      closeSettings() {
        this.model.settingsOpen = false;
      },

      // ── Roles & steps ─────────────────────────────────────────
      addRole() { this.model.addRole(); },
      addStep() { this.model.addStep(); },
      toggleParticipation(stepId, roleId) { this.model.toggleParticipation(stepId, roleId); },
      toggleMuda(stepId, mudaId) { this.model.toggleMuda(stepId, mudaId); },
      toggleStepExpanded(stepId) { this.model.toggleStepExpanded(stepId); },

      async deleteStep(stepId) {
        const idx = this.model.steps.findIndex(s => s.id === stepId);
        if (idx === -1) return;
        const step = this.model.steps[idx];
        const label = step.title || (`S${  idx + 1}`);
        const msg = _t('delStepConfirm').replace('{title}', label);
        const ok = module._context?.confirmPopout
          ? await module._context.confirmPopout(msg, { danger: true })
           
          : confirm(msg);
        if (!ok) return;
        this.model.deleteStep(stepId);
      },

      async deleteRole(roleId) {
        const role = this.model.roles.find(r => r.id === roleId);
        if (!role) return;
        const label = role.label || _t('rolePlaceholder');
        const msg = _t('delRoleConfirm').replace('{label}', label);
        const ok = module._context?.confirmPopout
          ? await module._context.confirmPopout(msg, { danger: true })
           
          : confirm(msg);
        if (!ok) return;
        this.model.deleteRole(roleId);
      },

      // ── Settings mutators ─────────────────────────────────────
      addMudaCategory() { this.model.addMudaCategory(); },
      addTimeUnit() { this.model.addTimeUnit(); },
      deleteMudaCategory(mudaId) { this.model.deleteMudaCategory(mudaId); },
      deleteTimeUnit(unitId) { this.model.deleteTimeUnit(unitId); },
      unitFactorChanged(unit, event) {
        const n = Number(event.target.value);
        if (!Number.isFinite(n) || n <= 0) return;
        unit.factorSeconds = n;
      },
      async resetSettings() {
        const ok = module._context?.confirmPopout
          ? await module._context.confirmPopout(_t('settingsResetConfirm'), { danger: true })
           
          : confirm(_t('settingsResetConfirm'));
        if (!ok) return;
        this.model.resetSettings();
      },

      // ── View helpers ──────────────────────────────────────────
      stepBadge(i) { return `S${  i + 1}`; },
      cardExpanded(step) { return step.expanded !== false; },
      cardTitle(step, idx) {
        return step.title.trim() || (`S${  idx + 1}`);
      },
      stepHasRole(step, roleId) { return step.roleIds.includes(roleId); },
      stepHasMuda(step, mudaId) { return step.mudaIds.includes(mudaId); },
      roleChipLabel(role) { return role.label.trim() || _t('rolePlaceholder'); },
      mudaLabel(cat) {
        if (cat.label) return cat.label;
        if (cat.labelKey) return _t(cat.labelKey);
        return cat.code || '';
      },
      mudaPlaceholder(cat) {
        return cat.labelKey ? _t(cat.labelKey) : '';
      },
      timeValid(text) {
        return parseDuration(text, this.model.timeUnits).valid;
      },

      // ── KPI ───────────────────────────────────────────────────
      kpi() { return this.model.computeKPI(); },
      kpiTime(seconds) {
        if (this.model.steps.length === 0) return _t('kpiNoData');
        return formatDuration(seconds, this.model.timeUnits);
      },
      kpiPCE(ratio) {
        if (ratio == null) return _t('kpiNoData');
        const locale = module._context.i18n.getLanguage() === 'de' ? 'de-DE' : 'en-US';
        return `${(ratio * 100).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })  } %`;
      },

      // ── Time input blur — canonicalize valid, non-empty input ─
      timeBlur(step, field, event) {
        const el = event.target;
        const result = canonicalize(el.value, this.model.timeUnits);
        if (result.valid && result.text !== el.value && el.value.trim() !== '') {
          step[field] = result.text;
        }
      },

      // ── Drag-and-drop reorder (table headers, 2-axis) ─────────
      // Replicates the legacy grip-handle drag: the handle arms `draggable` on
      // the parent th on mousedown; a document mouseup disarms it. dragstart on a
      // th records source id+type; drop on a same-type th reorders before target.
      dragHandleDown(event) {
        const root = event.target.closest('.makigami__matrix-step-head, .makigami__matrix-role-head');
        if (root) root.setAttribute('draggable', 'true');
      },
      _startDrag(id, type, event) {
        this._draggedId = id;
        this._draggedType = type;
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
        const node = event.currentTarget;
        const cls = type === 'step'
          ? 'makigami__matrix-step-head--dragging'
          : 'makigami__matrix-role-head--dragging';
        setTimeout(() => node.classList.add(cls), 0);
      },
      _endDrag(event) {
        const node = event.currentTarget;
        node.removeAttribute('draggable');
        this.$el.querySelectorAll(
          '.makigami__matrix-step-head--dragging, .makigami__matrix-role-head--dragging, ' +
          '.makigami__matrix-step-head--drag-over, .makigami__matrix-role-head--drag-over',
        ).forEach(el => {
          el.classList.remove(
            'makigami__matrix-step-head--dragging', 'makigami__matrix-role-head--dragging',
            'makigami__matrix-step-head--drag-over', 'makigami__matrix-role-head--drag-over',
          );
        });
        this._draggedId = null;
        this._draggedType = null;
      },
      _overDrag(id, type, event, overClass) {
        if (this._draggedType !== type) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        if (id !== this._draggedId) event.currentTarget.classList.add(overClass);
      },
      _leaveDrag(event, overClass) {
        const node = event.currentTarget;
        if (!node.contains(event.relatedTarget)) node.classList.remove(overClass);
      },

      dragStartStep(id, event) { this._startDrag(id, 'step', event); },
      dragEndStep(event) { this._endDrag(event); },
      dragOverStep(id, event) { this._overDrag(id, 'step', event, 'makigami__matrix-step-head--drag-over'); },
      dragLeaveStep(id, event) { this._leaveDrag(event, 'makigami__matrix-step-head--drag-over'); },
      dropStep(id, event) {
        if (this._draggedType !== 'step') return;
        event.preventDefault();
        if (this._draggedId && this._draggedId !== id) {
          this.model.reorderSteps(this._draggedId, id);
        }
      },

      dragStartRole(id, event) { this._startDrag(id, 'role', event); },
      dragEndRole(event) { this._endDrag(event); },
      dragOverRole(id, event) { this._overDrag(id, 'role', event, 'makigami__matrix-role-head--drag-over'); },
      dragLeaveRole(id, event) { this._leaveDrag(event, 'makigami__matrix-role-head--drag-over'); },
      dropRole(id, event) {
        if (this._draggedType !== 'role') return;
        event.preventDefault();
        if (this._draggedId && this._draggedId !== id) {
          this.model.reorderRoles(this._draggedId, id);
        }
      },

      // ── Export helpers ────────────────────────────────────────
      _exportFilenameBase() {
        const slug = (this.model.title || 'makigami')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
        return slug || 'makigami';
      },
      _rolesText(step) {
        return step.roleIds
          .map(id => this.model.roles.find(r => r.id === id))
          .filter(Boolean)
          .map(r => r.label.trim() || _t('rolePlaceholder'))
          .join('; ');
      },
      _mudaText(step) {
        return step.mudaIds
          .map(id => this.model.mudaCategories.find(m => m.id === id))
          .filter(Boolean)
          .map(m => this.mudaLabel(m))
          .join('; ');
      },

      _exportJSON() {
        const data = this.model.toJSON();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        downloadBlob(blob, `${this._exportFilenameBase()  }.json`);
        module._context.notify?.('JSON ✓', 'success');
      },

      _exportCSV() {
        const esc = (v) => {
          const str = String(v ?? '');
          return /[",\n;]/.test(str) ? `"${  str.replace(/"/g, '""')  }"` : str;
        };
        const rows = [[
          _t('exportColStep'), _t('exportColActivity'), _t('exportColRoles'),
          _t('exportColProcess'), _t('exportColWait'), _t('exportColMuda'),
          _t('exportColNotes'),
        ]];
        this.model.steps.forEach((s, i) => {
          rows.push([
            `S${  i + 1  }${s.title ? `: ${  s.title}` : ''}`,
            s.description,
            this._rolesText(s),
            s.processTime,
            s.waitTime,
            this._mudaText(s),
            s.notes,
          ]);
        });
        const csv = rows.map(r => r.map(esc).join(',')).join('\r\n');
        downloadFile(csv, `${this._exportFilenameBase()  }.csv`, 'text/csv;charset=utf-8');
        module._context.notify?.('CSV ✓', 'success');
      },

      async _exportXLSX() {
        try { await ensureXLSX(); }
        catch (err) { module._context.notify?.(`XLSX: ${  err.message}`, 'error'); return; }

        const wb = XLSX.utils.book_new();

        // Sheet 1 — Matrix (roles × steps)
        const stepHeader = ['', ...this.model.steps.map((s, i) => `S${  i + 1  }${s.title ? `: ${  s.title}` : ''}`)];
        const matrixRows = [stepHeader];
        this.model.roles.forEach(role => {
          matrixRows.push([
            role.label.trim() || _t('rolePlaceholder'),
            ...this.model.steps.map(s => s.roleIds.includes(role.id) ? '●' : ''),
          ]);
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(matrixRows), _t('exportSheetMatrix'));

        // Sheet 2 — Steps (flat)
        const stepRows = [[
          _t('exportColStep'), _t('exportColActivity'), _t('exportColRoles'),
          _t('exportColProcess'), _t('exportColWait'), _t('exportColMuda'),
          _t('exportColNotes'),
        ]];
        this.model.steps.forEach((s, i) => {
          stepRows.push([
            `S${  i + 1  }${s.title ? `: ${  s.title}` : ''}`,
            s.description,
            this._rolesText(s),
            s.processTime,
            s.waitTime,
            this._mudaText(s),
            s.notes,
          ]);
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(stepRows), _t('exportSheetSteps'));

        // Sheet 3 — KPI
        const kpi = this.model.computeKPI();
        const kpiRows = [
          [_t('kpiProcess'), this.kpiTime(kpi.process)],
          [_t('kpiWait'),    this.kpiTime(kpi.wait)],
          [_t('kpiLead'),    this.kpiTime(kpi.lead)],
          [_t('kpiPCE'),     this.kpiPCE(kpi.pce)],
        ];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kpiRows), _t('exportSheetKPI'));

        XLSX.writeFile(wb, `${this._exportFilenameBase()  }.xlsx`);
        module._context.notify?.('Excel ✓', 'success');
      },

      _buildExportSVG() {
        const ROW_H = 32, COL_W = 150, ROLE_COL_W = 200, HEADER_H = 40;
        const KPI_H = 64, KPI_GAP = 24;

        const roles = this.model.roles;
        const steps = this.model.steps;
        const nCols = Math.max(1, steps.length);
        const nRows = Math.max(1, roles.length);
        const tableW = ROLE_COL_W + nCols * COL_W;
        const tableH = HEADER_H + nRows * ROW_H;
        const totalH = tableH + KPI_GAP + KPI_H;
        const totalW = tableW;

        const cs = getComputedStyle(document.documentElement);
        const cv = (n, fb) => cs.getPropertyValue(n).trim() || fb;
        const C = {
          bg:        cv('--color-bg-primary',     '#ffffff'),
          bgSec:     cv('--color-bg-secondary',   '#f5f5f7'),
          border:    cv('--color-border-primary', '#d2d2d7'),
          text:      cv('--color-text-primary',   '#1d1d1f'),
          muted:     cv('--color-text-tertiary',  '#86868b'),
          accent:    cv('--color-accent',         '#0066cc'),
          accentBg:  cv('--color-accent-light',   '#e5f0ff'),
        };

        const parts = [];
        parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${  totalW  }" height="${  totalH  }" viewBox="0 0 ${  totalW  } ${  totalH  }" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="12">`);
        parts.push(`<rect width="${  totalW  }" height="${  totalH  }" fill="${  C.bg  }"/>`);

        // Corner header
        parts.push(`<rect x="0" y="0" width="${  ROLE_COL_W  }" height="${  HEADER_H  }" fill="${  C.bgSec  }" stroke="${  C.border  }"/>`);
        // The on-screen corner header reads two i18n keys side by side
        // (rolesHeaderRows / rolesHeaderCols) with a nav.arrow-down and a
        // nav.arrow-right icon between them. This export is a downloaded
        // SVG file — no CSS mask icons exist there — so it composes the
        // same two keys as plain text, joined the same way the arrows used
        // to read before they became icons.
        const rolesHeaderText = `${  _t('rolesHeaderRows')  } / ${  _t('rolesHeaderCols')  }`;
        parts.push(`<text x="${  ROLE_COL_W / 2  }" y="${  HEADER_H / 2 + 4  }" fill="${  C.muted  }" text-anchor="middle">${  escAttr(rolesHeaderText)  }</text>`);

        // Step headers
        steps.forEach((s, i) => {
          const x = ROLE_COL_W + i * COL_W;
          parts.push(`<rect x="${  x  }" y="0" width="${  COL_W  }" height="${  HEADER_H  }" fill="${  C.bgSec  }" stroke="${  C.border  }"/>`);
          const title = `S${  i + 1  }${s.title ? `: ${  s.title}` : ''}`;
          parts.push(`<text x="${  x + COL_W / 2  }" y="${  HEADER_H / 2 + 4  }" fill="${  C.text  }" text-anchor="middle">${  escAttr(title.length > 28 ? `${title.slice(0, 25)  }…` : title)  }</text>`);
        });

        // Body
        if (roles.length === 0 || steps.length === 0) {
          parts.push(`<text x="${  totalW / 2  }" y="${  HEADER_H + ROW_H / 2 + 4  }" fill="${  C.muted  }" text-anchor="middle">—</text>`);
        } else {
          roles.forEach((r, ri) => {
            const y = HEADER_H + ri * ROW_H;
            parts.push(`<rect x="0" y="${  y  }" width="${  ROLE_COL_W  }" height="${  ROW_H  }" fill="${  C.bgSec  }" stroke="${  C.border  }"/>`);
            const label = r.label.trim() || _t('rolePlaceholder');
            parts.push(`<text x="12" y="${  y + ROW_H / 2 + 4  }" fill="${  C.text  }">${  escAttr(label.length > 26 ? `${label.slice(0, 23)  }…` : label)  }</text>`);

            steps.forEach((s, si) => {
              const x = ROLE_COL_W + si * COL_W;
              parts.push(`<rect x="${  x  }" y="${  y  }" width="${  COL_W  }" height="${  ROW_H  }" fill="${  C.bg  }" stroke="${  C.border  }"/>`);
              const active = s.roleIds.includes(r.id);
              const cx = x + COL_W / 2;
              const cy = y + ROW_H / 2;
              if (active) {
                parts.push(`<circle cx="${  cx  }" cy="${  cy  }" r="8" fill="${  C.accent  }"/>`);
              } else {
                parts.push(`<circle cx="${  cx  }" cy="${  cy  }" r="8" fill="none" stroke="${  C.border  }" stroke-width="2"/>`);
              }
            });
          });
        }

        // KPI strip
        const kpi = this.model.computeKPI();
        const labels = [_t('kpiProcess'), _t('kpiWait'), _t('kpiLead'), _t('kpiPCE')];
        const values = [this.kpiTime(kpi.process), this.kpiTime(kpi.wait), this.kpiTime(kpi.lead), this.kpiPCE(kpi.pce)];
        const kpiY = tableH + KPI_GAP;
        const cellW = totalW / 4;
        for (let i = 0; i < 4; i++) {
          const x = i * cellW;
          const isAcc = i === 3;
          parts.push(`<rect x="${  x  }" y="${  kpiY  }" width="${  cellW  }" height="${  KPI_H  }" fill="${  isAcc ? C.accentBg : C.bgSec  }" stroke="${  isAcc ? C.accent : C.border  }"/>`);
          parts.push(`<text x="${  x + cellW / 2  }" y="${  kpiY + 22  }" fill="${  C.muted  }" text-anchor="middle" font-size="10" letter-spacing="0.05em">${  escAttr(labels[i].toUpperCase())  }</text>`);
          parts.push(`<text x="${  x + cellW / 2  }" y="${  kpiY + 48  }" fill="${  C.text  }" text-anchor="middle" font-size="18" font-weight="600">${  escAttr(values[i])  }</text>`);
        }

        parts.push('</svg>');
        return { svg: parts.join(''), width: totalW, height: totalH };
      },

      _exportSVG() {
        const { svg } = this._buildExportSVG();
        const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
        downloadBlob(blob, `${this._exportFilenameBase()  }.svg`);
        module._context.notify?.('SVG ✓', 'success');
      },

      _exportPNG() {
        const { svg, width, height } = this._buildExportSVG();
        svgStringToPngBlob(svg, { width, height, scale: 2 })
          .then((b) => {
            downloadBlob(b, `${this._exportFilenameBase()  }.png`);
            module._context.notify?.('PNG ✓', 'success');
          })
          .catch(() => {
            module._context.notify?.('PNG: render failed', 'error');
          });
      },

      // ── Lifecycle (per Alpine instance) ───────────────────────
      init() {
        // Global mouseup disarms any `draggable` armed by a grip handle.
        this._dragMouseUpHandler = () => {
          this.$el.querySelectorAll('[draggable="true"]').forEach(el => el.removeAttribute('draggable'));
        };
        document.addEventListener('mouseup', this._dragMouseUpHandler);
      },
      destroy() {
        if (this._dragMouseUpHandler) {
          document.removeEventListener('mouseup', this._dragMouseUpHandler);
          this._dragMouseUpHandler = null;
        }
      },
    };
  },
});
