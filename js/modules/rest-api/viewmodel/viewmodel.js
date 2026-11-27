/**
 * D.Mike — REST API: Viewmodel.
 *
 * Endpunkte, Kopfzeilen, Zuordnungen und Zeitplan liegen im Model
 * (domain/model.js); Name, URL, Header-Name und JSON-Pfad binden `x-model`,
 * Header-Wert, Spalte, Abstand und Einheit `x-field`, der Schreibmodus
 * `x-set`, Anlegen, Auswählen und Löschen laufen über `x-command`.
 *
 * Der Lauf `sendRequest` ruft einen Endpunkt ab (abbrechbar, ein Abruf zur
 * Zeit); die Antwort ist sein Rückgabewert und bleibt je Endpunkt flüchtig im
 * UI-State. Die Zeitgeber der Zeitpläne liegen in der Closure des
 * `view`-Blocks: ein Abgleich mit `scheduleEntries` startet, stoppt und
 * startet sie neu, ein Tick startet den Lauf und fällt aus, solange einer
 * läuft. Wechsel des Schalters melden „Zeitplan gestartet/gestoppt“.
 */
import { createModule } from '../../../core/template-module.js';
import { asyncTask } from '../../../core/async-task.js';
import { idOf } from '../../../core/model.js';
import descriptor from '../module.js';
import { State } from '../domain/model.js';
import { fetchEndpoint } from '../io/fetch.js';
import { scheduleEntries, diffSchedules, toggledSchedules, endpointLabel, nextRunAt } from '../domain/schedule.js';
import { UiState } from './state.js';
import { formatTime, statusText, missingSecretNames } from './present.js';

/** Abstand der Uhr, die „Letzter/Nächster Abruf“ auffrischt. */
const CLOCK_MS = 30_000;

/** @typedef {import('../domain/model.types.js').StateFields['endpoints'][number]} Endpoint */

