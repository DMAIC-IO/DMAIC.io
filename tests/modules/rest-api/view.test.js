/**
 * REST API: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem echten
 * Modul, der echten Vorlage, einem gestellten `fetch` und gestellten
 * Zeitgebern (`setInterval`/`clearInterval`). Prüft Anlegen und Auswahl,
 * Altprojekt ohne Verlaufsschritt (Schreibmodus und Spalte je Endpunkt),
 * den Lauf `sendRequest` (Ladeanzeige, Sperre, Abbruch, ohne URL, Endpunkt im
 * Lauf entfernt), den Abgleich der Zeitgeber (an, Abstand, aus, Rückgängig,
 * Tick bei laufendem Abruf, Aufräumen), den abgelehnten Platzhalter im
 * Header-Wert, den Hinweis auf fehlende Zugangsdaten und zwei Instanzen.
 */
import { suite, test, afterEach, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import Alpine from '../../../vendor/alpinejs/csp.js';
import { registerCommandDirectives } from '../../../js/core/command-directives.js';
import { registerFieldDirective } from '../../../js/core/field-directive.js';
import { registerAsyncTaskDirectives } from '../../../js/core/async-task-directives.js';
import { WIDGETS } from '../../../js/widgets/registry.js';
import { WIDGET_I18N } from '../../widget-i18n.js';
import { withStoredWorksheetReader } from '../../helpers/worksheet-reader.js';
import { MASK } from '../../../js/modules/rest-api/domain/headers.js';
import mod from '../../../js/modules/rest-api/viewmodel/viewmodel.js';

const ID = 'rest-api';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const WS = '7a1e0c52-6b3d-4e8f-9a10-2b3c4d5e6f01';
const flush = () => new Promise((r) => setTimeout(r, 0));
/** Wartet, bis `ok()` gilt; höchstens zwei Sekunden. @param {() => boolean} ok */
async function until(ok) {
  for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setTimeout(r, 10));
}
/** @type {HTMLElement[]} */
const mounted = [];
let prepared = false;
/** @type {any} */
let UI = null;

/** Text des Moduls mit `{name}` gefüllt; sonst der Schlüssel. */
function tr(key, params) {
  const v = key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), UI);
  if (typeof v !== 'string') return key;
  return v.replace(/\{(\w+)\}/g, (_, k) => (params && k in params ? String(params[k]) : `{${k}}`));
}

async function prepare() {
  if (!prepared) {
    registerCommandDirectives(Alpine);
    registerFieldDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
    registerAsyncTaskDirectives(Alpine, { i18n: { t: (k, p) => (p ? `${k}${JSON.stringify(p)}` : k) } });
    if (!Alpine.version) Alpine.start();
    UI = await (await fetch(new URL(`../../../js/modules/${ID}/resources/i18n/ui.de.json`, import.meta.url), { cache: 'no-cache' })).json();
    prepared = true;
  }
  if (document.querySelector(`template[data-tpl="${TPL_KEY}"]`)) return;
  const html = await (await fetch(new URL(`../../../${TPL_KEY}`, import.meta.url), { cache: 'no-cache' })).text();
  const tpl = document.createElement('template');
  tpl.setAttribute('data-tpl', TPL_KEY);
  tpl.innerHTML = html;
  document.body.append(tpl);
}

// ─── Gestellte Zeitgeber und gestelltes fetch ────────────────
const realSetInterval = globalThis.setInterval;
const realClearInterval = globalThis.clearInterval;
const realFetch = globalThis.fetch;
/** @type {Map<number, { fn: Function, ms: number }>} */
const intervals = new Map();
let nextHandle = 1;
function fakeTimers() {
  intervals.clear();
  globalThis.setInterval = /** @type {any} */ ((fn, ms) => { const h = nextHandle++; intervals.set(h, { fn, ms }); return h; });
  globalThis.clearInterval = /** @type {any} */ ((h) => { intervals.delete(h); });
}
/** Laufende Zeitgeber eines Abstands. @param {number} ms */
const timersOf = (ms) => [...intervals.values()].filter((t) => t.ms === ms);

