/**
 * D.Mike — REST API Manager Module (rest-api.js)
 * Data phase: centrally manage REST API GET endpoints for data retrieval.
 * Each endpoint maps response fields to worksheet columns via column pickers.
 *
 * Migrated to createModule + Alpine CSP. The Model (rest-api-model.js) holds the
 * persisted endpoints + active id; transient UI state (loading flag, last
 * response, schedule timers, clock updater, column pickers) lives in the data-fn.
 * ColumnPickers are imperative widgets mounted per mapping row (analog msa-typ1).
 *
 * @agent  Steuerbar über das Viewmodel: Endpunkte anlegen, wählen,
 *   umbenennen und entfernen (ohne Rückfrage), URL, Schreibmodus und
 *   Zeitplan setzen (setParam, setSchedule), Header und Mappings pflegen
 *   und abrufen (sendRequest). Die Mappings werden gespeichert, aber noch
 *   nicht angewendet (Roadmap). Die Zwischenablage bleibt der Oberfläche
 *   vorbehalten; gelesen wird über read() (AgentRead).
 */

import { createModule } from '../../core/template-module.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import {
  requireEnum, requireIndex, requireKnownId, requireNumber, requireText,
} from '../../core/agent/agent-argcheck.js';
import { pickableColumnList } from '../../core/agent/agent-options.js';
import { State, Endpoint, SCHEDULE_UNITS, WRITE_MODES } from './rest-api-model.js';
import { ColumnPicker, refToKey, keyToRef } from '../../ui/column-picker.js';

const PARAM_KEYS = ['url', 'writeMode', 'schedule.intervalValue', 'schedule.intervalUnit'];
const BOOL_VALUES = [true, false];
const PARAM_CHECKS = {
  url: (v) => requireText('value', v),
  writeMode: (v) => { requireEnum('value', v, WRITE_MODES); return v; },
  'schedule.intervalValue': (v) => requireNumber('value', v, { min: 1, max: 999, integer: true }),
  'schedule.intervalUnit': (v) => { requireEnum('value', v, SCHEDULE_UNITS); return v; },
};

/**
 * Einen Wert unter einem Punkt-Schlüssel (`'csvOptions.delimiter'`) in `obj` ablegen.
 * @param {object} obj Wurzel, deren Pfad beschrieben wird
 * @param {string} key Schlüssel, gegebenenfalls mit Punkt
 * @param {any} value der abzulegende Wert
 */
function setAtPath(obj, key, value) {
  const parts = key.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
  cur[parts[parts.length - 1]] = value;
}

/**
 * Gelesen wird die persistierte Endpunktliste und die letzte Antwort des
 * aktiven Endpunkts. Die Mappings werden gespeichert, aber heute nirgends
 * angewendet (Roadmap) — die Lesefläche zeigt sie, wie die Oberfläche.
 *
 * @typedef {object} AgentRead
 * @property {Array<{ id: string, name: string, url: string, headers: Array<{ key: string, value: string }>, mappings: Array<{ jsonPath: string, columnRef: object|null }>, writeMode: string, schedule: { enabled: boolean, intervalValue: number, intervalUnit: string } }>} endpoints  all endpoints
 * @property {string|null} activeId  the endpoint the detail actions edit
 * @property {string[]} activeParams  the keys `setParam` accepts; [] without active endpoint
 * @property {boolean} scheduleRunning  a timer runs for the active endpoint
 * @property {Array<{ key: string, name: string }>} pickableColumns  the columns `setMapping` accepts
 * @property {boolean} loading  a request is running
 * @property {{ status: number, statusText: string, ok: boolean, body: string }|null} lastResponse  the last response of the active endpoint
 */

