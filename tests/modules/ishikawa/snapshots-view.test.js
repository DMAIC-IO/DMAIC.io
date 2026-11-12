/**
 * Ishikawa: view-Teil Snapshots (viewmodel/snapshots.js) im Browser — das
 * echte Modul mit der echten Vorlage resources/view.html, den deutschen
 * Texten aus resources/i18n/ui.de.json und Attrappen für stateManager,
 * Event-Bus, Dialog, Meldungen und chartManager. Prüft Liste (Speichern,
 * Laden, Löschen), Vergleich (Banner, Zeilenklassen, Score-Änderung) und
 * Trend (Widget, Ausblenden von Reihen).
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual, assertThrows } from '../../test-utils.js';
import Alpine from '../../../vendor/alpinejs/csp.js';
import mod from '../../../js/modules/ishikawa/viewmodel/viewmodel.js';
import { registerTablistDirective } from '../../../js/core/tablist.js';
import { registerFileDropDirective } from '../../../js/core/file-drop-directive.js';
import { registerFieldDirective } from '../../../js/core/field-directive.js';
import { registerCommandDirectives } from '../../../js/core/command-directives.js';
import { registerWidgetDirective } from '../../../js/core/widget-directive.js';
import { registerRouteDirectives } from '../../../js/core/router/route-store.js';
import { WIDGETS } from '../../../js/widgets/registry.js';
import { WIDGET_I18N } from '../../widget-i18n.js';

const ID = 'ishikawa';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };
/** Wartet, bis `ok()` gilt; höchstens zwei Sekunden. */
async function until(ok) {
  for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setTimeout(r, 10));
}
const mounted = [];
let ready = false;
/** Deutsche Texte des Moduls. */
let UI = null;

/** Text unter einem Punkt-Pfad, Parameter `{name}` eingesetzt; sonst der Schlüssel. */
function tr(key, params) {
  const v = key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), UI);
  if (typeof v !== 'string') return params ? `${key}${JSON.stringify(params)}` : key;
  return v.replace(/\{(\w+)\}/g, (_, k) => (params && k in params ? String(params[k]) : `{${k}}`));
}

async function ensureTemplate() {
  if (ready) return;
  registerTablistDirective(Alpine);
  registerFileDropDirective(Alpine);
  registerFieldDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
  registerWidgetDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
  registerCommandDirectives(Alpine);
  registerRouteDirectives(Alpine, { onGo: () => {} });
  if (!Alpine.version) Alpine.start();
  UI = await (await fetch(new URL(`../../../js/modules/${ID}/resources/i18n/ui.de.json`, import.meta.url), { cache: 'no-cache' })).json();
  if (!document.querySelector(`template[data-tpl="${TPL_KEY}"]`)) {
    const html = await (await fetch(new URL(`../../../${TPL_KEY}`, import.meta.url), { cache: 'no-cache' })).text();
    const tpl = document.createElement('template');
    tpl.setAttribute('data-tpl', TPL_KEY);
    tpl.innerHTML = html;
    document.body.append(tpl);
  }
  ready = true;
}

/**
 * Attrappe des Dialog-Dienstes (Vertrag von js/ui/dialog/dialog.js): `form`
 * leiht den Inhalt aus und gibt ihn beim Schließen zurück.
 */
function fakeDialog(confirms) {
  const d = {
    open: null,
    async confirm(opts) { confirms.push(opts); return d.answer; },
    answer: true,
    show(opts) { return { close: () => opts.onClose?.(), setTitle() {} }; },
    form(opts) {
      return new Promise((resolve) => {
        const body = document.createElement('div');
        document.body.append(body);
        const home = opts.content.parentNode;
        const next = opts.content.nextSibling;
        body.append(opts.content);
        let settled = false;
        const finish = (result) => {
          if (settled) return;
          settled = true;
          home.insertBefore(opts.content, next);
          body.remove();
          d.open = null;
          resolve(result);
        };
        const api = {
          confirm: () => { if (!settled && !(opts.onConfirm && opts.onConfirm(body) === false)) finish(true); },
          cancel: () => finish(false),
        };
        d.open = { opts, body, api };
        opts.onMount?.(body, { confirm: api.confirm, cancel: api.cancel });
      });
    },
  };
  return d;
}