/** Offene Abrufe: Adresse, Optionen, Auflösen. */
const calls = [];
function fakeFetch() {
  calls.length = 0;
  globalThis.fetch = /** @type {any} */ ((url, init) => new Promise((resolve, reject) => {
    const call = {
      url, init,
      json: (body, status = 200) => resolve(new Response(JSON.stringify(body), { status, statusText: status === 200 ? 'OK' : 'Error', headers: { 'content-type': 'application/json' } })),
    };
    calls.push(call);
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  }));
}

function unmountAll() {
  while (mounted.length) {
    const old = mounted.pop();
    Alpine.destroyTree(old);
    old.remove();
  }
}

/** Echte Zeitgeber und echtes fetch zurück. */
function restore() {
  unmountAll();
  globalThis.setInterval = realSetInterval;
  globalThis.clearInterval = realClearInterval;
  globalThis.fetch = realFetch;
}

const V = { _schema: { version: '1.0' } };
const sched = (over = {}) => ({ enabled: false, intervalValue: 5, intervalUnit: 'minutes', ...over });
const endpoint = (id, over = {}) => ({
  id, name: '', url: '', headers: [], mappings: [], writeMode: 'replace', schedule: sched(), ...over,
});

/**
 * Modul einhängen (je Aufruf eine eigene Instanz wie in der Registry).
 * @param {object|null} model gespeicherter Stand
 * @param {{ inst?: string, keep?: boolean, extra?: Record<string, any> }} [opts]
 */
async function mount(model, { inst = 'ra-1', keep = false, extra = {} } = {}) {
  await prepare();
  if (!keep) { unmountAll(); fakeTimers(); fakeFetch(); }
  const states = { [inst]: model, ...extra };
  const notes = [];
  const asked = [];
  const handlers = [];
  const bus = {
    on: (n, fn) => handlers.push([n, fn]),
    off: (n, fn) => { const i = handlers.findIndex(([a, f]) => a === n && f === fn); if (i >= 0) handlers.splice(i, 1); },
    emit: (n, p) => { for (const [a, f] of [...handlers]) if (a === n) f(p); },
  };
  const context = {
    instanceId: inst,
    stateManager: withStoredWorksheetReader({
      getModuleState: (id) => states[id] ?? null,
      setModuleState: (id, s) => { states[id] = s; },
      getProjectCycle: () => 'dmaic',
      get: (path) => (path === 'phases'
        ? { data: Object.keys(states).filter((id) => states[id]?.sheets).map((instanceId) => ({ instanceId, moduleId: 'worksheet' })) }
        : undefined),
    }),
    i18n: { t: (k, p) => (k.startsWith(`modules.${ID}.`) ? tr(k.slice(ID.length + 9), p) : k), tf: () => tr, getLanguage: () => 'de' },
    eventBus: bus,
    chartManager: { create: async () => ({}), update: () => {}, destroy: () => {} },
    notify: (...a) => notes.push(a),
    dialog: { confirm: async (o) => { asked.push(o); return true; } },
    theme: 'light',
    language: 'de',
  };
  const container = document.createElement('div');
  document.body.append(container);
  mounted.push(container);
  const instance = { ...mod };
  await instance.init(container, context);
  await flush();
  return {
    instance, states, notes, asked, handlers, container,
    vm: () => Alpine.$data(container.querySelector('[x-data]')),
    q: (sel) => container.querySelector(sel),
    qa: (sel) => [...container.querySelectorAll(sel)],
  };
}

