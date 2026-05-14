/**
 * D.Mike — RACI Matrix Module (raci-matrix.js)
 * Define phase: Assign Responsible, Accountable, Consulted, Informed
 * roles per activity/task to project stakeholders.
 */

const ROLES = ['R', 'A', 'C', 'I'];

const ROLE_COLORS = {
  R: { bg: 'var(--color-error-alpha, rgba(239,68,68,0.12))',   text: 'var(--color-error)' },
  A: { bg: 'var(--color-warning-alpha, rgba(234,179,8,0.12))', text: 'var(--color-warning)' },
  C: { bg: 'var(--color-accent-alpha, rgba(59,130,246,0.12))', text: 'var(--color-accent)' },
  I: { bg: 'var(--color-success-alpha, rgba(34,197,94,0.12))', text: 'var(--color-success)' },
};

export default {
  id: 'raci-matrix',
  phase: 'define',
  icon: 'users',
  i18nKey: 'modules.raci-matrix',
  version: '1.0.0',

  // ── Private state ──────────────────────────────────────────
  /** @private */ _context: null,
  /** @private */ _container: null,
  /** @private */ _data: null,
  /** @private */ _renderTimer: null,

  // ── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._context = context;
    this._container = container;
    this._data = { activities: [], stakeholders: [], assignments: {} };

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) this._importState(saved);

    this._render();
  },

  async destroy() {
    this._container.innerHTML = '';
    if (this._renderTimer) clearTimeout(this._renderTimer);
  },

  onLanguageChange() { this._render(); },
  onThemeChange() { /* CSS custom properties handle it */ },

  // ── Data hooks ─────────────────────────────────────────────

  getState() {
    return {
      activities: [...this._data.activities],
      stakeholders: [...this._data.stakeholders],
      assignments: { ...this._data.assignments },
    };
  },

  setState(data) { this._importState(data); this._render(); },
  /**
   * Load a catalog example. Editorial — no worksheet is provisioned.
   * @param { meta: object, data: object } payload
   */
  async loadExample(payload) {
    if (!payload || !payload.data) return;
    const t = (k) => this._context.i18n.t(k);

    const hasContent = (this._data?.activities?.length || 0) + (this._data?.stakeholders?.length || 0) > 0;
    if (hasContent && this._context?.confirmPopout) {
      const ok = await this._context.confirmPopout(t('moduleHelp.confirmOverwrite'), { danger: true });
      if (!ok) return;
    }

    this.setState(payload.data);
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());

    const lang = this._context.i18n.getLanguage();
    const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
    this._context.notify?.(t('moduleHelp.exampleLoaded').replace('{title}', title), 'success');
  },


  // ── Help ───────────────────────────────────────────────────
  help: () => import('./raci-matrix-help.js'),

  // ── Internal ───────────────────────────────────────────────

  /** @private */
  _importState(saved) {
    if (!saved) return;
    this._data.activities = Array.isArray(saved.activities) ? saved.activities : [];
    this._data.stakeholders = Array.isArray(saved.stakeholders) ? saved.stakeholders : [];
    this._data.assignments = (saved.assignments && typeof saved.assignments === 'object')
      ? saved.assignments : {};
  },

  /** @private */
  _save() {
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());
  },

  /** @private */
  _t(key, params) {
    return this._context.i18n.t(`modules.raci-matrix.${key}`, params);
  },

  /** @private */
  _esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  },

  /** @private */
  _escAttr(s) {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },

  /** @private */
  _key(aIdx, sIdx) {
    return `${aIdx}:${sIdx}`;
  },

  /** @private */
  _getRole(aIdx, sIdx) {
    return this._data.assignments[this._key(aIdx, sIdx)] || '';
  },

  /** @private */
  _setRole(aIdx, sIdx, role) {
    const k = this._key(aIdx, sIdx);
    if (role) {
      this._data.assignments[k] = role;
    } else {
      delete this._data.assignments[k];
    }
  },

  /** Cycle: '' → R → A → C → I → '' */
  /** @private */
  _cycleRole(aIdx, sIdx) {
    const current = this._getRole(aIdx, sIdx);
    const idx = ROLES.indexOf(current);
    const next = idx < 0 ? ROLES[0] : (idx + 1 >= ROLES.length ? '' : ROLES[idx + 1]);
    this._setRole(aIdx, sIdx, next);
    this._save();
    this._deferRender();
  },

  /** @private */
  _deferRender() {
    if (this._renderTimer) clearTimeout(this._renderTimer);
    this._renderTimer = setTimeout(() => { this._renderTimer = null; this._render(); }, 0);
  },

  // ── Validation helpers ─────────────────────────────────────

  /** @private — returns array of { activityIdx, issues[] } */
  _validate() {
    const warnings = [];
    this._data.activities.forEach((_, aIdx) => {
      const issues = [];
      const rolesInRow = {};
      this._data.stakeholders.forEach((_, sIdx) => {
        const r = this._getRole(aIdx, sIdx);
        if (r) {
          if (!rolesInRow[r]) rolesInRow[r] = 0;
          rolesInRow[r]++;
        }
      });
      if (!rolesInRow['R']) issues.push('noR');
      if (!rolesInRow['A']) issues.push('noA');
      if ((rolesInRow['A'] || 0) > 1) issues.push('multiA');
      if (issues.length) warnings.push({ aIdx, issues });
    });
    return warnings;
  },

  // ── Render ─────────────────────────────────────────────────

  /** @private */
  _render() {
    const t = (k, p) => this._t(k, p);
    const { activities, stakeholders } = this._data;
    const hasActivities = activities.length > 0;
    const hasStakeholders = stakeholders.length > 0;
    const warnings = (hasActivities && hasStakeholders) ? this._validate() : [];
    const warningMap = {};
    warnings.forEach(w => { warningMap[w.aIdx] = w.issues; });

    // ── Legend ──
    const legendHtml = ROLES.map(r =>
      `<span class="raci__legend-item" style="background:${ROLE_COLORS[r].bg};color:${ROLE_COLORS[r].text}">${r} = ${t('role' + r)}</span>`
    ).join('');

    // ── Table ──
    let tableHtml = '';
    if (hasActivities) {
      const sHeaders = stakeholders.map((s, sIdx) =>
        `<th class="raci__th-stakeholder">
          <span class="raci__th-text" title="${this._escAttr(s + ' — ' + t('renameHint'))}" data-rename="stakeholder" data-idx="${sIdx}">${this._esc(s)}</span>
          <button class="raci__del-btn" data-del="stakeholder" data-idx="${sIdx}" title="${t('removeStakeholder')}">&times;</button>
        </th>`
      ).join('');

      const rows = activities.map((a, aIdx) => {
        const issues = warningMap[aIdx];
        const rowCls = issues ? ' raci__row--warn' : '';
        const cells = stakeholders.map((_, sIdx) => {
          const role = this._getRole(aIdx, sIdx);
          const rc = role ? ROLE_COLORS[role] : null;
          const style = rc ? `background:${rc.bg};color:${rc.text}` : '';
          return `<td class="raci__cell" data-a="${aIdx}" data-s="${sIdx}" style="${style}">${role}</td>`;
        }).join('');
        const warnIcon = issues
          ? `<span class="raci__row-warn" title="${issues.map(i => t('warn_' + i)).join(', ')}">&#9888;</span>`
          : '';
        return `<tr class="${rowCls}" draggable="true" data-drag-a="${aIdx}">
          <td class="raci__activity-cell">
            <span class="raci__drag-handle" title="${t('dragHint')}">⠿</span>
            <span class="raci__activity-text" title="${this._escAttr(a + ' — ' + t('renameHint'))}" data-rename="activity" data-idx="${aIdx}">${this._esc(a)}</span>
            ${warnIcon}
            <button class="raci__del-btn" data-del="activity" data-idx="${aIdx}" title="${t('removeActivity')}">&times;</button>
          </td>
          ${cells}
        </tr>`;
      }).join('');

      const noStakeholderHint = !hasStakeholders
        ? `<p class="raci__hint">${t('addStakeholderHint')}</p>` : '';

      tableHtml = `
        <div class="raci__table-wrap">
          <table class="raci__table">
            <thead>
              <tr>
                <th class="raci__th-corner">${t('activity')} \\ ${t('stakeholder')}</th>
                ${sHeaders}
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        ${noStakeholderHint}`;
    } else {
      tableHtml = `<div class="raci__empty"></div>`;
    }

    // ── Full layout ──
    this._container.innerHTML = `
      <div class="module-container raci">
        <div class="module-container__header">
          <h2>${this._context.i18n.t('modules.raci-matrix.name')}</h2>
          <div class="raci__toolbar">
            <button class="btn btn--sm btn--ghost raci__export-csv-btn">${t('exportCSV')}</button>
          </div>
        </div>
        <div class="module-container__body">
          <div class="raci__legend">${legendHtml}</div>

          <div class="raci__add-bar">
            <div class="raci__add-group">
              <input class="field raci__add-input" data-add="activity" placeholder="${this._escAttr(t('activityPlaceholder'))}" maxlength="200">
              <button class="btn btn--sm btn--primary raci__add-btn" data-add-btn="activity">+ ${t('addActivity')}</button>
            </div>
            <div class="raci__add-group">
              <input class="field raci__add-input" data-add="stakeholder" placeholder="${this._escAttr(t('stakeholderPlaceholder'))}" maxlength="120">
              <button class="btn btn--sm btn--primary raci__add-btn" data-add-btn="stakeholder">+ ${t('addStakeholder')}</button>
            </div>
          </div>

          ${tableHtml}
        </div>
      </div>`;

    this._bindEvents();
  },

  /** @private */
  _bindEvents() {
    const el = this._container;

    // Add activity
    const addAct = (inputEl) => {
      const v = inputEl.value.trim();
      if (!v) return;
      this._data.activities.push(v);
      this._save();
      this._render();
      // Re-focus input
      this._container.querySelector('[data-add="activity"]')?.focus();
    };
    el.querySelector('[data-add="activity"]')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addAct(e.target);
    });
    el.querySelector('[data-add-btn="activity"]')?.addEventListener('click', () => {
      addAct(el.querySelector('[data-add="activity"]'));
    });

    // Add stakeholder
    const addSh = (inputEl) => {
      const v = inputEl.value.trim();
      if (!v) return;
      this._data.stakeholders.push(v);
      this._save();
      this._render();
      this._container.querySelector('[data-add="stakeholder"]')?.focus();
    };
    el.querySelector('[data-add="stakeholder"]')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addSh(e.target);
    });
    el.querySelector('[data-add-btn="stakeholder"]')?.addEventListener('click', () => {
      addSh(el.querySelector('[data-add="stakeholder"]'));
    });

    // Cell click → cycle role
    el.querySelectorAll('.raci__cell').forEach(cell => {
      cell.addEventListener('click', () => {
        this._cycleRole(+cell.dataset.a, +cell.dataset.s);
      });
    });

    // Delete buttons
    el.querySelectorAll('.raci__del-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const type = btn.dataset.del;
        const idx = +btn.dataset.idx;
        if (type === 'activity') this._removeActivity(idx);
        else this._removeStakeholder(idx);
      });
    });

    // Row drag & drop reorder
    let dragIdx = null;
    el.querySelectorAll('tr[data-drag-a]').forEach(row => {
      row.addEventListener('dragstart', (e) => {
        dragIdx = +row.dataset.dragA;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', ''); // required for Firefox
        row.classList.add('raci__row--dragging');
      });
      row.addEventListener('dragend', () => {
        row.classList.remove('raci__row--dragging');
        el.querySelectorAll('.raci__row--drop-before, .raci__row--drop-after').forEach(
          r => r.classList.remove('raci__row--drop-before', 'raci__row--drop-after')
        );
        dragIdx = null;
      });
      row.addEventListener('dragover', (e) => {
        if (dragIdx === null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = row.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        const before = e.clientY < mid;
        row.classList.toggle('raci__row--drop-before', before);
        row.classList.toggle('raci__row--drop-after', !before);
      });
      row.addEventListener('dragleave', () => {
        row.classList.remove('raci__row--drop-before', 'raci__row--drop-after');
      });
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.classList.remove('raci__row--drop-before', 'raci__row--drop-after');
        const targetIdx = +row.dataset.dragA;
        if (dragIdx === null || dragIdx === targetIdx) return;
        const rect = row.getBoundingClientRect();
        const before = e.clientY < rect.top + rect.height / 2;
        let toIdx = before ? targetIdx : targetIdx + 1;
        if (dragIdx < toIdx) toIdx--;
        this._moveActivity(dragIdx, toIdx);
        dragIdx = null;
      });
    });

    // Inline rename on double-click
    el.querySelectorAll('[data-rename]').forEach(span => {
      span.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this._startInlineRename(span, span.dataset.rename, +span.dataset.idx);
      });
    });

    // Export CSV
    el.querySelector('.raci__export-csv-btn')?.addEventListener('click', () => this._exportCSV());
  },

  // ── Actions ────────────────────────────────────────────────

  /** @private */
  _startInlineRename(span, type, idx) {
    const list = type === 'activity' ? this._data.activities : this._data.stakeholders;
    const oldValue = list[idx];
    const maxLen = type === 'activity' ? 200 : 120;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'field raci__rename-input';
    input.value = oldValue;
    input.maxLength = maxLen;

    span.replaceWith(input);
    input.focus();
    input.select();

    const commit = () => {
      const v = input.value.trim();
      if (v && v !== oldValue) {
        list[idx] = v;
        this._save();
      }
      this._render();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { input.value = oldValue; input.blur(); }
    });
    input.addEventListener('blur', commit, { once: true });
  },

  /** @private */
  _removeActivity(idx) {
    // Remove assignments for this activity and reindex
    const newAssign = {};
    Object.entries(this._data.assignments).forEach(([k, v]) => {
      const [a, s] = k.split(':').map(Number);
      if (a === idx) return;
      const newA = a > idx ? a - 1 : a;
      newAssign[`${newA}:${s}`] = v;
    });
    this._data.activities.splice(idx, 1);
    this._data.assignments = newAssign;
    this._save();
    this._render();
  },

  /** @private — move activity from index `from` to index `to`, reindex assignments */
  _moveActivity(from, to) {
    if (from === to) return;
    const acts = this._data.activities;
    const [item] = acts.splice(from, 1);
    acts.splice(to, 0, item);

    // Reindex all assignments
    const oldAssign = this._data.assignments;
    const newAssign = {};
    Object.entries(oldAssign).forEach(([k, v]) => {
      const [a, s] = k.split(':').map(Number);
      let newA = a;
      if (a === from) {
        newA = to;
      } else if (from < to) {
        if (a > from && a <= to) newA = a - 1;
      } else {
        if (a >= to && a < from) newA = a + 1;
      }
      newAssign[`${newA}:${s}`] = v;
    });
    this._data.assignments = newAssign;
    this._save();
    this._render();
  },

  /** @private */
  _removeStakeholder(idx) {
    const newAssign = {};
    Object.entries(this._data.assignments).forEach(([k, v]) => {
      const [a, s] = k.split(':').map(Number);
      if (s === idx) return;
      const newS = s > idx ? s - 1 : s;
      newAssign[`${a}:${newS}`] = v;
    });
    this._data.stakeholders.splice(idx, 1);
    this._data.assignments = newAssign;
    this._save();
    this._render();
  },

  /** @private */
  /** @private */
  _exportCSV() {
    const { activities, stakeholders } = this._data;
    if (!activities.length || !stakeholders.length) return;
    const sep = ';';
    const q = (s) => `"${s.replace(/"/g, '""')}"`;
    const header = [q(this._t('activity')), ...stakeholders.map(s => q(s))].join(sep);
    const rows = activities.map((a, aIdx) => {
      const cells = stakeholders.map((_, sIdx) => this._getRole(aIdx, sIdx) || '');
      return [q(a), ...cells.map(c => q(c))].join(sep);
    });
    const csv = [header, ...rows].join('\n');
    this._downloadFile(csv, 'raci-matrix.csv', 'text/csv;charset=utf-8');
    this._context.notify(this._t('exportedCSV'), 'success');
  },

  /** @private */
  _downloadFile(content, filename, type) {
    const blob = new Blob(['\uFEFF' + content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
};