/**
 * Modul einhängen, Reiter Hypothesen.
 * @param {object|null} [model] gespeicherter Zustand der Instanz
 */
async function mount(model = null) {
  await ensureTemplate();
  while (mounted.length) mounted.pop().remove();
  const states = { 'ish-1': model };
  const notes = [];
  const confirms = [];
  const handlers = [];
  const executed = [];
  const bus = {
    on: (n, fn) => handlers.push([n, fn]),
    off: (n, fn) => { const i = handlers.findIndex(([a, f]) => a === n && f === fn); if (i >= 0) handlers.splice(i, 1); },
    emit: (n, p) => { if (n === 'command:executed') executed.push(p); for (const [a, f] of [...handlers]) if (a === n) f(p); },
  };
  const chartCalls = [];
  const chartManager = {
    create: async (el, type, config) => { const chart = { el, type, config: { ...config } }; chartCalls.push(['create', type, config, chart]); return chart; },
    update: (chart, config) => { chartCalls.push(['update', chart.type, config, chart]); Object.assign(chart.config, config); },
    destroy: () => {},
  };
  const lang = { current: 'de' };
  const dialog = fakeDialog(confirms);
  const context = {
    instanceId: 'ish-1',
    stateManager: {
      get: () => undefined,
      getModuleState: (id) => states[id] ?? null,
      setModuleState: (id, s) => { states[id] = s; },
      getProjectCycle: () => 'dmaic',
    },
    i18n: { t: (k, p) => (p ? `${k}${JSON.stringify(p)}` : k), tf: () => tr, getLanguage: () => lang.current },
    eventBus: bus,
    chartManager,
    notify: (msg, type) => notes.push([msg, type]),
    dialog,
    theme: 'light',
    get language() { return lang.current; },
  };
  const container = document.createElement('div');
  document.body.append(container);
  mounted.push(container);
  await mod.init(container, context);
  await settle();
  const vm = () => Alpine.$data(container.querySelector('[x-data]'));
  vm().state.tab = 'hypotheses';
  await settle();
  return {
    container, vm, notes, confirms, dialog, states, lang, chartCalls, executed,
    $: (s) => container.querySelector(s),
    $$: (s) => [...container.querySelectorAll(s)],
  };
}

/** Zeile des Baums. */
function row(id, parentId, category = '', extra = {}) {
  return { id, stableId: `H-${String(id).padStart(3, '0')}`, parentId, category, name: '', description: '', ratings: {}, status: 'open', ...extra };
}

/** Ein Stand mit Baum: 1 (man) › 2 › 3; 4 (machine); 5 ohne Kategorie. */
function tree(extra = {}) {
  return {
    _schema: { version: '1.0' },
    experts: [{ id: 1, name: 'Anna Schmidt', color: '#6366f1' }, { id: 2, name: 'Bo', color: '#0891b2' }],
    rows: [
      row(1, null, 'man', { name: 'Fahrer', ratings: { 1: 6, 2: 8 } }),
      row(2, 1, '', { name: 'Ortskenntnis', ratings: { 1: 9 } }),
      row(3, 2, '', { name: 'Navi' }),
      row(4, null, 'machine', { name: 'Ofen', ratings: { 1: 2 } }),
      row(5, null, '', { name: 'Wetter', ratings: { 2: 4 } }),
    ],
    ...extra,
  };
}

