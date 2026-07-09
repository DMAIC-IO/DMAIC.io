/**
 * D.Mike — REST API Manager Module (rest-api.js)
 * Data phase: centrally manage REST API GET endpoints for data retrieval.
 * Each endpoint maps response fields to worksheet columns via column pickers.
 *
 * Migrated to createModule + Alpine CSP. The Model (rest-api-model.js) holds the
 * persisted endpoints + active id; transient UI state (loading flag, last
 * response, schedule timers, clock updater, column pickers) lives in the data-fn.
 * ColumnPickers are imperative widgets mounted per mapping row (analog msa-typ1).
 */

import { createModule } from '../../core/template-module.js';
import { State, Endpoint } from './rest-api-model.js';
import { ColumnPicker, refToKey } from '../../ui/column-picker.js';

const SCHEDULE_UNITS = ['minutes', 'hours'];

export default createModule({
  config: {
    id: 'rest-api',
    engine: 'alpine',
    phase: 'data',
    icon: 'cloud',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Transient view state (not persisted) ──────────────────
      loading: false,
      /** @type {{status:number,statusText:string,ok:boolean,body:string}|null} */
      lastResponse: null,
      scheduleUnits: SCHEDULE_UNITS,
      /** Reactive counter bumped whenever schedule timers change → forces
       *  Alpine to re-evaluate isScheduleRunning() / badge / dot / status. */
      _scheduleTick: 0,
      /** @type {Map<string, number>} endpoint id → setInterval id */
      _timers: null,
      /** @type {Map<string, number>} endpoint id → last scheduled run timestamp */
      _lastRunTimes: null,
      /** @type {number|null} clock display updater interval */
      _clockInterval: null,
      /** @type {Array<ColumnPicker>} */
      _pickers: null,

      // ── View transformations ──────────────────────────────────
      unitLabel: (u) => _t(`scheduleUnit_${  u}`),
      scheduleBadgeText(running) {
        return running ? this.t('scheduleActive') : this.t('scheduleInactive');
      },
      formatTime(ts) {
        return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      },

      /** True when a schedule timer is currently active for `ep`. */
      isScheduleRunning(ep) {
        // Reference the reactive tick so Alpine re-evaluates on timer changes.
        void this._scheduleTick;
        return Boolean(ep) && this._timers?.has(ep.id);
      },

      lastRunText(ep) {
        void this._scheduleTick;
        const last = this._lastRunTimes?.get(ep.id);
        return last ? this.formatTime(last) : this.t('scheduleNever');
      },
      nextRunText(ep) {
        void this._scheduleTick;
        if (!this._timers?.has(ep.id)) return '—';
        const last = this._lastRunTimes?.get(ep.id);
        const next = (last || Date.now()) + ep.scheduleToMs();
        return this.formatTime(next);
      },

      // ── Endpoint list actions ─────────────────────────────────
      addEndpoint() {
        const ep = new Endpoint();
        this.model.endpoints.push(ep);
        this.model.activeId = ep.id;
        this.lastResponse = null;
        this.$nextTick(() => this._mountPickers());
      },

      selectEndpoint(ep, event) {
        if (event?.target?.closest?.('.rest-api__item-del') ||
            event?.target?.closest?.('.rest-api__ep-name-input')) return;
        if (ep.id !== this.model.activeId) {
          this.model.activeId = ep.id;
          this.lastResponse = null;
          this.$nextTick(() => this._mountPickers());
        }
      },

      focusEndpoint(ep) {
        if (ep.id !== this.model.activeId) {
          this.model.activeId = ep.id;
          this.lastResponse = null;
          this.$nextTick(() => {
            this._mountPickers();
            const input = module._container.querySelector(
              `.rest-api__ep-name-input[data-name-id="${ep.id}"]`
            );
            input?.focus();
          });
        }
      },

      async deleteEndpoint(ep, event) {
        event?.stopPropagation?.();
        const confirmed = await module._context.confirmPopout(
          this.t('deleteConfirm', { name: ep.name || ep.url || this.t('unnamed') }),
          { danger: true }
        );
        if (!confirmed) return;
        this._stopSchedule(ep.id);
        const idx = this.model.endpoints.findIndex(e => e.id === ep.id);
        if (idx !== -1) this.model.endpoints.splice(idx, 1);
        if (this.model.activeId === ep.id) {
          this.model.activeId = this.model.endpoints[0]?.id || null;
          this.lastResponse = null;
        }
        this.$nextTick(() => this._mountPickers());
      },

      // ── Header actions ────────────────────────────────────────
      addHeader() {
        const ep = this.model.activeEndpoint();
        if (ep) ep.headers.push({ key: '', value: '' });
      },
      deleteHeader(i) {
        const ep = this.model.activeEndpoint();
        if (ep) ep.headers.splice(i, 1);
      },

      // ── Mapping actions ───────────────────────────────────────
      addMapping() {
        const ep = this.model.activeEndpoint();
        if (!ep) return;
        ep.mappings.push({ jsonPath: '', columnRef: null });
        this.$nextTick(() => this._mountPickers());
      },
      deleteMapping(i) {
        const ep = this.model.activeEndpoint();
        if (!ep) return;
        ep.mappings.splice(i, 1);
        this.$nextTick(() => this._mountPickers());
      },

      // ── Schedule actions ──────────────────────────────────────
      toggleSchedule(event) {
        const ep = this.model.activeEndpoint();
        if (!ep) return;
        ep.schedule.enabled = Boolean(event.target.checked);
        if (ep.schedule.enabled) {
          this._startSchedule(ep);
          module._context.notify(
            this.t('scheduleStarted', { name: ep.name || ep.url || this.t('unnamed') }), 'success'
          );
        } else {
          this._stopSchedule(ep.id);
          module._context.notify(
            this.t('scheduleStopped', { name: ep.name || ep.url || this.t('unnamed') }), 'info'
          );
        }
      },
      changeScheduleValue(event) {
        const ep = this.model.activeEndpoint();
        if (!ep) return;
        const val = Math.max(1, Math.min(999, parseInt(event.target.value, 10) || 1));
        event.target.value = val;
        ep.schedule.intervalValue = val;
        this._restartScheduleIfRunning(ep);
      },
      changeScheduleUnit(event) {
        const ep = this.model.activeEndpoint();
        if (!ep) return;
        ep.schedule.intervalUnit = event.target.value;
        this._restartScheduleIfRunning(ep);
      },

      // ── Request / Response ────────────────────────────────────
      async sendRequest() {
        const ep = this.model.activeEndpoint();
        if (!ep) return;
        if (!ep.url) {
          module._context.notify(this.t('errorNoUrl'), 'error');
          return;
        }
        this.loading = true;
        this.lastResponse = null;
        try {
          this.lastResponse = await this._fetch(ep);
        } catch (err) {
          this.lastResponse = { status: 0, statusText: 'Error', ok: false, body: err.message };
        }
        this.loading = false;
      },

      copyResponse() {
        if (!this.lastResponse) return;
        navigator.clipboard.writeText(this.lastResponse.body).then(() => {
          module._context.notify(this.t('copied'), 'success');
        });
      },

      /** Perform the GET request and return a normalized response object. */
      async _fetch(ep) {
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
          body = JSON.stringify(await res.json(), null, 2);
        } else {
          body = await res.text();
        }
        return { status: res.status, statusText: res.statusText, ok: res.ok, body };
      },

      // ── Schedule management ───────────────────────────────────
      _startSchedule(ep) {
        if (!ep.schedule?.enabled || !ep.url) return;
        if (this._timers.has(ep.id)) return;
        const timerId = setInterval(() => this._scheduledFetch(ep), ep.scheduleToMs());
        this._timers.set(ep.id, timerId);
        this._scheduleTick++;
      },
      _stopSchedule(epId) {
        const timerId = this._timers.get(epId);
        if (timerId != null) {
          clearInterval(timerId);
          this._timers.delete(epId);
          this._scheduleTick++;
        }
      },
      _restartScheduleIfRunning(ep) {
        if (this._timers.has(ep.id)) {
          this._stopSchedule(ep.id);
          this._startSchedule(ep);
        }
      },
      _startAllSchedules() {
        for (const ep of this.model.endpoints) this._startSchedule(ep);
      },
      _stopAllSchedules() {
        for (const timerId of this._timers.values()) clearInterval(timerId);
        this._timers.clear();
        this._scheduleTick++;
      },

      /** Silent scheduled fetch (no loading UI), updates response if active. */
      async _scheduledFetch(ep) {
        if (!ep.url) return;
        try {
          const result = await this._fetch(ep);
          this._lastRunTimes.set(ep.id, Date.now());
          if (ep.id === this.model.activeId) this.lastResponse = result;
        } catch (err) {
          this._lastRunTimes.set(ep.id, Date.now());
          if (ep.id === this.model.activeId) {
            this.lastResponse = { status: 0, statusText: 'Error', ok: false, body: err.message };
          }
        }
        this._scheduleTick++;
      },

      // ── Clock updater (refresh last/next run times) ───────────
      _startClockUpdater() {
        this._clockInterval = setInterval(() => { this._scheduleTick++; }, 30000);
      },
      _stopClockUpdater() {
        if (this._clockInterval != null) {
          clearInterval(this._clockInterval);
          this._clockInterval = null;
        }
      },

      // ── ColumnPickers (imperative widgets, per mapping row) ───
      _destroyPickers() {
        if (!this._pickers) return;
        for (const p of this._pickers) p.destroy?.();
        this._pickers = [];
      },
      _mountPickers() {
        this._destroyPickers();
        const ep = this.model.activeEndpoint();
        if (!ep) return;
        const wrappers = module._container.querySelectorAll('.rest-api__mapping-picker');
        for (const wrap of wrappers) {
          const i = Number(wrap.dataset.pickerIdx);
          const mapping = ep.mappings[i];
          if (!mapping) continue;
          try {
            const picker = new ColumnPicker(wrap, module._context, {
              mode: 'single',
              onChange: (ref) => {
                if (ref) {
                  const key = refToKey(ref);
                  if (ep.usedColumnKeys(i).has(key)) {
                    module._context.notify(this.t('columnAlreadyUsed'), 'warning');
                    picker.value = mapping.columnRef;
                    return;
                  }
                }
                mapping.columnRef = ref;
              },
            });
            if (mapping.columnRef) picker.value = mapping.columnRef;
            this._pickers.push(picker);
          } catch (err) {
            console.error('REST API: ColumnPicker init failed', err);
          }
        }
      },

      // ── Lifecycle (per Alpine component instance) ─────────────
      init() {
        this._timers = new Map();
        this._lastRunTimes = new Map();
        this._pickers = [];
        this.$nextTick(() => {
          this._mountPickers();
          this._startAllSchedules();
          this._startClockUpdater();
        });
      },
      destroy() {
        this._stopAllSchedules();
        this._stopClockUpdater();
        this._destroyPickers();
      },
    };
  },
});
