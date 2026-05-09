/**
 * D.Mike — REST API Manager Module (rest-api.js)
 * Data phase: centrally manage REST API GET endpoints for data retrieval.
 * Each endpoint maps response fields to worksheet columns via column pickers.
 */

import { ColumnPicker, refToKey } from '../../ui/column-picker.js';
import { esc, escAttr } from '../../core/html-utils.js';

/* ── Helpers ── */

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ── Constants ── */
const SCHEDULE_UNITS = ['minutes', 'hours'];

/* ── Icons ── */
const ICONS = {
  play: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
  plus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  trash: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>',
  copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  clock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
};

export default {
  id: 'rest-api',
  phase: 'data',
  icon: 'cloud',
  i18nKey: 'modules.rest-api',
  version: '1.0.0',
  help: () => import('./rest-api-help.js'),

  _context: null,
  _container: null,
  /** @type {Array<{id:string, name:string, url:string, headers:Array<{key:string,value:string}>, mappings:Array<{jsonPath:string, columnRef:object|null}>}>} */
  _endpoints: [],
  /** @type {string|null} */
  _activeId: null,
  /** @type {object|null} */
  _lastResponse: null,
  /** @type {boolean} */
  _loading: false,
  /** @type {Array<ColumnPicker>} */
  _pickers: [],
  /** @type {Map<string, number>} endpoint id → setInterval id */
  _timers: new Map(),
  /** @type {Map<string, number>} endpoint id → timestamp of last scheduled run */
  _lastRunTimes: new Map(),
  /** @type {number|null} interval id for the clock display updater */
  _clockInterval: null,

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) {
      this._endpoints = saved.endpoints ?? [];
      this._activeId = saved.activeId ?? null;
    }
    // Ensure fields exist on legacy data
    for (const ep of this._endpoints) {
      if (!ep.mappings) ep.mappings = [];
      if (!ep.writeMode) ep.writeMode = 'replace';
      if (!ep.schedule) ep.schedule = { enabled: false, intervalValue: 5, intervalUnit: 'minutes' };
      if (ep.schedule.intervalMinutes != null && ep.schedule.intervalValue == null) {
        ep.schedule.intervalValue = ep.schedule.intervalMinutes;
        ep.schedule.intervalUnit = 'minutes';
        delete ep.schedule.intervalMinutes;
      }
    }

    this._render();
    this._startAllSchedules();
    this._startClockUpdater();
  },

  async destroy() {
    this._stopAllSchedules();
    this._stopClockUpdater();
    this._destroyPickers();
    this._container.innerHTML = '';
  },

  onLanguageChange() { this._render(); },
  onThemeChange() { /* CSS handles it */ },

  // ─── Data hooks ─────────────────────────────────────────────

  getState() {
    return {
      endpoints: this._endpoints,
      activeId: this._activeId,
    };
  },

  setState(data) {
    this._stopAllSchedules();
    this._endpoints = data.endpoints ?? [];
    this._activeId = data.activeId ?? null;
    this._lastResponse = null;
    for (const ep of this._endpoints) {
      if (!ep.mappings) ep.mappings = [];
      if (!ep.writeMode) ep.writeMode = 'replace';
      if (!ep.schedule) ep.schedule = { enabled: false, intervalValue: 5, intervalUnit: 'minutes' };
      if (ep.schedule.intervalMinutes != null && ep.schedule.intervalValue == null) {
        ep.schedule.intervalValue = ep.schedule.intervalMinutes;
        ep.schedule.intervalUnit = 'minutes';
        delete ep.schedule.intervalMinutes;
      }
    }
    this._render();
    this._startAllSchedules();
  },

  // ─── Render ─────────────────────────────────────────────────

  _t(key, params) {
    return this._context.i18n.t(`modules.rest-api.${key}`, params);
  },

  _destroyPickers() {
    for (const p of this._pickers) p.destroy?.();
    this._pickers = [];
  },

  _render() {
    this._destroyPickers();
    const t = (k, p) => this._t(k, p);
    const active = this._endpoints.find(e => e.id === this._activeId) || null;

    this._container.innerHTML = `
      <div class="module-container rest-api">
        <div class="dmike-split">
          <!-- Left: endpoint list -->
          <div class="rest-api__sidebar dmike-split__input">
            <div class="rest-api__sidebar-header">
              <span class="rest-api__sidebar-title">${t('name')}</span>
              <span class="rest-api__count">${this._endpoints.length}</span>
              <button class="rest-api__add-btn" type="button" title="${t('addEndpoint')}">${ICONS.plus}</button>
            </div>
            <div class="rest-api__list">
              ${this._endpoints.map(ep => this._renderListItem(ep, t)).join('')}
            </div>
          </div>

          <!-- Right: endpoint detail / response -->
          <div class="rest-api__detail dmike-split__output">
            ${active ? this._renderDetail(active, t) : ''}
          </div>
        </div>
      </div>
    `;

    this._bindEvents(t);
    if (active) this._initMappingPickers(active);
  },

  _renderListItem(ep, t) {
    const isActive = ep.id === this._activeId;
    const hasSchedule = this._timers.has(ep.id);
    return `
      <div class="rest-api__list-item${isActive ? ' rest-api__list-item--active' : ''}" data-id="${ep.id}">
        ${hasSchedule ? `<span class="rest-api__schedule-dot" title="${t('scheduleActive')}"></span>` : ''}
        <input class="rest-api__ep-name-input" data-name-id="${ep.id}"
          value="${escAttr(ep.name)}" placeholder="${escAttr(t('namePlaceholder'))}">
        <button class="rest-api__item-del" data-del="${ep.id}" title="${t('delete')}">${ICONS.trash}</button>
      </div>
    `;
  },

  _renderDetail(ep, t) {
    const headersHtml = (ep.headers || []).map((h, i) => `
      <div class="rest-api__header-row" data-idx="${i}">
        <input class="field rest-api__header-key" value="${escAttr(h.key)}" placeholder="Key">
        <input class="field rest-api__header-val" value="${escAttr(h.value)}" placeholder="Value">
        <button class="rest-api__header-del" data-hdr-del="${i}" title="${t('delete')}">&times;</button>
      </div>
    `).join('');

    const mappingsHtml = (ep.mappings || []).map((m, i) => `
      <div class="rest-api__mapping-row" data-midx="${i}">
        <input class="field rest-api__mapping-path" value="${escAttr(m.jsonPath)}"
          placeholder="${escAttr(t('jsonPathPlaceholder'))}">
        <span class="rest-api__mapping-arrow">&rarr;</span>
        <div class="rest-api__mapping-picker" data-picker-idx="${i}"></div>
        <button class="rest-api__mapping-del" data-map-del="${i}" title="${t('delete')}">&times;</button>
      </div>
    `).join('');

    return `
      <div class="rest-api__detail-inner">
        <!-- URL bar -->
        <div class="rest-api__url-bar">
          <span class="rest-api__method-label">GET</span>
          <input class="field rest-api__url-input" data-field="url"
            value="${escAttr(ep.url)}" placeholder="https://api.example.com/data">
          <button class="rest-api__send-btn dmike-btn-run" data-action="send">
            ${ICONS.play} ${t('send')}
          </button>
        </div>

        <!-- Headers -->
        <div class="rest-api__section">
          <div class="rest-api__section-header">
            <span class="rest-api__section-label">${t('headers')}</span>
            <button class="rest-api__add-header-btn" type="button">${ICONS.plus} ${t('addHeader')}</button>
          </div>
          <div class="rest-api__headers-list" data-ref="headers">
            ${headersHtml}
          </div>
        </div>

        <!-- Column Mappings -->
        <div class="rest-api__section">
          <div class="rest-api__section-header">
            <span class="rest-api__section-label">${t('columnMappings')}</span>
            <button class="rest-api__add-mapping-btn" type="button">${ICONS.plus} ${t('addMapping')}</button>
          </div>
          <div class="rest-api__write-mode">
            <label class="rest-api__write-mode-option">
              <input type="radio" name="writeMode-${ep.id}" value="replace" ${ep.writeMode === 'replace' ? 'checked' : ''}>
              ${t('modeReplace')}
            </label>
            <label class="rest-api__write-mode-option">
              <input type="radio" name="writeMode-${ep.id}" value="append" ${ep.writeMode === 'append' ? 'checked' : ''}>
              ${t('modeAppend')}
            </label>
            <label class="rest-api__write-mode-option">
              <input type="radio" name="writeMode-${ep.id}" value="prepend" ${ep.writeMode === 'prepend' ? 'checked' : ''}>
              ${t('modePrepend')}
            </label>
          </div>
          <div class="rest-api__mappings-list" data-ref="mappings">
            ${mappingsHtml}
          </div>
        </div>

        <!-- Schedule -->
        ${this._renderScheduleSection(ep, t)}

        <!-- Response -->
        <div class="rest-api__section">
          <div class="rest-api__section-header">
            <span class="rest-api__section-label">${t('response')}</span>
            ${this._lastResponse ? `
              <span class="rest-api__status rest-api__status--${this._lastResponse.ok ? 'ok' : 'err'}">
                ${this._lastResponse.status} ${esc(this._lastResponse.statusText)}
              </span>
              <button class="rest-api__copy-btn" data-action="copy-response" title="${t('copyResponse')}">${ICONS.copy}</button>
            ` : ''}
          </div>
          <div class="rest-api__response" data-ref="response">
            ${this._loading ? `<div class="rest-api__loading">${t('loading')}</div>` : ''}
            ${this._lastResponse && !this._loading ? `<pre class="rest-api__response-body">${esc(this._lastResponse.body)}</pre>` : ''}
          </div>
        </div>
      </div>
    `;
  },

  // ─── Column Pickers for Mappings ────────────────────────────

  /** Collect refKeys already assigned in other mappings (not at index `excludeIdx`). */
  _usedColumnKeys(ep, excludeIdx) {
    const keys = new Set();
    for (let j = 0; j < ep.mappings.length; j++) {
      if (j === excludeIdx) continue;
      const ref = ep.mappings[j].columnRef;
      if (ref) keys.add(refToKey(ref));
    }
    return keys;
  },

  _initMappingPickers(ep) {
    const wrappers = this._container.querySelectorAll('.rest-api__mapping-picker');
    for (const wrap of wrappers) {
      const i = Number(wrap.dataset.pickerIdx);
      const mapping = ep.mappings[i];
      if (!mapping) continue;

      try {
        const picker = new ColumnPicker(wrap, this._context, {
          mode: 'single',
          onChange: (ref) => {
            if (ref) {
              const key = refToKey(ref);
              const used = this._usedColumnKeys(ep, i);
              if (used.has(key)) {
                this._context.notify(this._t('columnAlreadyUsed'), 'warning');
                // Reset to previous value
                picker.value = mapping.columnRef;
                return;
              }
            }
            mapping.columnRef = ref;
            this._save();
          },
        });

        // Restore saved selection
        if (mapping.columnRef) {
          picker.value = mapping.columnRef;
        }

        this._pickers.push(picker);
      } catch (err) {
        console.error('REST API: ColumnPicker init failed', err);
      }
    }
  },

  // ─── Schedule rendering ─────────────────────────────────────

  _renderScheduleSection(ep, t) {
    const sched = ep.schedule || { enabled: false, intervalValue: 5, intervalUnit: 'minutes' };
    const isRunning = this._timers.has(ep.id);
    const lastRun = this._lastRunTimes.get(ep.id);
    const intervalMs = this._scheduleToMs(sched);
    const nextRun = isRunning ? (lastRun || Date.now()) + intervalMs : null;

    const unitOpts = SCHEDULE_UNITS.map(u =>
      `<option value="${u}" ${sched.intervalUnit === u ? 'selected' : ''}>${t('scheduleUnit_' + u)}</option>`
    ).join('');

    return `
      <div class="rest-api__section rest-api__schedule">
        <div class="rest-api__section-header">
          <span class="rest-api__section-label">${ICONS.clock} ${t('schedule')}</span>
          <span class="rest-api__schedule-badge rest-api__schedule-badge--${isRunning ? 'on' : 'off'}">
            ${isRunning ? t('scheduleActive') : t('scheduleInactive')}
          </span>
        </div>
        <div class="rest-api__schedule-controls">
          <label class="rest-api__schedule-toggle">
            <input type="checkbox" data-action="schedule-toggle" ${sched.enabled ? 'checked' : ''}>
            <span>${t('scheduleEnabled')}</span>
          </label>
          <div class="rest-api__schedule-interval-group">
            <span class="rest-api__schedule-interval-label">${t('scheduleInterval')}:</span>
            <input type="number" class="field rest-api__schedule-interval-value"
              data-action="schedule-value" min="1" max="999"
              value="${sched.intervalValue || 5}" ${!sched.enabled ? 'disabled' : ''}>
            <select class="field rest-api__schedule-interval-unit"
              data-action="schedule-unit" ${!sched.enabled ? 'disabled' : ''}>
              ${unitOpts}
            </select>
          </div>
        </div>
        ${isRunning ? `
          <div class="rest-api__schedule-status">
            <span class="rest-api__schedule-status-item">
              ${t('scheduleLastRun')}: <strong data-ref="schedule-last">${lastRun ? this._formatTime(lastRun) : t('scheduleNever')}</strong>
            </span>
            <span class="rest-api__schedule-status-item">
              ${t('scheduleNextRun')}: <strong data-ref="schedule-next">${nextRun ? this._formatTime(nextRun) : '—'}</strong>
            </span>
          </div>
        ` : ''}
      </div>
    `;
  },

  /** Convert schedule config to milliseconds. */
  _scheduleToMs(sched) {
    const val = sched.intervalValue || 5;
    return sched.intervalUnit === 'hours' ? val * 3600000 : val * 60000;
  },

  /** Format timestamp as HH:MM:SS */
  _formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  },

  // ─── Schedule management ───────────────────────────────────

  /** Start schedule timer for a single endpoint (if enabled + has URL). */
  _startSchedule(ep) {
    if (!ep.schedule?.enabled || !ep.url) return;
    if (this._timers.has(ep.id)) return; // already running

    const ms = this._scheduleToMs(ep.schedule);
    const timerId = setInterval(() => this._scheduledFetch(ep), ms);
    this._timers.set(ep.id, timerId);
  },

  /** Stop schedule timer for a single endpoint. */
  _stopSchedule(epId) {
    const timerId = this._timers.get(epId);
    if (timerId != null) {
      clearInterval(timerId);
      this._timers.delete(epId);
    }
  },

  /** Start all enabled schedules (called on init / setState). */
  _startAllSchedules() {
    for (const ep of this._endpoints) {
      this._startSchedule(ep);
    }
  },

  /** Restart a schedule timer if it is currently running. */
  _restartScheduleIfRunning(ep) {
    if (this._timers.has(ep.id)) {
      this._stopSchedule(ep.id);
      this._startSchedule(ep);
    }
  },

  /** Stop all schedule timers (called on destroy / setState). */
  _stopAllSchedules() {
    for (const [id, timerId] of this._timers) {
      clearInterval(timerId);
    }
    this._timers.clear();
  },

  /** Execute a scheduled fetch — same as _sendRequest but silent (no loading UI). */
  async _scheduledFetch(ep) {
    if (!ep.url) return;
    try {
      const opts = { method: 'GET' };
      if (ep.headers.length > 0) {
        const h = {};
        for (const { key, value } of ep.headers) {
          if (key.trim()) h[key.trim()] = value;
        }
        opts.headers = h;
      }

      const res = await fetch(ep.url, opts);
      let body;
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('json')) {
        const json = await res.json();
        body = JSON.stringify(json, null, 2);
      } else {
        body = await res.text();
      }

      this._lastRunTimes.set(ep.id, Date.now());

      // If this is the active endpoint, update the response display
      if (ep.id === this._activeId) {
        this._lastResponse = {
          status: res.status,
          statusText: res.statusText,
          ok: res.ok,
          body,
        };
        this._render();
      }
    } catch (err) {
      this._lastRunTimes.set(ep.id, Date.now());
      if (ep.id === this._activeId) {
        this._lastResponse = {
          status: 0,
          statusText: 'Error',
          ok: false,
          body: err.message,
        };
        this._render();
      }
    }
  },

  /** Update the clock display every 30s without full re-render. */
  _startClockUpdater() {
    this._clockInterval = setInterval(() => {
      this._updateScheduleDisplay();
    }, 30000);
  },

  _stopClockUpdater() {
    if (this._clockInterval != null) {
      clearInterval(this._clockInterval);
      this._clockInterval = null;
    }
  },

  /** Update last/next run times in the DOM without re-render. */
  _updateScheduleDisplay() {
    const active = this._endpoints.find(e => e.id === this._activeId);
    if (!active || !this._timers.has(active.id)) return;

    const lastEl = this._container.querySelector('[data-ref="schedule-last"]');
    const nextEl = this._container.querySelector('[data-ref="schedule-next"]');
    const lastRun = this._lastRunTimes.get(active.id);
    const ms = this._scheduleToMs(active.schedule);
    const nextRun = lastRun ? lastRun + ms : Date.now() + ms;

    if (lastEl) lastEl.textContent = lastRun ? this._formatTime(lastRun) : this._t('scheduleNever');
    if (nextEl) nextEl.textContent = this._formatTime(nextRun);
  },

  // ─── Events ─────────────────────────────────────────────────

  _bindEvents(t) {
    const el = this._container;

    // Add endpoint
    el.querySelector('.rest-api__add-btn')?.addEventListener('click', () => {
      const ep = {
        id: uid(),
        name: '',
        url: '',
        headers: [],
        mappings: [],
        writeMode: 'replace',
        schedule: { enabled: false, intervalValue: 5, intervalUnit: 'minutes' },
      };
      this._endpoints.push(ep);
      this._activeId = ep.id;
      this._lastResponse = null;
      this._save();
      this._render();
    });

    // Select endpoint
    el.querySelectorAll('.rest-api__list-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.rest-api__item-del') || e.target.closest('.rest-api__ep-name-input')) return;
        const id = item.dataset.id;
        if (id !== this._activeId) {
          this._activeId = id;
          this._lastResponse = null;
          this._save();
          this._render();
        }
      });
    });

    // Inline name editing
    el.querySelectorAll('.rest-api__ep-name-input').forEach(input => {
      const id = input.dataset.nameId;
      const ep = this._endpoints.find(e => e.id === id);
      if (!ep) return;
      input.addEventListener('input', () => {
        ep.name = input.value;
        this._save();
      });
      // Click on input should also select this endpoint
      input.addEventListener('focus', () => {
        if (id !== this._activeId) {
          this._activeId = id;
          this._lastResponse = null;
          this._save();
          this._render();
          // Re-focus the input after re-render
          const newInput = this._container.querySelector(`.rest-api__ep-name-input[data-name-id="${id}"]`);
          if (newInput) newInput.focus();
        }
      });
    });

    // Delete endpoint
    el.querySelectorAll('.rest-api__item-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.del;
        const ep = this._endpoints.find(e => e.id === id);
        if (!ep) return;
        const confirmed = await this._context.confirmPopout(
          this._t('deleteConfirm', { name: ep.name || ep.url || this._t('unnamed') }),
          { danger: true }
        );
        if (!confirmed) return;
        this._stopSchedule(id);
        this._endpoints = this._endpoints.filter(e => e.id !== id);
        if (this._activeId === id) {
          this._activeId = this._endpoints[0]?.id || null;
          this._lastResponse = null;
        }
        this._save();
        this._render();
      });
    });

    // Detail field changes
    const active = this._endpoints.find(e => e.id === this._activeId);
    if (!active) return;

    el.querySelectorAll('[data-field]').forEach(input => {
      const field = input.dataset.field;
      input.addEventListener('input', () => {
        active[field] = input.value;
        this._save();
      });
    });

    // Header changes
    el.querySelectorAll('.rest-api__header-row').forEach(row => {
      const idx = Number(row.dataset.idx);
      row.querySelector('.rest-api__header-key')?.addEventListener('input', (e) => {
        if (active.headers[idx]) active.headers[idx].key = e.target.value;
        this._save();
      });
      row.querySelector('.rest-api__header-val')?.addEventListener('input', (e) => {
        if (active.headers[idx]) active.headers[idx].value = e.target.value;
        this._save();
      });
    });

    // Delete header
    el.querySelectorAll('.rest-api__header-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.hdrDel);
        active.headers.splice(idx, 1);
        this._save();
        this._render();
      });
    });

    // Add header
    el.querySelector('.rest-api__add-header-btn')?.addEventListener('click', () => {
      active.headers.push({ key: '', value: '' });
      this._save();
      this._render();
    });

    // Mapping: JSON path changes
    el.querySelectorAll('.rest-api__mapping-path').forEach(input => {
      const idx = Number(input.closest('.rest-api__mapping-row').dataset.midx);
      input.addEventListener('input', () => {
        if (active.mappings[idx]) active.mappings[idx].jsonPath = input.value;
        this._save();
      });
    });

    // Delete mapping
    el.querySelectorAll('.rest-api__mapping-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.mapDel);
        active.mappings.splice(idx, 1);
        this._save();
        this._render();
      });
    });

    // Add mapping
    el.querySelector('.rest-api__add-mapping-btn')?.addEventListener('click', () => {
      active.mappings.push({ jsonPath: '', columnRef: null });
      this._save();
      this._render();
    });

    // Write mode
    el.querySelectorAll(`input[name="writeMode-${active.id}"]`).forEach(radio => {
      radio.addEventListener('change', () => {
        active.writeMode = radio.value;
        this._save();
      });
    });

    // Schedule toggle
    el.querySelector('[data-action="schedule-toggle"]')?.addEventListener('change', (e) => {
      active.schedule.enabled = e.target.checked;
      if (active.schedule.enabled) {
        this._startSchedule(active);
        this._context.notify(this._t('scheduleStarted', { name: active.name || active.url || this._t('unnamed') }), 'success');
      } else {
        this._stopSchedule(active.id);
        this._context.notify(this._t('scheduleStopped', { name: active.name || active.url || this._t('unnamed') }), 'info');
      }
      this._save();
      this._render();
    });

    // Schedule interval value change
    el.querySelector('[data-action="schedule-value"]')?.addEventListener('change', (e) => {
      const val = Math.max(1, Math.min(999, parseInt(e.target.value, 10) || 1));
      e.target.value = val;
      active.schedule.intervalValue = val;
      this._restartScheduleIfRunning(active);
      this._save();
      this._render();
    });

    // Schedule interval unit change
    el.querySelector('[data-action="schedule-unit"]')?.addEventListener('change', (e) => {
      active.schedule.intervalUnit = e.target.value;
      this._restartScheduleIfRunning(active);
      this._save();
      this._render();
    });

    // Send request
    el.querySelector('[data-action="send"]')?.addEventListener('click', () => {
      this._sendRequest(active);
    });

    // Copy response
    el.querySelector('[data-action="copy-response"]')?.addEventListener('click', () => {
      if (this._lastResponse) {
        navigator.clipboard.writeText(this._lastResponse.body).then(() => {
          this._context.notify(this._t('copied'), 'success');
        });
      }
    });
  },

  // ─── Fetch ──────────────────────────────────────────────────

  async _sendRequest(ep) {
    if (!ep.url) {
      this._context.notify(this._t('errorNoUrl'), 'error');
      return;
    }

    this._loading = true;
    this._lastResponse = null;
    this._render();

    try {
      const opts = { method: 'GET' };

      if (ep.headers.length > 0) {
        const h = {};
        for (const { key, value } of ep.headers) {
          if (key.trim()) h[key.trim()] = value;
        }
        opts.headers = h;
      }

      const res = await fetch(ep.url, opts);
      let body;
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('json')) {
        const json = await res.json();
        body = JSON.stringify(json, null, 2);
      } else {
        body = await res.text();
      }

      this._lastResponse = {
        status: res.status,
        statusText: res.statusText,
        ok: res.ok,
        body,
      };
    } catch (err) {
      this._lastResponse = {
        status: 0,
        statusText: 'Error',
        ok: false,
        body: err.message,
      };
    }

    this._loading = false;
    this._render();
  },

  // ─── Persistence ────────────────────────────────────────────

  _save() {
    this._context.stateManager.setModuleState(
      this._context.instanceId,
      this.getState()
    );
  },
};