/** Text in ein Feld und `change`. */
function typeIn(el, v) {
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Zuletzt angelegtes Diagramm eines Typs (`trend`, `pareto`). */
const lastOf = (h, type) => h.chartCalls.filter((c) => c[0] === 'create' && c[1] === type).at(-1)?.[3] ?? null;

/** Ein Snapshot mit eigenen Zeilen. */
function snap(id, name, rows, experts = [{ id: 1, name: 'Anna Schmidt', color: '#6366f1' }, { id: 2, name: 'Bo', color: '#0891b2' }]) {
  return { id, name, date: `2026-0${id}-0${id}T08:05:00.000Z`, data: { problem: '', experts, rows } };
}

/**
 * Snapshot „Alt“ (id 1): Fahrer war 8 (jetzt 7), Wetter fehlte (jetzt neu),
 * „Lärm“ (H-009) gibt es nicht mehr; Ortskenntnis und Ofen gleich.
 */
function withSnapshot(extra = {}) {
  return tree({
    snapshots: [snap(1, 'Alt', [
      row(1, null, 'man', { name: 'Fahrer', ratings: { 1: 8, 2: 8 } }),
      row(2, 1, '', { name: 'Ortskenntnis', ratings: { 1: 9 } }),
      row(3, 2, '', { name: 'Navi' }),
      row(4, null, 'machine', { name: 'Ofen', ratings: { 1: 2 } }),
      row(9, null, 'method', { name: 'Lärm', ratings: { 1: 3 } }),
    ])],
    ...extra,
  });
}

/** Zwei Snapshots: „Eins“ (id 1, älter) und „Zwei“ (id 2, neuer, oben). */
function twoSnapshots() {
  return tree({
    snapshots: [
      snap(2, 'Zwei', [row(1, null, 'method', { name: 'Damals', ratings: { 1: 5 } })]),
      snap(1, 'Eins', [row(1, null, 'man', { name: 'Fahrer', ratings: { 1: 1 } })]),
    ],
  });
}

suite('ishikawa snapshots: Liste', () => {
  test('Speichern über das Formular: Name getrimmt, Feld geleert, neuester oben; Datum, Name, Zahl der Hypothesen', async () => {
    const h = await mount(tree());
    assertEqual(h.$('.ishikawa__snapshot-list .ishikawa__no-items').textContent, 'Noch keine Snapshots gespeichert.');
    const input = h.$('[data-ref="snapNameInput"]');
    typeIn(input, '  Stand A ');
    h.$('.ishikawa__snapshot-save').requestSubmit();
    await settle();
    typeIn(input, 'Stand B');
    h.$('[data-ref="saveSnapBtn"]').click();
    await settle();
    assertDeepEqual(h.vm().model.snapshots.map((s) => s.name), ['Stand B', 'Stand A']);
    assertDeepEqual(h.vm().model.snapshots.map((s) => s.id), [2, 1]);
    assertEqual(input.value, '');
    assertDeepEqual(h.$$('.ishikawa__snap-item').map((el) => el.dataset.snapId), ['2', '1']);
    assertEqual(h.$('.ishikawa__snap-item .ishikawa__snap-name').textContent, 'Stand B');
    assertEqual(h.$('.ishikawa__snap-item .ishikawa__snap-badge').textContent, '5 Hyp.');
    assertEqual(h.$('.ishikawa__snap-item .ishikawa__snap-date').textContent, h.vm().snapDate(h.vm().model.snapshots[0]));
    assertEqual(h.$('.ishikawa__snap-item').title, 'Klick: Vergleichen · Doppelklick: Laden');
    assertEqual(h.$('.ishikawa__snap-items .ishikawa__no-items'), null);
  });

  test('saveSnapshot ohne Namen: „Snapshot <Datum>“ nach der Datumsregel des Moduls', async () => {
    const h = await mount(tree());
    const de = h.vm().saveSnapshot({});
    assertEqual(de, 1);
    assertEqual(h.vm().model.snapshots[0].name, `Snapshot ${new Date().toLocaleDateString('de-DE')}`);
    h.lang.current = 'en';
    h.vm().saveSnapshot({ name: '' });
    assertEqual(h.vm().model.snapshots[0].name, `Snapshot ${new Date().toLocaleDateString('en-GB')}`, 'Tag vor Monat wie im Trend');
    assertTrue(h.vm().model.snapshots[0].name !== h.vm().model.snapshots[1].name, 'en ≠ de');
    assertDeepEqual(h.vm().model.snapshots[0].data.rows.map((r) => r.stableId), h.vm().model.rows.map((r) => r.stableId));
  });

  test('snapDate: Datum und Uhrzeit nach der Datumsregel des Moduls', async () => {
    const h = await mount(withSnapshot());
    const s = h.vm().model.snapshots[0];
    const d = new Date(s.date);
    const fmt = (lang) => `${d.toLocaleDateString(lang)} ${d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })}`;
    assertEqual(h.vm().snapDate(s), fmt('de-DE'));
    h.lang.current = 'en';
    assertEqual(h.vm().snapDate(s), fmt('en-GB'), 'Tag vor Monat wie im Trend');
    assertTrue(fmt('de-DE') !== fmt('en-GB'), 'en ≠ de');
  });

  test('Doppelklick lädt nach Rückfrage; danach ist nichts eingeklappt', async () => {
    const h = await mount(withSnapshot());
    h.vm().state.collapsed = [1];
    await settle();
    const item = h.$('.ishikawa__snap-item[data-snap-id="1"]');
    h.dialog.answer = false;
    item.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await settle();
    assertEqual(h.confirms.length, 1);
    assertEqual(h.vm().model.rows.length, 5);
    assertDeepEqual([...h.vm().state.collapsed], [1]);
    h.dialog.answer = true;
    item.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await settle();
    assertEqual(h.confirms.length, 2);
    assertDeepEqual(h.vm().model.rows.map((r) => r.name), ['Fahrer', 'Ortskenntnis', 'Navi', 'Ofen', 'Lärm']);
    assertDeepEqual([...h.vm().state.collapsed], []);
  });

  test('loadSnapshot ohne Oberfläche (wie der Agent) leert die eingeklappten Zeilen ebenso', async () => {
    const h = await mount(withSnapshot());
    h.vm().state.collapsed = [1, 2];
    h.vm().model.loadSnapshot({ snapshotId: 1 });
    await settle();
    assertDeepEqual([...h.vm().state.collapsed], []);
  });

  test('Löschen über das Kreuz startet keinen Vergleich', async () => {
    const h = await mount(withSnapshot());
    h.$('[data-snap-del="1"]').click();
    await settle();
    assertEqual(h.vm().model.snapshots.length, 0);
    assertEqual(h.vm().state.compareSnapId, null);
    assertEqual(h.$$('.ishikawa__snap-item').length, 0);
  });
});

suite('ishikawa snapshots: Vergleich', () => {
  test('Klick vergleicht, zweiter Klick beendet; Banner, Zeilenklassen und Score-Änderung', async () => {
    const h = await mount(withSnapshot());
    const item = h.$('.ishikawa__snap-item[data-snap-id="1"]');
    assertTrue(!h.$('[data-ref="diffBanner"]').classList.contains('ishikawa__diff-banner--visible'), 'Banner zu');
    item.click();
    await settle();
    assertEqual(h.vm().state.compareSnapId, 1);
    assertTrue(item.classList.contains('ishikawa__snap-item--active'), item.className);
    assertTrue(h.$('[data-ref="diffBanner"]').classList.contains('ishikawa__diff-banner--visible'), 'Banner offen');
    assertEqual(h.$('.ishikawa__diff-title').textContent, '⟷ Vergleich mit:');
    assertEqual(h.$('.ishikawa__diff-val--new').textContent, '+1 neu');
    assertEqual(h.$('.ishikawa__diff-val--del').textContent, '−1 entfernt');
    assertEqual(h.$('.ishikawa__diff-val--chg').textContent, '~1 Score Δ');
    assertEqual(h.$('.ishikawa__diff-label').textContent, 'vs. „Alt“');
    assertTrue(h.$('tr[data-id="5"]').classList.contains('ishikawa__diff-new'), h.$('tr[data-id="5"]').className);
    assertTrue(h.$('tr[data-id="1"]').classList.contains('ishikawa__diff-chg'), h.$('tr[data-id="1"]').className);
    assertTrue(h.$('tr[data-id="1"]').classList.contains('ishikawa__depth-0'), 'Tiefenklasse bleibt');
    const plain = h.$('tr[data-id="4"]').className;
    assertTrue(!plain.includes('ishikawa__diff'), plain);
    const delta = h.$('tr[data-id="1"] .ishikawa__score-delta');
    assertEqual(delta.textContent, h.vm().num(-1, 1));
    assertTrue(delta.classList.contains('ishikawa__delta-down'), delta.className);
    assertEqual(h.$('tr[data-id="4"] .ishikawa__score-delta'), null);
    item.click();
    await settle();
    assertEqual(h.vm().state.compareSnapId, null);
    assertTrue(!h.$('[data-ref="diffBanner"]').classList.contains('ishikawa__diff-banner--visible'), 'Banner wieder zu');
    assertTrue(!h.$('tr[data-id="5"]').className.includes('ishikawa__diff'), 'keine Diff-Klasse mehr');
  });

  test('compareSnapshot liefert den Diff; Score steigt: Klasse „up“ mit Pluszeichen; closeCompare über den Knopf', async () => {
    const h = await mount(withSnapshot());
    const diff = h.vm().compareSnapshot({ snapshotId: 1 });
    assertDeepEqual(JSON.parse(JSON.stringify(diff)), {
      added: ['H-005'],
      removed: ['H-009'],
      changed: [{ stableId: 'H-001', oldScore: 8, newScore: 7, delta: -1 }],
    });
    assertEqual(h.vm().deltaClass({ delta: 0.5 }), 'ishikawa__delta-up');
    assertEqual(h.vm().deltaText({ delta: 0.5 }), `+${h.vm().num(0.5, 1)}`);
    await settle();
    h.$('[data-ref="diffCloseBtn"]').click();
    await settle();
    assertEqual(h.vm().state.compareSnapId, null);
    h.vm().compareSnapshot({ snapshotId: 1 });
    h.vm().closeCompare({});
    assertEqual(h.vm().state.compareSnapId, null);
    assertThrows(() => h.vm().compareSnapshot({ snapshotId: 7 }), /snapshotId/);
  });

  test('Heilung beim Lesen: Vergleich mit einem unbekannten Snapshot zeigt nichts', async () => {
    const h = await mount(withSnapshot());
    h.vm().state.compareSnapId = 42;
    await settle();
    assertEqual(h.vm().diff, null);
    assertEqual(h.vm().compareLabel, '');
    assertTrue(!h.$('[data-ref="diffBanner"]').classList.contains('ishikawa__diff-banner--visible'), 'Banner zu');
    assertTrue(!h.$('tr[data-id="5"]').className.includes('ishikawa__diff'), 'keine Diff-Klasse');
  });
});

suite('ishikawa snapshots: Löschen eines benutzten Snapshots', () => {
  /** Pareto-Quelle und Vergleich auf Snapshot 2, Trend offen. */
  async function onTwo() {
    const h = await mount(twoSnapshots());
    h.vm().setParetoSource({ snapshotId: 2 });
    h.vm().compareSnapshot({ snapshotId: 2 });
    h.vm().state.trendVisible = true;
    await settle();
    assertEqual(h.vm().paretoChart.items[0].name, 'Damals');
    assertEqual(h.vm().trendChart.xCount, 3);
    return h;
  }

  /** Nach dem Löschen: Pareto aktuell, kein Vergleich, Trend ohne die Spalte. */
  function afterRemoval(h) {
    assertEqual(h.vm().state.paretoSnapId, null);
    assertEqual(h.vm().state.compareSnapId, null);
    assertEqual(h.vm().paretoSourceValue, 'current');
    assertEqual(h.vm().paretoChart.items.length, 4);
    assertEqual(h.vm().diff, null);
    assertTrue(!h.$('[data-ref="diffBanner"]').classList.contains('ishikawa__diff-banner--visible'), 'Banner zu');
    assertEqual(h.vm().trendChart.xCount, 2);
    assertDeepEqual(h.vm().trendChart.xLabels.map((l) => l.name), ['Eins', 'Aktuell']);
  }

  test('über die Oberfläche: kein Fehler, Pareto aus dem aktuellen Stand, kein Diff, Trend ohne die Spalte', async () => {
    const h = await onTwo();
    h.$('[data-snap-del="2"]').click();
    await settle();
    assertDeepEqual(h.vm().model.snapshots.map((s) => s.id), [1]);
    afterRemoval(h);
  });

  test('wie der Agent (model.removeSnapshot): dasselbe', async () => {
    const h = await onTwo();
    h.vm().model.removeSnapshot({ snapshotId: 2 });
    await settle();
    afterRemoval(h);
  });

  test('die freigewordene id kommt wieder: der neue Snapshot wird nicht still Quelle oder Vergleich', async () => {
    const h = await onTwo();
    h.vm().model.removeSnapshot({ snapshotId: 2 });
    await settle();
    assertEqual(h.vm().saveSnapshot({ name: 'Neu' }), 2);
    await settle();
    assertEqual(h.vm().state.paretoSnapId, null);
    assertEqual(h.vm().state.compareSnapId, null);
    assertEqual(h.vm().paretoSourceValue, 'current');
    assertEqual(h.vm().diff, null);
  });

  test('ein anderer Snapshot gelöscht: Quelle und Vergleich bleiben', async () => {
    const h = await onTwo();
    h.vm().model.removeSnapshot({ snapshotId: 1 });
    await settle();
    assertEqual(h.vm().state.paretoSnapId, 2);
    assertEqual(h.vm().state.compareSnapId, 2);
  });
});

suite('ishikawa snapshots: Trend', () => {
  test('Knopf öffnet den Trend: ohne Snapshot ein Hinweis, mit Snapshot das Diagramm bis zum aktuellen Stand; Schließen', async () => {
    const h = await mount(tree());
    const panel = h.$('[data-ref="trendPanel"]');
    assertTrue(!panel.classList.contains('ishikawa__trend-panel--visible'), 'zu');
    assertEqual(h.vm().trendChart, null);
    h.$('[data-ref="trendBtn"]').click();
    await settle();
    assertEqual(h.vm().state.trendVisible, true);
    assertTrue(panel.classList.contains('ishikawa__trend-panel--visible'), 'offen');
    assertEqual(h.$('.ishikawa__trend-panel .ishikawa__trend-empty').textContent, 'Mindestens 1 Snapshot + aktueller Zustand nötig.');
    assertEqual(lastOf(h, 'trend'), null);
    h.vm().saveSnapshot({ name: 'Vorher' });
    await until(() => lastOf(h, 'trend') !== null);
    const cfg = h.vm().trendChart;
    assertEqual(cfg.xCount, 2);
    assertDeepEqual(cfg.xLabels.map((l) => l.name), ['Vorher', 'Aktuell']);
    assertEqual(cfg.series[0].color, 'var(--ishikawa-line-1)');
    assertEqual(h.$('.ishikawa__trend-panel .ishikawa__trend-empty'), null);
    h.$('[data-ref="trendCloseBtn"]').click();
    await settle();
    assertEqual(h.vm().state.trendVisible, false);
    assertTrue(!panel.classList.contains('ishikawa__trend-panel--visible'), 'wieder zu');
    h.$('[data-ref="trendBtn"]').click();
    h.$('[data-ref="trendBtn"]').click();
    await settle();
    assertEqual(h.vm().state.trendVisible, false);
  });

  test('ohne Bewertungen: Hinweis „keine Daten“', async () => {
    const h = await mount({ _schema: { version: '1.0' }, rows: [row(1, null)], snapshots: [snap(1, 'A', [row(1, null)], [])] });
    h.vm().state.trendVisible = true;
    await settle();
    assertEqual(h.vm().trendChart, null);
    assertEqual(h.$('.ishikawa__trend-panel .ishikawa__trend-empty').textContent, 'Keine Hypothesen mit Bewertungen gefunden.');
  });

  test('Reihe ausblenden landet in state.trendEdits; Umbenennen zeichnet neu, die Ausblendung bleibt', async () => {
    const h = await mount(withSnapshot());
    h.vm().state.trendVisible = true;
    await until(() => lastOf(h, 'trend') !== null);
    const chart = lastOf(h, 'trend');
    chart.config.hiddenSeries = ['H-004'];
    chart.config.onEditorChange(chart);
    await settle();
    assertDeepEqual([...h.vm().state.trendEdits.hiddenSeries], ['H-004']);
    typeIn(h.$('[data-row-name="1"]'), 'Fahrerin');
    await settle();
    const now = lastOf(h, 'trend');
    assertTrue(now.config.series.some((s) => s.name === 'Fahrerin'), JSON.stringify(now.config.series.map((s) => s.name)));
    assertDeepEqual([...now.config.hiddenSeries], ['H-004']);
    assertDeepEqual([...h.vm().state.trendEdits.hiddenSeries], ['H-004']);
  });
});