/** Ein Eingabefeld wie der Nutzer füllen. */
function type(el, value) {
  if (!el) throw new Error('Feld fehlt');
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
/** Ein Feld wie der Nutzer ändern und verlassen. */
function change(el, value) {
  type(el, value);
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
const text = (el) => (el?.textContent ?? '').trim();

suite('rest-api: Viewmodel im Browser', () => {
  afterEach(restore);

  test('leer: kein Detail; „+“ legt an, wählt aus und fokussiert das Namensfeld (ein Schritt)', async () => {
    const h = await mount(null);
    assertEqual(h.q('.rest-api__detail-inner'), null);
    assertEqual(text(h.q('.rest-api__count')), '0');
    assertEqual(h.q('.rest-api__add-btn').getAttribute('data-help-key'), 'modules.rest-api.actions.addEndpoint.help');
    h.q('.rest-api__add-btn').click();
    await until(() => h.q('.rest-api__detail-inner') !== null);
    const vm = h.vm();
    assertEqual(vm.model.endpoints.length, 1);
    assertEqual(vm.model.activeId, vm.model.endpoints[0].id);
    await until(() => document.activeElement === h.q('.rest-api__ep-name-input'));
    assertTrue(document.activeElement === h.q('.rest-api__ep-name-input'), 'Fokus im Namensfeld');
    assertTrue(h.instance.historyCan('undo'));
    assertEqual(h.q('[data-action="send"]').getAttribute('data-help-key'), 'modules.rest-api.asyncTasks.sendRequest.help');
    assertTrue(h.q('[data-action="cancel"]').hidden, 'Abbrechen nur im Lauf');
  });

  test('Altprojekt: kein Verlaufsschritt; Schreibmodus und Spalte folgen dem Endpunkt', async () => {
    const project = await (await fetch(new URL('./legacy-project.json', import.meta.url), { cache: 'no-cache' })).json();
    const A = '3f9b2c10-4d5e-4a61-8b72-9c0d1e2f3a01';
    const h = await mount(project.moduleStates[A], { inst: A, extra: { [WS]: project.moduleStates[WS] } });
    const vm = h.vm();
    await until(() => h.q('.rest-api__detail-inner') !== null);
    assertEqual(h.instance.historyCan('undo'), false);
    assertEqual(vm.model.activeId, 'ep-a2');
    assertEqual(h.q('.rest-api__url-input').value, 'https://api.example.com/status');
    assertEqual(h.q('.rest-api__header-val').value, 'Bearer abc123');
    await until(() => h.q('input[type="radio"][value="prepend"]').checked);
    assertEqual(h.q('[data-action="schedule-value"]').value, '2');
    assertEqual(h.q('[data-action="schedule-unit"]').value, 'hours');
    assertTrue(h.q('[data-action="schedule-value"]').disabled, 'gesperrt ohne Zeitplan');
    // Klick auf den ersten Eintrag wählt ihn aus (Verlaufsschritt).
    h.qa('.rest-api__list-item')[0].click();
    await until(() => vm.model.activeId === 'ep-a1');
    await until(() => h.q('input[type="radio"][value="append"]').checked);
    assertEqual(h.qa('.rest-api__mapping-row').length, 2);
    await until(() => h.qa('.rest-api__mapping-picker select')[0]?.value !== '');
    assertTrue(h.qa('.rest-api__mapping-picker select')[0].value.includes('col_temp'), 'Spalte der ersten Zuordnung');
    assertEqual(h.qa('.rest-api__mapping-picker select')[1].value, '', 'zweite ohne Spalte');
    // Doppelte Spalte: abgelehnt, der Wähler springt zurück.
    const second = h.qa('.rest-api__mapping-picker select')[1];
    const dup = [...second.options].find((o) => o.value.includes('col_temp')).value;
    change(second, dup);
    await flush();
    assertEqual(vm.model.endpoints[0].mappings[1].columnRef, null, 'nichts geschrieben');
    await until(() => h.qa('.rest-api__mapping-picker select')[1].value === '');
    const host = h.qa('.rest-api__mapping-picker')[1];
    assertEqual(host.getAttribute('aria-invalid'), 'true');
    assertEqual(host.title, 'modules.rest-api.invariants.mappingColumnFree');
    assertTrue(h.instance.historyCan('undo'), 'Auswahl ist ein Schritt');
    assertTrue(h.instance.historyStep('undo'));
    await until(() => vm.model.activeId === 'ep-a2');
  });

  test('Senden: Ladeanzeige, zweiter Start abgelehnt, Antwort eingerückt, Rückgabe die Antwort', async () => {
    const h = await mount({ ...V, endpoints: [endpoint('e1', { url: 'stub/a', headers: [{ key: ' x-probe ', value: 'eins' }] }), endpoint('e2', { url: 'stub/b' })], activeId: 'e1' });
    const vm = h.vm();
    await until(() => h.q('[data-action="send"]') !== null);
    h.q('[data-action="send"]').click();
    await until(() => calls.length === 1);
    assertDeepEqual(calls[0].init.headers, { 'x-probe': 'eins' });
    await until(() => h.q('.rest-api__loading') !== null);
    assertTrue(h.q('[data-action="send"]').disabled, 'Senden gesperrt');
    assertTrue(!h.q('[data-action="cancel"]').hidden, 'Abbrechen sichtbar');
    const second = await vm._asyncTaskHost.start('sendRequest', { endpointId: 'e2' });
    assertEqual(second.status, 'rejected');
    calls[0].json({ a: 1 });
    await until(() => h.q('.rest-api__response-body') !== null);
    assertEqual(h.q('.rest-api__response-body').textContent, JSON.stringify({ a: 1 }, null, 2));
    assertEqual(text(h.q('.rest-api__status')), '200 OK');
    assertTrue(h.q('.rest-api__status').classList.contains('rest-api__status--ok'));
    assertEqual(vm.state.runningId, null);
    assertDeepEqual(vm.sendRequest, { status: 200, statusText: 'OK', ok: true, body: JSON.stringify({ a: 1 }, null, 2) });
    assertEqual(h.instance.historyCan('undo'), false, 'ein Abruf ist kein Verlaufsschritt');
    // Die Antwort gehört dem Endpunkt: nach dem Wechsel leer.
    vm.model.selectEndpoint({ endpointId: 'e2' });
    await until(() => h.q('.rest-api__response-body') === null);
  });

  test('Abbrechen: Antwort bleibt leer, runningId null; Endpunkt im Lauf entfernt bricht ab', async () => {
    const h = await mount({ ...V, endpoints: [endpoint('e1', { url: 'stub/a' }), endpoint('e2', { url: 'stub/b' })], activeId: 'e1' });
    const vm = h.vm();
    await until(() => h.q('[data-action="send"]') !== null);
    h.q('[data-action="send"]').click();
    await until(() => calls.length === 1);
    h.q('[data-action="cancel"]').click();
    await until(() => vm.state.runningId === null);
    assertEqual(vm.asyncTasks.sendRequest.running, false);
    assertEqual(h.q('.rest-api__response-body'), null);
    assertEqual(vm.state.responses.length, 0);
    const run = vm._asyncTaskHost.start('sendRequest', { endpointId: 'e2' });
    await until(() => calls.length === 2);
    vm.model.removeEndpoint({ endpointId: 'e2' });
    assertEqual((await run).status, 'cancelled');
    await until(() => vm.state.runningId === null);
    assertEqual(vm.state.runningId, null);
  });

  test('ohne URL: Lauf scheitert mit errorNoUrl als Fehlermeldung (Kern meldet)', async () => {
    const h = await mount({ ...V, endpoints: [endpoint('e1')], activeId: 'e1' });
    const vm = h.vm();
    const out = await vm._asyncTaskHost.start('sendRequest', { endpointId: 'e1' });
    assertEqual(out.status, 'failed');
    assertEqual(out.error.message, tr('errorNoUrl'));
    assertEqual(calls.length, 0);
    const bad = await vm._asyncTaskHost.start('sendRequest', { endpointId: 'nope' });
    assertEqual(bad.status, 'rejected');
  });

  test('Zeitgeber: an, Abstand, aus, Rückgängig, Tick im Lauf fällt aus, Abbau räumt auf', async () => {
    const h = await mount({ ...V, endpoints: [endpoint('e1', { name: 'Linie', url: 'stub/a' })], activeId: 'e1' });
    const vm = h.vm();
    await until(() => h.q('[data-action="schedule-toggle"]') !== null);
    assertEqual(timersOf(300_000).length, 0);
    assertEqual(timersOf(30_000).length, 1, 'Uhr');
    h.q('[data-action="schedule-toggle"]').click();
    await until(() => timersOf(300_000).length === 1);
    assertDeepEqual(h.notes.at(-1), [tr('scheduleStarted', { name: 'Linie' }), 'success']);
    await until(() => h.q('.rest-api__schedule-status') !== null);
    assertEqual(text(h.q('[data-ref="schedule-last"]')), tr('scheduleNever'));
    assertEqual(text(h.q('.rest-api__schedule-badge')), tr('scheduleActive'));
    assertTrue(!h.q('[data-action="schedule-value"]').disabled);
    change(h.q('[data-action="schedule-value"]'), '1');
    await until(() => timersOf(60_000).length === 1);
    assertEqual(timersOf(300_000).length, 0, 'neu gestartet mit neuem Abstand');
    // Tick: startet den Lauf; ein zweiter Tick im Lauf fällt aus.
    timersOf(60_000)[0].fn();
    await until(() => calls.length === 1);
    timersOf(60_000)[0].fn();
    await flush();
    assertEqual(calls.length, 1, 'Tick im Lauf übersprungen');
    calls[0].json({ ok: 1 });
    await until(() => vm.state.runs[0].lastAt !== null);
    await until(() => text(h.q('[data-ref="schedule-last"]')) !== tr('scheduleNever'));
    h.q('[data-action="schedule-toggle"]').click();
    await until(() => timersOf(60_000).length === 0);
    assertDeepEqual(h.notes.at(-1), [tr('scheduleStopped', { name: 'Linie' }), 'info']);
    await flush();
    assertTrue(h.instance.historyStep('undo'));
    await until(() => timersOf(60_000).length === 1);
    assertDeepEqual(h.notes.at(-1), [tr('scheduleStarted', { name: 'Linie' }), 'success']);
    // URL leeren stoppt, read() nennt den Zeitplan ohne URL.
    type(h.q('.rest-api__url-input'), '');
    await until(() => timersOf(60_000).length === 0);
    assertDeepEqual(vm.read({ fields: ['scheduleWithoutUrl'] }).scheduleWithoutUrl, ['e1']);
    type(h.q('.rest-api__url-input'), 'stub/b');
    await until(() => timersOf(60_000).length === 1);
    unmountAll();
    assertEqual(intervals.size, 0, 'Abbau löscht Zeitgeber und Uhr');
  });

  test('gespeicherter Zeitplan startet beim Einhängen ohne Hinweis', async () => {
    const h = await mount({ ...V, endpoints: [endpoint('e1', { url: 'stub/a', schedule: sched({ enabled: true, intervalValue: 2, intervalUnit: 'hours' }) })], activeId: 'e1' });
    assertEqual(timersOf(7_200_000).length, 1);
    assertEqual(h.notes.length, 0);
    await until(() => h.q('.rest-api__schedule-dot') !== null);
  });

  test('Header-Wert: Platzhalter •••• abgelehnt, Hinweis auf fehlende Zugangsdaten', async () => {
    const h = await mount({ ...V, endpoints: [endpoint('e1', { url: 'stub/a', headers: [{ key: 'Authorization', value: '' }] })], activeId: 'e1' });
    const vm = h.vm();
    await until(() => h.q('[data-ref="secret-hint"]') !== null);
    assertEqual(text(h.q('[data-ref="secret-hint"]')), tr('secretHeadersEmpty', { names: 'Authorization' }));
    const val = h.q('.rest-api__header-val');
    change(val, MASK);
    await flush();
    assertEqual(vm.model.endpoints[0].headers[0].value, '', 'nicht geschrieben');
    assertEqual(val.getAttribute('aria-invalid'), 'true');
    assertEqual(val.value, '', 'Feld springt zurück');
    assertEqual(val.title, 'modules.rest-api.invariants.noMaskedValue', 'Grund im Titel');
    type(val, 'Bearer neu');
    await until(() => vm.model.endpoints[0].headers[0].value === 'Bearer neu');
    await until(() => h.q('[data-ref="secret-hint"]') === null);
  });

  test('Header und Zuordnung: Hinzufügen und Löschen über x-command', async () => {
    const h = await mount({ ...V, endpoints: [endpoint('e1', { url: 'stub/a' })], activeId: 'e1' });
    const vm = h.vm();
    await until(() => h.q('.rest-api__add-header-btn') !== null);
    h.q('.rest-api__add-header-btn').click();
    await until(() => h.qa('.rest-api__header-row').length === 1);
    type(h.q('.rest-api__header-key'), 'Accept');
    await until(() => vm.model.endpoints[0].headers[0].key === 'Accept');
    h.q('.rest-api__add-mapping-btn').click();
    await until(() => h.qa('.rest-api__mapping-row').length === 1);
    type(h.q('.rest-api__mapping-path'), 'data.values');
    await until(() => vm.model.endpoints[0].mappings[0].jsonPath === 'data.values');
    h.q('.rest-api__header-del').click();
    await until(() => h.qa('.rest-api__header-row').length === 0);
    h.q('.rest-api__mapping-del').click();
    await until(() => h.qa('.rest-api__mapping-row').length === 0);
    assertTrue(h.asked.length >= 2, 'generische Rückfrage');
    h.q('input[type="radio"][value="append"]').click();
    await until(() => vm.model.endpoints[0].writeMode === 'append');
  });

  test('× am Eintrag fragt mit Namen und wählt den ersten übrigen', async () => {
    const h = await mount({ ...V, endpoints: [endpoint('e1', { name: 'Eins' }), endpoint('e2', { name: 'Zwei' })], activeId: 'e2' });
    const vm = h.vm();
    await until(() => h.qa('.rest-api__item-del').length === 2);
    h.qa('.rest-api__item-del')[1].click();
    await until(() => vm.model.endpoints.length === 1);
    assertEqual(h.asked.length, 1);
    assertTrue(JSON.stringify(h.asked[0]).includes('Zwei'));
    assertEqual(vm.model.activeId, 'e1');
  });

  test('zwei Instanzen: Antworten und Zeitgeber getrennt', async () => {
    const state = (url) => ({ ...V, endpoints: [endpoint('e1', { url })], activeId: 'e1' });
    const a = await mount(state('stub/a'), { inst: 'a' });
    const b = await mount(state('stub/b'), { inst: 'b', keep: true });
    await until(() => a.q('[data-action="send"]') !== null && b.q('[data-action="send"]') !== null);
    a.q('[data-action="send"]').click();
    await until(() => calls.length === 1);
    assertTrue(!b.q('[data-action="send"]').disabled, 'B nicht gesperrt');
    calls[0].json({ who: 'a' });
    await until(() => a.q('.rest-api__response-body') !== null);
    assertEqual(b.q('.rest-api__response-body'), null);
    b.q('[data-action="schedule-toggle"]').click();
    await until(() => timersOf(300_000).length === 1);
    assertEqual(a.vm().state.runs.length, 0);
    assertEqual(b.vm().state.runs.length, 1);
    Alpine.destroyTree(b.container);
    assertEqual(timersOf(300_000).length, 0);
    assertEqual(timersOf(30_000).length, 1, 'Uhr von A bleibt');
  });
});