export default createModule({
  config: {
    id: 'rest-api',
    engine: 'alpine',
    phase: 'data',
    icon: 'module.rest-api',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Transient view state (not persisted) ──────────────────
      loading: false,
      scheduleUnits: SCHEDULE_UNITS,
      /** @type {{status:number,statusText:string,ok:boolean,body:string}|null} */
      lastResponse: null,
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
      /** @noagent view transform */
      unitLabel: (u) => _t(`scheduleUnit_${  u}`),
      /** @noagent view transform */
      scheduleBadgeText(running) {
        return running ? this.t('scheduleActive') : this.t('scheduleInactive');
      },
      /** @noagent view transform */
      formatTime(ts) {
        return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      },

      /** @noagent view transform; true when a schedule timer is currently active for `ep`. */
      isScheduleRunning(ep) {
        // Reference the reactive tick so Alpine re-evaluates on timer changes.
        void this._scheduleTick;
        return Boolean(ep) && this._timers?.has(ep.id);
      },

      /** @noagent view transform */
      lastRunText(ep) {
        void this._scheduleTick;
        const last = this._lastRunTimes?.get(ep.id);
        return last ? this.formatTime(last) : this.t('scheduleNever');
      },
      /** @noagent view transform */
      nextRunText(ep) {
        void this._scheduleTick;
        if (!this._timers?.has(ep.id)) return '—';
        const last = this._lastRunTimes?.get(ep.id);
        const next = (last || Date.now()) + ep.scheduleToMs();
        return this.formatTime(next);
      },

      /** @noagent view transform */
      writeModeLabel: (wm) => _t(`mode${wm.charAt(0).toUpperCase()}${wm.slice(1)}`),
      /** @noagent view transform; die Schreibmodi aus WRITE_MODES */
      writeModes() { return WRITE_MODES; },

      // ── Agent surface ─────────────────────────────────────────

      /**
       * Den vollständigen Lesezustand dieser Instanz liefern.
       * @agent
       * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
       * @returns {AgentRead} Endpunkte, aktiver Endpunkt, wählbare Mengen und letzte Antwort
       */
      read(options) {
        return readAgentState('rest-api', {
          endpoints: this.model.endpoints.map(ep => ep.toJSON()),
          activeId: this.model.activeId,
          activeParams: this.activeParams(),
          scheduleRunning: this.isScheduleRunning(this.model.activeEndpoint()),
          pickableColumns: this.pickableColumns(),
          loading: this.loading,
          lastResponse: this.lastResponse,
        }, options);
      },
      /** @noagent derived set; der Agent liest sie über read().activeParams */
      activeParams() {
        return this.model.activeEndpoint() ? PARAM_KEYS : [];
      },
      /** @noagent derived set; der Agent liest sie über read().pickableColumns */
      pickableColumns() {
        // Der Mapping-Wähler hat keine Typbeschränkung.
        return pickableColumnList(module._context.stateManager, {});
      },
      /** Der aktive Endpunkt, oder ein Wurf mit dem Weg dorthin. */
      _requireActive() {
        const ep = this.model.activeEndpoint();
        if (!ep) throw new Error('no active endpoint; allowed: call addEndpoint() or selectEndpoint() first');
        return ep;
      },

      /**
       * Einen neuen Endpunkt anlegen und aktiv setzen.
       * @agent
       * @returns {string} die id des neuen Endpunkts
       */
      addEndpoint() {
        const ep = new Endpoint();
        this.model.endpoints.push(ep);
        this.model.activeId = ep.id;
        this.lastResponse = null;
        this.$nextTick(() => this._mountPickers());
        return ep.id;
      },
      /**
       * Einen Endpunkt aktiv setzen; die Detailaktionen bearbeiten ihn.
       * @agent
       * @param {string} endpointId eine id aus `endpoints`
       * @returns {void}
       * @throws {Error} wenn es keinen Endpunkt mit dieser id gibt
       */
      selectEndpoint(endpointId) {
        requireKnownId('endpointId', endpointId, this.model.endpoints.map(e => e.id));
        if (endpointId === this.model.activeId) return;
        this.model.activeId = endpointId;
        this.lastResponse = null;
        this.$nextTick(() => this._mountPickers());
      },
      /**
       * Einen Endpunkt umbenennen.
       * @agent
       * @param {string} endpointId eine id aus `endpoints`
       * @param {string} name der neue Name; "" löscht ihn
       * @returns {void}
       * @throws {Error} wenn es keinen Endpunkt mit dieser id gibt oder `name` kein Text ist
       */
      renameEndpoint(endpointId, name) {
        requireKnownId('endpointId', endpointId, this.model.endpoints.map(e => e.id));
        this.model.endpoints.find(e => e.id === endpointId).name = requireText('name', name);
      },
      /**
       * Einen Endpunkt entfernen, ohne Rückfrage; sein Zeitplan wird gestoppt.
       * @agent
       * @param {string} endpointId eine id aus `endpoints`
       * @returns {void}
       * @throws {Error} wenn es keinen Endpunkt mit dieser id gibt
       */
      removeEndpoint(endpointId) {
        requireKnownId('endpointId', endpointId, this.model.endpoints.map(e => e.id));
        this._stopSchedule(endpointId);
        this.model.endpoints = this.model.endpoints.filter(e => e.id !== endpointId);
        if (this.model.activeId === endpointId) {
          this.model.activeId = this.model.endpoints[0]?.id || null;
          this.lastResponse = null;
        }
        this.$nextTick(() => this._mountPickers());
      },
      /**
       * URL, Schreibmodus oder Zeitplan des aktiven Endpunkts setzen.
       * @agent
       * @param {'url'|'writeMode'|'schedule.intervalValue'|'schedule.intervalUnit'} key welcher Wert; `activeParams` nennt die gültigen
       * @param {string|number} value Text für `url`; `replace`, `append` oder `prepend` für `writeMode`; ganze Zahl von 1 bis 999 für `schedule.intervalValue`; `minutes` oder `hours` für `schedule.intervalUnit`
       * @returns {void}
       * @throws {Error} wenn es keinen aktiven Endpunkt gibt, `key` unbekannt ist oder `value` nicht passt
       */
      setParam(key, value) {
        requireEnum('key', key, PARAM_KEYS);
        requireEnum('key', key, this.activeParams());
        const ep = this.model.activeEndpoint();
        setAtPath(ep, key, PARAM_CHECKS[key](value));
        if (key.startsWith('schedule.')) this._restartScheduleIfRunning(ep);
      },
      /**
       * Eine leere Kopfzeile an den aktiven Endpunkt hängen.
       * @agent
       * @returns {number} der Index der neuen Kopfzeile
       * @throws {Error} wenn es keinen aktiven Endpunkt gibt
       */
      addHeader() {
        const ep = this._requireActive();
        ep.headers.push({ key: '', value: '' });
        return ep.headers.length - 1;
      },
      /**
       * Name und Wert einer Kopfzeile des aktiven Endpunkts setzen.
       * @agent
       * @param {number} index Index in `endpoints[].headers`
       * @param {string} key der Name der Kopfzeile
       * @param {string} value der Wert der Kopfzeile
       * @returns {void}
       * @throws {Error} wenn es keinen aktiven Endpunkt gibt oder `index` keine Kopfzeile ist
       */
      setHeader(index, key, value) {
        const ep = this._requireActive();
        requireIndex('index', index, ep.headers.length - 1);
        ep.headers[index] = { key: requireText('key', key), value: requireText('value', value) };
      },
      /**
       * Eine Kopfzeile des aktiven Endpunkts löschen.
       * @agent
       * @param {number} index Index in `endpoints[].headers`
       * @returns {void}
       * @throws {Error} wenn es keinen aktiven Endpunkt gibt oder `index` keine Kopfzeile ist
       */
      deleteHeader(index) {
        const ep = this._requireActive();
        requireIndex('index', index, ep.headers.length - 1);
        ep.headers.splice(index, 1);
      },
      /**
       * Ein leeres Mapping an den aktiven Endpunkt hängen. Mappings werden
       * gespeichert, aber noch nicht angewendet.
       * @agent
       * @returns {number} der Index des neuen Mappings
       * @throws {Error} wenn es keinen aktiven Endpunkt gibt
       */
      addMapping() {
        const ep = this._requireActive();
        ep.mappings.push({ jsonPath: '', columnRef: null });
        this.$nextTick(() => this._mountPickers());
        return ep.mappings.length - 1;
      },
      /**
       * Pfad und Zielspalte eines Mappings des aktiven Endpunkts setzen.
       * @agent
       * @param {number} index Index in `endpoints[].mappings`
       * @param {string} jsonPath der Pfad in der JSON-Antwort; "" löscht ihn
       * @param {object|null} ref eine Spalte aus `pickableColumns` als `{ instanceId, sheetId, columnId }`; null löst die Zuordnung
       * @returns {void}
       * @throws {Error} wenn es keinen aktiven Endpunkt gibt, `index` kein Mapping ist, die Spalte unbekannt ist oder schon von einem anderen Mapping dieses Endpunkts belegt wird
       */
      setMapping(index, jsonPath, ref) {
        const ep = this._requireActive();
        requireIndex('index', index, ep.mappings.length - 1);
        requireText('jsonPath', jsonPath);
        let clean = null;
        if (ref != null) {
          requireKnownId('ref', refToKey(ref), this.pickableColumns().map(c => c.key));
          if (ep.usedColumnKeys(index).has(refToKey(ref))) {
            throw new Error(`column ${refToKey(ref)} is already mapped; allowed: a column no other mapping of this endpoint uses`);
          }
          clean = keyToRef(refToKey(ref));
        }
        ep.mappings[index] = { jsonPath, columnRef: clean };
        this.$nextTick(() => this._mountPickers());
      },
      /**
       * Ein Mapping des aktiven Endpunkts löschen.
       * @agent
       * @param {number} index Index in `endpoints[].mappings`
       * @returns {void}
       * @throws {Error} wenn es keinen aktiven Endpunkt gibt oder `index` kein Mapping ist
       */
      deleteMapping(index) {
        const ep = this._requireActive();
        requireIndex('index', index, ep.mappings.length - 1);
        ep.mappings.splice(index, 1);
        this.$nextTick(() => this._mountPickers());
      },
      /**
       * Den Zeitplan des aktiven Endpunkts ein- oder ausschalten.
       * @agent
       * @param {boolean} enabled true startet die regelmäßigen Abrufe (nur mit gesetzter URL), false stoppt sie
       * @returns {void}
       * @throws {Error} wenn es keinen aktiven Endpunkt gibt oder `enabled` kein Wahrheitswert ist
       */
      setSchedule(enabled) {
        requireEnum('enabled', enabled, BOOL_VALUES);
        const ep = this._requireActive();
        ep.schedule.enabled = enabled;
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

      // ── DOM handlers (UI only) ────────────────────────────────

      /** @noagent DOM event handler (click); the agent uses selectEndpoint() */
      onEndpointClick(ep, event) {
        if (event?.target?.closest?.('.rest-api__item-del') ||
            event?.target?.closest?.('.rest-api__ep-name-input')) return;
        this.selectEndpoint(ep.id);
      },

      /** @noagent DOM event handler (focus); the agent uses selectEndpoint() */
      focusEndpoint(ep) {
        const wasActive = ep.id === this.model.activeId;
        this.selectEndpoint(ep.id);
        if (wasActive) return;
        this.$nextTick(() => {
          const input = module._container.querySelector(
            `.rest-api__ep-name-input[data-name-id="${ep.id}"]`
          );
          input?.focus();
        });
      },

      /**
       * @noagent fragt vor dem Löschen zurück; ein Agent darf keine Rückfrage
       * auslösen. Delegiert an `removeEndpoint`.
       */
      async deleteEndpoint(ep, event) {
        event?.stopPropagation?.();
        const confirmed = await module._context.dialog.confirm({
          message: this.t('deleteConfirm', { name: ep.name || ep.url || this.t('unnamed') }),
          danger: true,
        });
        if (!confirmed) return;
        if (this.model.endpoints.some(e => e.id === ep.id)) this.removeEndpoint(ep.id);
      },

      /** @noagent DOM event handler (input); the agent uses setMapping() */
      onMappingPath(i, event) {
        const ep = this.model.activeEndpoint();
        this.setMapping(i, event.target.value, ep.mappings[i].columnRef);
      },

      /** @noagent DOM event handler (change); the agent uses setSchedule() */
      toggleSchedule(event) {
        this.setSchedule(Boolean(event.target.checked));
      },
      /** @noagent DOM event handler (change); the agent uses setParam('schedule.intervalValue', …) */
      changeScheduleValue(event) {
        const val = Math.max(1, Math.min(999, parseInt(event.target.value, 10) || 1));
        event.target.value = val;
        this.setParam('schedule.intervalValue', val);
      },
      /** @noagent DOM event handler (change); the agent uses setParam('schedule.intervalUnit', …) */
      changeScheduleUnit(event) {
        this.setParam('schedule.intervalUnit', event.target.value);
      },

      // ── Request / Response ────────────────────────────────────
      /**
       * Führt eine GET-Anfrage an die URL des aktiven Endpunkts aus und wartet
       * auf die Antwort. Ein Netzfehler wird zur Antwort mit Status 0.
       * @agent
       * @returns {Promise<{ status: number, statusText: string, ok: boolean, body: string }|null>} die Antwort (auch `lastResponse` in read()), oder null ohne aktiven Endpunkt oder ohne URL
       */
      async sendRequest() {
        const ep = this.model.activeEndpoint();
        if (!ep) return null;
        if (!ep.url) {
          module._context.notify(this.t('errorNoUrl'), 'error');
          return null;
        }
        this.loading = true;
        this.lastResponse = null;
        try {
          this.lastResponse = await this._fetch(ep);
        } catch (err) {
          this.lastResponse = { status: 0, statusText: 'Error', ok: false, body: err.message };
        }
        this.loading = false;
        return this.lastResponse;
      },

      /** @noagent clipboard */
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
                try {
                  this.setMapping(i, ep.mappings[i].jsonPath, ref);
                } catch {
                  module._context.notify(this.t('columnAlreadyUsed'), 'warning');
                  picker.value = ep.mappings[i].columnRef;
                }
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
      /** @noagent lifecycle */
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
      /** @noagent lifecycle */
      destroy() {
        this._stopAllSchedules();
        this._stopClockUpdater();
        this._destroyPickers();
      },
    };
  },
});
