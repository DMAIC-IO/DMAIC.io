/**
 * D.Mike — Stakeholder Analysis Module (stakeholder-analysis.js)
 * Define phase: identify, assess, and plan communication with stakeholders
 * using the Power/Interest matrix.
 *
 * Spec: docs/modules/STAKEHOLDER-ANALYSIS.md
 */

const AVATAR_COLORS = [
  '#3b82f6', '#22c55e', '#ef4444', '#eab308', '#f97316',
  '#a855f7', '#06b6d4', '#ec4899', '#14b8a6', '#6366f1',
];

const QUAD_ORDER = ['manage-closely', 'keep-satisfied', 'keep-informed', 'monitor'];

export default {
  id: 'stakeholder-analysis',
  phase: 'define',
  icon: 'users',
  i18nKey: 'modules.stakeholder-analysis',
  version: '0.1.0',

  /** @type {object} */
  _context: null,
  /** @type {HTMLElement} */
  _container: null,
  /** @type {Array<object>} */
  _stakeholders: [],

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) {
      this._stakeholders = saved.stakeholders ?? [];
    }

    this._render();
  },

  async destroy() {
    this._container.innerHTML = '';
  },

  onLanguageChange(_lang) {
    this._render();
  },

  onThemeChange(_theme) {
    // CSS custom properties handle theme changes
  },

  // ─── Data hooks ─────────────────────────────────────────────

  getState() {
    return {
      stakeholders: this._stakeholders,
    };
  },

  setState(data) {
    this._stakeholders = data.stakeholders ?? [];
    this._render();
  },

  // ─── Help ───────────────────────────────────────────────────

  help: () => import('./stakeholder-analysis-help.js'),

  // ─── Rendering ──────────────────────────────────────────────

  _render() {
    const t = (key, params) => this._context.i18n.t(`modules.stakeholder-analysis.${key}`, params);

    this._container.innerHTML = `
      <div class="module-container sha">
       <div class="dmike-split" style="flex:1;min-height:0">
        <!-- Sidebar -->
        <div class="sha__sidebar dmike-split__input">
          <div class="sha__sidebar-header">
            <span class="sha__sidebar-title">${t('name')}</span>
            <div class="sha__sidebar-header-right">
              <span class="sha__counter">${this._stakeholders.length}</span>
              <button class="sha__add-btn" type="button" title="${t('addStakeholder')}">+</button>
            </div>
          </div>
          <div class="sha__sidebar-body" data-ref="shList">
            ${this._stakeholders.length === 0 ? this._emptyListHtml(t) : this._stakeholders.map(sh => this._cardHtml(sh, t)).join('')}
          </div>
        </div>

        <!-- Main -->
        <div class="sha__main dmike-split__output">
          <div class="sha__sections">
            <div class="dmike-split__output-section">${t('tabMatrix')}</div>
            <div class="sha__section-body">${this._matrixHtml(t)}</div>
            <div class="dmike-split__output-section">${t('tabSummary')}</div>
            <div class="sha__section-body">${this._summaryHtml(t)}</div>
            <div class="dmike-split__output-section">${t('tabComm')}</div>
            <div class="sha__section-body">${this._commHtml(t)}</div>
          </div>
        </div>
       </div>
      </div>
    `;

    this._bindEvents(t);
  },

  // ─── Card HTML ────────────────────────────────────────────

  _cardHtml(sh, t) {
    const q = this._getQuadrant(sh.power, sh.interest);
    const col = this._avatarColor(sh.name);
    const supPct = sh.support === 'supporter' ? 100 : sh.support === 'neutral' ? 50 : 20;
    const supCol = sh.support === 'supporter' ? 'var(--color-success)'
                 : sh.support === 'neutral'   ? 'var(--color-warning)'
                 : 'var(--color-error)';
    const stratBg = this._strategyBg(q);
    const stratCol = this._strategyColor(q);

    return `
      <div class="sha__card" data-id="${sh.id}">
        <div class="sha__card-top">
          <div class="sha__avatar" style="background:${col}">${this._initials(sh.name)}</div>
          <div class="sha__card-info">
            <div class="sha__card-name">${this._esc(sh.name)}</div>
            <div class="sha__card-role">${this._esc(sh.role || '\u2014')}</div>
          </div>
          <div class="sha__card-actions">
            <button class="btn btn--icon-sm sha__card-action-btn sha__edit-btn" title="${t('editStakeholder')}" data-id="${sh.id}">&#9998;</button>
            <button class="btn btn--icon-sm sha__card-action-btn sha__card-action-btn--del sha__del-btn" title="${this._context.i18n.t('common.delete')}" data-id="${sh.id}">&#128465;</button>
          </div>
        </div>
        <div class="sha__meters">
          <div>
            <span class="sha__meter-label">${t('fieldPower')}</span>
            <div class="sha__meter-bar"><div class="sha__meter-fill" style="width:${sh.power * 20}%;background:var(--color-accent)"></div></div>
          </div>
          <div>
            <span class="sha__meter-label">${t('fieldInterest')}</span>
            <div class="sha__meter-bar"><div class="sha__meter-fill" style="width:${sh.interest * 20}%;background:var(--color-info)"></div></div>
          </div>
          <div>
            <span class="sha__meter-label">${t('fieldSupport')}</span>
            <div class="sha__meter-bar"><div class="sha__meter-fill" style="width:${supPct}%;background:${supCol}"></div></div>
          </div>
        </div>
        <div class="sha__strategy" style="background:${stratBg};color:${stratCol}">
          ${t('quad' + this._quadKey(q))}
        </div>
      </div>
    `;
  },

  _emptyListHtml(t) {
    return `
      <div class="sha__empty">
        <div class="sha__empty-icon">&#128101;</div>
        <div class="sha__empty-title">${t('noStakeholders')}</div>
        <p class="sha__empty-text">${t('noStakeholdersHint')}</p>
      </div>
    `;
  },

  // ─── Matrix HTML ──────────────────────────────────────────

  _matrixHtml(t) {
    const quads = {
      'keep-satisfied': [],
      'manage-closely': [],
      'monitor': [],
      'keep-informed': [],
    };
    this._stakeholders.forEach(sh => {
      quads[this._getQuadrant(sh.power, sh.interest)].push(sh);
    });

    const cellHtml = (quad, descKey) => {
      const chips = quads[quad].map(sh => {
        const col = this._avatarColor(sh.name);
        return `<span class="sha__chip"><span class="sha__chip-dot" style="background:${col}"></span>${this._esc(sh.name)}</span>`;
      }).join('');
      return `
        <div class="sha__matrix-cell" data-quad="${quad}">
          <div class="sha__cell-label">${t('quad' + this._quadKey(quad))}</div>
          <div class="sha__cell-desc">${t('quad' + this._quadKey(quad) + 'Desc')}</div>
          <div class="sha__cell-chips">${chips}</div>
        </div>
      `;
    };

    return `
      <div class="sha__matrix-container">
        <div class="sha__matrix-wrapper">
          <div class="sha__matrix-ylabel">${t('axisPower')} &rarr;</div>
          <div class="sha__axis-labels" style="margin-bottom:6px">
            <span>${t('axisLow')}</span>
            <span>${t('axisInterest')} &rarr;</span>
            <span>${t('axisHigh')}</span>
          </div>
          <div class="sha__matrix-grid">
            ${cellHtml('keep-satisfied')}
            ${cellHtml('manage-closely')}
            ${cellHtml('monitor')}
            ${cellHtml('keep-informed')}
          </div>
          <div class="sha__axis-labels" style="margin-top:8px">
            <span>${t('axisLow')}</span>
            <span></span>
            <span>${t('axisHigh')}</span>
          </div>
        </div>
      </div>
    `;
  },

  // ─── Summary HTML ─────────────────────────────────────────

  _summaryHtml(t) {
    if (this._stakeholders.length === 0) {
      return `<div class="sha__empty"><p class="sha__empty-text">${t('noStakeholders')}</p></div>`;
    }

    const dots = (level) => {
      let html = '';
      for (let i = 1; i <= 5; i++) {
        html += `<div class="sha__level-dot${i <= level ? ' sha__level-dot--filled' : ''}"></div>`;
      }
      return html;
    };

    const sorted = [...this._stakeholders].sort((a, b) =>
      QUAD_ORDER.indexOf(this._getQuadrant(a.power, a.interest)) -
      QUAD_ORDER.indexOf(this._getQuadrant(b.power, b.interest))
    );

    const rows = sorted.map(sh => {
      const q = this._getQuadrant(sh.power, sh.interest);
      const stratCol = this._strategyColor(q);
      return `
        <tr>
          <td><strong>${this._esc(sh.name)}</strong></td>
          <td>${this._esc(sh.role || '\u2014')}</td>
          <td><div class="sha__level-dots">${dots(sh.power)}</div></td>
          <td><div class="sha__level-dots">${dots(sh.interest)}</div></td>
          <td><span class="sha__support-badge sha__support-badge--${sh.support}">${t('support' + sh.support.charAt(0).toUpperCase() + sh.support.slice(1))}</span></td>
          <td style="color:${stratCol};font-weight:600;font-size:var(--font-size-xs)">${t('quad' + this._quadKey(q))}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="sha__summary-container">
        <table class="dmike-table">
          <thead>
            <tr>
              <th>${t('fieldName')}</th>
              <th>${t('fieldRole')}</th>
              <th>${t('fieldPower')}</th>
              <th>${t('fieldInterest')}</th>
              <th>${t('fieldSupport')}</th>
              <th>Quadrant</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  },

  // ─── Communication Plan HTML ──────────────────────────────

  _commHtml(t) {
    if (this._stakeholders.length === 0) {
      return `<div class="sha__empty"><p class="sha__empty-text">${t('noStakeholders')}</p></div>`;
    }

    const plans = {
      'manage-closely': { freq: 'commWeekly',    channel: 'commPersonal',    content: 'commContentDetailed', action: 'commActionEngage' },
      'keep-satisfied': { freq: 'commBiweekly',  channel: 'commEmail',       content: 'commContentSummary',  action: 'commActionInform' },
      'keep-informed':  { freq: 'commMonthly',   channel: 'commNewsletter',  content: 'commContentProgress', action: 'commActionFeedback' },
      'monitor':        { freq: 'commQuarterly', channel: 'commIntranet',   content: 'commContentGeneral',  action: 'commActionObserve' },
    };

    const sorted = [...this._stakeholders].sort((a, b) =>
      QUAD_ORDER.indexOf(this._getQuadrant(a.power, a.interest)) -
      QUAD_ORDER.indexOf(this._getQuadrant(b.power, b.interest))
    );

    const cards = sorted.map(sh => {
      const q = this._getQuadrant(sh.power, sh.interest);
      const plan = plans[q];
      const col = this._avatarColor(sh.name);
      const stratCol = this._strategyColor(q);
      const catKey = 'category' + sh.category.charAt(0).toUpperCase() + sh.category.slice(1);

      return `
        <div class="sha__comm-card">
          <div class="sha__comm-header">
            <div class="sha__avatar" style="background:${col};width:28px;height:28px;font-size:0.65rem">${this._initials(sh.name)}</div>
            <div>
              <div class="sha__comm-name">${this._esc(sh.name)}</div>
              <div class="sha__comm-quad" style="color:${stratCol}">${t('quad' + this._quadKey(q))} &middot; ${t(catKey)}</div>
            </div>
          </div>
          <div class="sha__comm-details">
            <div class="sha__comm-detail">
              <div class="sha__comm-detail-label">${t('commFrequency')}</div>
              <div class="sha__comm-detail-value">${t(plan.freq)}</div>
            </div>
            <div class="sha__comm-detail">
              <div class="sha__comm-detail-label">${t('commChannel')}</div>
              <div class="sha__comm-detail-value">${t(plan.channel)}</div>
            </div>
            <div class="sha__comm-detail">
              <div class="sha__comm-detail-label">${t('commContent')}</div>
              <div class="sha__comm-detail-value">${t(plan.content)}</div>
            </div>
            <div class="sha__comm-detail">
              <div class="sha__comm-detail-label">${t('commAction')}</div>
              <div class="sha__comm-detail-value">${t(plan.action)}</div>
            </div>
            ${sh.notes ? `
            <div class="sha__comm-detail" style="grid-column:1/-1">
              <div class="sha__comm-detail-label">${t('notesLabel')}</div>
              <div class="sha__comm-detail-value">${this._esc(sh.notes)}</div>
            </div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    return `<div class="sha__comm-container">${cards}</div>`;
  },

  // ─── Event binding ────────────────────────────────────────

  _bindEvents(t) {
    const el = this._container;

    // Add stakeholder
    el.querySelector('.sha__add-btn')?.addEventListener('click', () => {
      this._openModal(null, t);
    });

    // Edit / Delete
    el.querySelectorAll('.sha__edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sh = this._stakeholders.find(s => s.id === btn.dataset.id);
        if (sh) this._openModal(sh, t);
      });
    });

    el.querySelectorAll('.sha__del-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const sh = this._stakeholders.find(s => s.id === btn.dataset.id);
        if (!sh) return;
        const confirmed = await this._context.confirmPopout(
          t('deleteConfirm', { name: sh.name }),
          { danger: true }
        );
        if (!confirmed) return;
        this._stakeholders = this._stakeholders.filter(s => s.id !== sh.id);
        this._save();
        this._render();
      });
    });
  },

  // ─── Popout Form ──────────────────────────────────────────

  _openModal(existing, t) {
    const isEdit = !!existing;
    const sh = existing || {
      name: '', role: '', power: 3, interest: 3,
      support: 'neutral', category: 'intern', notes: '',
    };

    const formHtml = `
      <div>
        <div class="sha__form-row">
          <div class="sha__form-group">
            <label>${t('fieldName')} *</label>
            <input type="text" class="field" data-field="name" value="${this._esc(sh.name)}" maxlength="100" placeholder="${t('fieldName')}">
          </div>
          <div class="sha__form-group">
            <label>${t('fieldRole')}</label>
            <input type="text" class="field" data-field="role" value="${this._esc(sh.role)}" maxlength="200" placeholder="${t('fieldRole')}">
          </div>
        </div>

        <div class="sha__slider-group">
          <div class="sha__slider-header">
            <label>${t('fieldPower')}</label>
            <span class="sha__slider-value" data-ref="vPower">${sh.power}</span>
          </div>
          <input type="range" class="dmike-slider" min="1" max="5" value="${sh.power}" data-field="power">
        </div>

        <div class="sha__slider-group">
          <div class="sha__slider-header">
            <label>${t('fieldInterest')}</label>
            <span class="sha__slider-value" data-ref="vInterest">${sh.interest}</span>
          </div>
          <input type="range" class="dmike-slider" min="1" max="5" value="${sh.interest}" data-field="interest">
        </div>

        <div class="sha__form-row">
          <div class="sha__form-group">
            <label>${t('fieldSupport')}</label>
            <select class="field" data-field="support">
              <option value="supporter"${sh.support === 'supporter' ? ' selected' : ''}>${t('supportSupporter')}</option>
              <option value="neutral"${sh.support === 'neutral' ? ' selected' : ''}>${t('supportNeutral')}</option>
              <option value="critic"${sh.support === 'critic' ? ' selected' : ''}>${t('supportCritic')}</option>
            </select>
          </div>
          <div class="sha__form-group">
            <label>${t('fieldCategory')}</label>
            <select class="field" data-field="category">
              <option value="intern"${sh.category === 'intern' ? ' selected' : ''}>${t('categoryIntern')}</option>
              <option value="extern"${sh.category === 'extern' ? ' selected' : ''}>${t('categoryExtern')}</option>
              <option value="kunde"${sh.category === 'kunde' ? ' selected' : ''}>${t('categoryCustomer')}</option>
              <option value="lieferant"${sh.category === 'lieferant' ? ' selected' : ''}>${t('categorySupplier')}</option>
              <option value="behoerde"${sh.category === 'behoerde' ? ' selected' : ''}>${t('categoryAuthority')}</option>
            </select>
          </div>
        </div>

        <div class="sha__form-group">
          <label>${t('notesLabel')}</label>
          <textarea class="field" data-field="notes" maxlength="500" placeholder="${t('notesPlaceholder')}">${this._esc(sh.notes)}</textarea>
        </div>
      </div>
    `;

    return new Promise((resolve) => {
      // ── Build popout overlay (reuses dmike-chart-popout CSS) ──
      const overlay = document.createElement('div');
      overlay.className = 'dmike-chart-popout-overlay';

      const win = document.createElement('div');
      win.className = 'dmike-chart-popout';
      win.style.width = '520px';
      win.style.height = 'auto';
      win.style.maxHeight = '80vh';
      win.style.left = 'calc(50% - 260px)';
      win.style.top = '60px';

      const titleBar = document.createElement('div');
      titleBar.className = 'dmike-chart-popout-titlebar';
      const titleText = document.createElement('span');
      titleText.textContent = isEdit ? t('editStakeholder') : t('addStakeholder');
      const closeBtn = document.createElement('button');
      closeBtn.className = 'dmike-chart-popout-close';
      closeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>';
      titleBar.append(titleText, closeBtn);

      const body = document.createElement('div');
      body.className = 'dmike-chart-popout-body sha__popout-body';

      const formArea = document.createElement('div');
      formArea.className = 'sha__popout-form';
      formArea.innerHTML = formHtml;

      const footer = document.createElement('div');
      footer.className = 'sha__popout-footer';
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn btn--secondary';
      cancelBtn.textContent = this._context.i18n.t('common.cancel');
      const saveBtn = document.createElement('button');
      saveBtn.className = 'btn btn--primary';
      saveBtn.textContent = this._context.i18n.t('common.save');
      footer.append(cancelBtn, saveBtn);

      body.append(formArea, footer);
      win.append(titleBar, body);
      overlay.appendChild(win);
      document.body.appendChild(overlay);

      // ── Drag title bar ──
      let dragX = 0, dragY = 0, isDragging = false;
      const onDragStart = (e) => {
        if (closeBtn.contains(e.target)) return;
        isDragging = true;
        dragX = e.clientX - win.offsetLeft;
        dragY = e.clientY - win.offsetTop;
        win.style.transition = 'none';
      };
      const onDragMove = (e) => {
        if (!isDragging) return;
        win.style.left = (e.clientX - dragX) + 'px';
        win.style.top = (e.clientY - dragY) + 'px';
      };
      const onDragEnd = () => { isDragging = false; win.style.transition = ''; };
      titleBar.addEventListener('mousedown', onDragStart);
      window.addEventListener('mousemove', onDragMove);
      window.addEventListener('mouseup', onDragEnd);

      const close = (result) => {
        window.removeEventListener('mousemove', onDragMove);
        window.removeEventListener('mouseup', onDragEnd);
        window.removeEventListener('keydown', onKeyDown);
        overlay.remove();
        resolve(result);
      };
      const onKeyDown = (e) => { if (e.key === 'Escape') close(false); };
      window.addEventListener('keydown', onKeyDown);
      closeBtn.addEventListener('click', () => close(false));
      cancelBtn.addEventListener('click', () => close(false));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });

      // ── Wire up sliders + initial focus ──
      const powerSlider = formArea.querySelector('[data-field="power"]');
      const interestSlider = formArea.querySelector('[data-field="interest"]');
      powerSlider?.addEventListener('input', () => {
        formArea.querySelector('[data-ref="vPower"]').textContent = powerSlider.value;
      });
      interestSlider?.addEventListener('input', () => {
        formArea.querySelector('[data-ref="vInterest"]').textContent = interestSlider.value;
      });
      formArea.querySelector('[data-field="name"]')?.focus();

      // ── Save ──
      saveBtn.addEventListener('click', () => {
        const nameField = formArea.querySelector('[data-field="name"]');
        const name = nameField.value.trim();
        if (!name) {
          nameField.focus();
          return;
        }
        const data = {
          id: existing?.id || crypto.randomUUID(),
          name,
          role: formArea.querySelector('[data-field="role"]').value.trim(),
          power: parseInt(formArea.querySelector('[data-field="power"]').value, 10),
          interest: parseInt(formArea.querySelector('[data-field="interest"]').value, 10),
          support: formArea.querySelector('[data-field="support"]').value,
          category: formArea.querySelector('[data-field="category"]').value,
          notes: formArea.querySelector('[data-field="notes"]').value.trim(),
        };
        if (existing) {
          const idx = this._stakeholders.findIndex(s => s.id === existing.id);
          if (idx !== -1) this._stakeholders[idx] = data;
        } else {
          this._stakeholders.push(data);
        }
        this._save();
        this._render();
        close(true);
      });
    });
  },

  // ─── Persistence ──────────────────────────────────────────

  _save() {
    this._context.stateManager.setModuleState(
      this._context.instanceId,
      this.getState()
    );
  },

  // ─── Quadrant logic ───────────────────────────────────────

  _getQuadrant(power, interest) {
    const highP = power >= 4;
    const highI = interest >= 4;
    if (highP && highI) return 'manage-closely';
    if (highP && !highI) return 'keep-satisfied';
    if (!highP && highI) return 'keep-informed';
    return 'monitor';
  },

  /** Convert quadrant id to PascalCase key suffix */
  _quadKey(q) {
    return q.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  },

  _strategyColor(q) {
    return {
      'manage-closely': 'var(--color-error)',
      'keep-satisfied': 'var(--color-warning)',
      'keep-informed': 'var(--color-accent)',
      'monitor': 'var(--color-success)',
    }[q];
  },

  _strategyBg(q) {
    return {
      'manage-closely': 'rgba(239, 68, 68, 0.1)',
      'keep-satisfied': 'rgba(234, 179, 8, 0.1)',
      'keep-informed': 'rgba(59, 130, 246, 0.1)',
      'monitor': 'rgba(34, 197, 94, 0.1)',
    }[q];
  },

  // ─── Helpers ──────────────────────────────────────────────

  _avatarColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  },

  _initials(name) {
    return name.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
  },

  _esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },
};