export default createModule({
  descriptor,
  Model: State,
  State: UiState,
  history: true,
  asyncTasks: {
    sendRequest: asyncTask({
      params: { endpointId: idOf('endpoints') },
      async run({ endpointId }, { signal }) {
        // Stand vor dem ersten await: URL und Kopfzeilen des Endpunkts.
        const ep = this.model.endpoints.find((/** @type {Endpoint} */ e) => e.id === endpointId);
        if (!ep.url) throw new Error(this.t('errorNoUrl'));
        const request = { url: ep.url, headers: ep.headers.map((/** @type {{ key: string, value: string }} */ h) => ({ key: h.key, value: h.value })) };
        this.state.runningId = endpointId;
        this.state.responses = this.state.responses.filter((r) => r.endpointId !== endpointId);
        try {
          const response = await fetchEndpoint(request, { signal });
          signal.throwIfAborted();
          if (this.model.endpoints.some((/** @type {Endpoint} */ e) => e.id === endpointId)) {
            this.state.responses = [...this.state.responses, { endpointId, ...response }];
          }
          return response;
        } finally {
          // Ein abgebrochener Lauf räumt nur ab, wenn kein neuer läuft.
          if (!signal.aborted || !this.asyncTasks.sendRequest.running) this.state.runningId = null;
        }
      },
    }),
  },
  /** @type {import('./state.types.js').RestApiViewFn} */
  view(ctx) {
    /** @type {Map<string, { ms: number, handle: ReturnType<typeof setInterval> }>} */
    const timers = new Map();
    /** @type {ReturnType<typeof setInterval>|null} */
    let clock = null;
    /** @type {Map<string, boolean>} */
    let enabledBefore = new Map();
    /** @type {((e: { instanceId?: string, command?: string, result?: any }) => void)|null} */
    let onCommand = null;
    const lang = () => ctx.i18n.getLanguage();

    return {
      init() {
        this.syncTimers();
        this.$watch(() => JSON.stringify(scheduleEntries(this.model.endpoints)), () => this.syncTimers());
        enabledBefore = this.enabledMap();
        this.$watch(() => this.model.endpoints.map((e) => `${e.id}:${e.schedule.enabled}`).join('|'), () => this.announceToggles());
        this.$watch(() => this.model.endpoints.map((e) => e.id).join('|'), () => this.dropRemoved());
        this.state.clock = Date.now();
        clock = setInterval(() => { this.state.clock = Date.now(); }, CLOCK_MS);
        onCommand = (e) => this.afterCommand(e);
        ctx.eventBus?.on?.('command:executed', onCommand);
      },
      destroy() {
        for (const t of timers.values()) clearInterval(t.handle);
        timers.clear();
        if (clock !== null) clearInterval(clock);
        clock = null;
        if (onCommand) ctx.eventBus?.off?.('command:executed', onCommand);
        onCommand = null;
      },

      // ─── Zeitgeber ─────────────────────────────────────────
      /** Zeitgeber mit den eingeschalteten Zeitplänen abgleichen; `runs` folgt. */
      syncTimers() {
        const wanted = scheduleEntries(this.model.endpoints);
        const { start, stop, restart } = diffSchedules(new Map([...timers].map(([id, t]) => [id, t.ms])), wanted);
        for (const id of [...stop, ...restart.map((w) => w.id)]) {
          clearInterval(timers.get(id)?.handle);
          timers.delete(id);
        }
        const fresh = new Set([...start, ...restart].map((w) => w.id));
        for (const w of [...start, ...restart]) {
          timers.set(w.id, { ms: w.ms, handle: setInterval(() => { this.tick(w.id); }, w.ms) });
        }
        if (fresh.size === 0 && stop.length === 0) return;
        const now = Date.now();
        const before = this.state.runs;
        this.state.runs = wanted.map((w) => {
          const prev = before.find((r) => r.endpointId === w.id);
          return fresh.has(w.id) || !prev ? { endpointId: w.id, startedAt: now, lastAt: prev?.lastAt ?? null } : prev;
        });
      },
      /**
       * Ein Tick des Zeitplans: startet den Lauf; läuft schon einer, fällt
       * der Tick aus.
       * @param {string} id @returns {Promise<void>}
       */
      async tick(id) {
        const out = await this._asyncTaskHost?.start('sendRequest', { endpointId: id });
        if (!out || out.status === 'rejected' || out.status === 'cancelled') return;
        this.state.runs = this.state.runs.map((r) => (r.endpointId === id ? { ...r, lastAt: Date.now() } : r));
      },
      /** @returns {Map<string, boolean>} id → Zeitplan an */
      enabledMap() { return new Map(this.model.endpoints.map((e) => [e.id, e.schedule.enabled])); },
      /** Hinweis je umgeschaltetem Zeitplan (Oberfläche, Agent, Rückgängig). */
      announceToggles() {
        const eps = this.model.endpoints;
        for (const { id, enabled } of toggledSchedules(enabledBefore, eps)) {
          const ep = eps.find((e) => e.id === id);
          if (!ep) continue;
          const name = endpointLabel(ep, this.t('unnamed'));
          ctx.notify(this.t(enabled ? 'scheduleStarted' : 'scheduleStopped', { name }), enabled ? 'success' : 'info');
        }
        enabledBefore = this.enabledMap();
      },
      /** Ein entfernter Endpunkt: laufenden Abruf abbrechen, Antwort verwerfen. */
      dropRemoved() {
        const ids = new Set(this.model.endpoints.map((e) => e.id));
        if (this.state.runningId !== null && !ids.has(this.state.runningId)) this._asyncTaskHost?.cancel('sendRequest');
        if (this.state.responses.some((r) => !ids.has(r.endpointId))) {
          this.state.responses = this.state.responses.filter((r) => ids.has(r.endpointId));
        }
      },
      /**
       * Nach `addEndpoint` dieser Instanz das Namensfeld fokussieren.
       * @param {{ instanceId?: string, command?: string, result?: any }} e
       */
      afterCommand(e) {
        if (!e || e.instanceId !== ctx.instanceId || e.command !== 'addEndpoint' || typeof e.result !== 'string') return;
        const id = e.result;
        this.$nextTick(() => {
          const input = Array.from(this.$root.querySelectorAll('.rest-api__ep-name-input'))
            .find((el) => /** @type {HTMLElement} */ (el).dataset.nameId === id);
          /** @type {HTMLInputElement|undefined} */ (input)?.focus();
        });
      },

      // ─── Liste ─────────────────────────────────────────────
      /** @param {Endpoint} ep @returns {string} Klasse des Listeneintrags */
      itemClass(ep) { return ep.id === this.model.activeId ? 'rest-api__list-item rest-api__list-item--active' : 'rest-api__list-item'; },
      /** @param {Endpoint} ep @returns {boolean} läuft ein Zeitgeber? */
      isRunning(ep) { return Boolean(ep) && this.state.runs.some((r) => r.endpointId === ep.id); },
      /**
       * Fokus im Namensfeld wählt den Endpunkt aus.
       * @param {Endpoint} ep @returns {void}
       */
      focusEndpoint(ep) {
        if (ep.id !== this.model.activeId) this.model.selectEndpoint({ endpointId: ep.id });
      },

      // ─── Detail ────────────────────────────────────────────
      /** Position des gezeigten Endpunkts, −1 ohne. */
      get activeIndex() { return this.model.endpoints.findIndex((e) => e.id === this.model.activeId); },
      /** @returns {Endpoint|null} der gezeigte Endpunkt */
      get activeEndpoint() { return this.model.endpoints[this.activeIndex] ?? null; },
      get hasActive() { return this.activeEndpoint !== null; },
      /** @param {number} i @returns {string} Schlüssel einer Zeile: neu je Endpunkt */
      rowKey(i) { return `${this.model.activeId}:${i}`; },
      /** @returns {string} Hinweis auf fehlende Zugangsdaten des gezeigten Endpunkts, sonst leer */
      get secretHint() {
        const names = missingSecretNames(this.secretHeadersEmpty ?? [], this.model.activeId);
        return names.length ? this.t('secretHeadersEmpty', { names: names.join(', ') }) : '';
      },
      get hasSecretHint() { return this.secretHint !== ''; },

      // ─── Zeitplan ──────────────────────────────────────────
      get activeRunning() { return this.isRunning(this.activeEndpoint); },
      get intervalDisabled() { return !this.activeEndpoint?.schedule.enabled; },
      get badgeClass() { return `rest-api__schedule-badge rest-api__schedule-badge--${this.activeRunning ? 'on' : 'off'}`; },
      get badgeText() { return this.t(this.activeRunning ? 'scheduleActive' : 'scheduleInactive'); },
      get intervalLabel() { return `${this.t('scheduleInterval')}:`; },
      get lastRunLabel() { return `${this.t('scheduleLastRun')}: `; },
      get nextRunLabel() { return `${this.t('scheduleNextRun')}: `; },
      /** @returns {{ endpointId: string, startedAt: number, lastAt: number|null }|null} */
      get activeRun() { return this.state.runs.find((r) => r.endpointId === this.model.activeId) ?? null; },
      get lastRunText() {
        void this.state.clock;
        const last = this.activeRun?.lastAt;
        return last ? formatTime(last, lang()) : this.t('scheduleNever');
      },
      get nextRunText() {
        void this.state.clock;
        const run = this.activeRun;
        const ep = this.activeEndpoint;
        return run && ep ? formatTime(nextRunAt(run.lastAt, run.startedAt, ep.schedule), lang()) : '—';
      },

      // ─── Antwort ───────────────────────────────────────────
      /** Läuft der Abruf des gezeigten Endpunkts? */
      get activeLoading() { return this.asyncTasks.sendRequest.running && this.state.runningId === this.model.activeId; },
      get activeResponse() { return this.state.responses.find((r) => r.endpointId === this.model.activeId) ?? null; },
      get hasResponse() { return this.activeResponse !== null; },
      get showResponse() { return this.hasResponse && !this.activeLoading; },
      get responseStatus() { return this.activeResponse ? statusText(this.activeResponse) : ''; },
      get statusClass() { return `rest-api__status rest-api__status--${this.activeResponse?.ok ? 'ok' : 'err'}`; },
      get responseBody() { return this.activeResponse?.body ?? ''; },
      /** Antwort in die Zwischenablage. @returns {void} */
      copyResponse() {
        const body = this.activeResponse?.body;
        if (body === undefined) return;
        navigator.clipboard.writeText(body).then(() => ctx.notify(this.t('copied'), 'success'));
      },
    };
  },
});
