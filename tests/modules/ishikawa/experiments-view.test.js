/**
 * Ishikawa: view-Teil Experimente und Fakten (viewmodel/experiments.js) im
 * Browser — das echte Modul mit der echten Vorlage resources/view.html, den
 * Texten aus resources/i18n/ui.<lang>.json und Attrappen für stateManager,
 * Event-Bus, Dialog und Meldungen. Gantt und Kostenverlauf zeichnen die
 * echten Diagrammtypen, damit das SVG geprüft werden kann. Prüft Tabellen
 * (Felder, Löschen, Gestenattribute), die beiden Verknüpfungsdialoge und die
 * Diagramme mit ihren Wirtshöhen.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import Alpine from '../../../vendor/alpinejs/csp.js';
import mod from '../../../js/modules/ishikawa/viewmodel/viewmodel.js';
import { registerTablistDirective } from '../../../js/core/tablist.js';
import { registerFileDropDirective } from '../../../js/core/file-drop-directive.js';
import { registerFieldDirective } from '../../../js/core/field-directive.js';
import { registerCommandDirectives } from '../../../js/core/command-directives.js';
import { registerWidgetDirective } from '../../../js/core/widget-directive.js';
import { registerRouteDirectives } from '../../../js/core/router/route-store.js';
import { todayISO } from '../../../js/core/local-date.js';
import GanttChart from '../../../js/core/chart/types/gantt.js';
import CumulativeCost from '../../../js/core/chart/types/cumulative-cost.js';
import { WIDGETS } from '../../../js/widgets/registry.js';
import { WIDGET_I18N } from '../../widget-i18n.js';

const ID = 'ishikawa';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };
const mounted = [];
let ready = false;
/** Texte des Moduls je Sprache. */
const UI = {};
/** Echte Diagrammtypen, die die Attrappe des chartManager zeichnet. */
const TYPES = { gantt: GanttChart, 'cumulative-cost': CumulativeCost };

/** Text unter einem Punkt-Pfad in der Sprache, Parameter `{name}` eingesetzt; sonst der Schlüssel. */
function tr(lang, key, params) {
  const v = key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), UI[lang]);
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
  for (const lang of ['de', 'en']) {
    UI[lang] = await (await fetch(new URL(`../../../js/modules/${ID}/resources/i18n/ui.${lang}.json`, import.meta.url), { cache: 'no-cache' })).json();
  }
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
 * Modul einhängen und den Reiter wählen.
 * @param {object|null} model gespeicherter Zustand der Instanz
 * @param {{ tab?: string, lang?: string }} [opts]
 */
async function mount(model, { tab = 'experiments', lang: startLang = 'de' } = {}) {
  await ensureTemplate();
  while (mounted.length) mounted.pop().remove();
  const states = { 'ish-1': model };
  const confirms = [];
  const handlers = [];
  const executed = [];
  const bus = {
    on: (n, fn) => handlers.push([n, fn]),
    off: (n, fn) => { const i = handlers.findIndex(([a, f]) => a === n && f === fn); if (i >= 0) handlers.splice(i, 1); },
    emit: (n, p) => { if (n === 'command:executed') executed.push(p); for (const [a, f] of [...handlers]) if (a === n) f(p); },
  };
  const chartCalls = [];
  const lang = { current: startLang };
  const chartManager = {
    create: async (el, type, config) => {
      const Cls = TYPES[type];
      const chart = Cls ? new Cls(el, { ...config }, { language: lang.current }) : { el, type, config: { ...config } };
      chart.type = type;
      if (Cls) chart.render();
      chartCalls.push(['create', type, config, chart]);
      return chart;
    },
    update: (chart, config) => {
      chartCalls.push(['update', chart.type, config, chart]);
      if (TYPES[chart.type]) chart.update(config); else Object.assign(chart.config, config);
    },
    destroy: (chart) => { if (TYPES[chart?.type]) chart.destroy(); },
  };
  const dialog = fakeDialog(confirms);
  const context = {
    instanceId: 'ish-1',
    stateManager: {
      get: () => undefined,
      getModuleState: (id) => states[id] ?? null,
      setModuleState: (id, s) => { states[id] = s; },
      getProjectCycle: () => 'dmaic',
    },
    i18n: { t: (k, p) => (p ? `${k}${JSON.stringify(p)}` : k), tf: () => (k, p) => tr(lang.current, k, p), getLanguage: () => lang.current },
    eventBus: bus,
    chartManager,
    notify: () => {},
    dialog,
    theme: 'light',
    get language() { return lang.current; },
  };
  const container = document.createElement('div');
  container.style.width = '1200px';
  document.body.append(container);
  mounted.push(container);
  await mod.init(container, context);
  await settle();
  const vm = () => Alpine.$data(container.querySelector('[x-data]'));
  vm().state.tab = tab;
  await settle();
  return {
    container, vm, confirms, dialog, states, lang, chartCalls, executed,
    $: (s) => container.querySelector(s),
    $$: (s) => [...container.querySelectorAll(s)],
  };
}

/** Zeile des Baums. */
function row(id, parentId, category = '', extra = {}) {
  return { id, stableId: `H-${String(id).padStart(3, '0')}`, parentId, category, name: '', description: '', ratings: {}, status: 'open', ...extra };
}

/** Ein Experiment mit Vorgaben wie im Model. */
function xp(id, extra = {}) {
  return {
    id, title: '', description: '', responsible: '', status: 'planned',
    startDate: '', endDate: '', costMoney: null, costHours: null, hypothesisIds: [], ...extra,
  };
}

/** Ein Fakt. */
function fact(id, extra = {}) {
  return { id, name: '', description: '', date: '', owner: '', ...extra };
}

/**
 * Baum 1 (man) › 2; 3 (machine); zwei Experten; Experimente und Fakten nach Wahl.
 * @param {object} [extra]
 */
function state(extra = {}) {
  return {
    _schema: { version: '1.0' },
    experts: [{ id: 1, name: 'Anna Schmidt', color: '#6366f1' }, { id: 2, name: 'Bo', color: '#0891b2' }],
    rows: [
      row(1, null, 'man', { name: 'Fahrer' }),
      row(2, 1, '', { name: 'Ortskenntnis' }),
      row(3, null, 'machine', { name: 'Ofen' }),
    ],
    ...extra,
  };
}

/** Zwei datierte Experimente mit Kosten. */
function dated() {
  return state({
    experiments: [
      xp(1, { title: 'Route testen', status: 'running', startDate: '2020-01-01', endDate: '2020-01-11', costMoney: 1000, costHours: 40, hypothesisIds: ['H-001'] }),
      xp(2, { title: 'Ofen messen', status: 'done', startDate: '2020-01-05', endDate: '2020-01-08', costMoney: 300, hypothesisIds: ['H-001', 'H-003'] }),
    ],
  });
}

/** Text in ein Feld, `input` und `change`. */
function typeIn(el, v) {
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Auswahl ändern. */
function choose(el, v) {
  el.value = v;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Kommandos, die seit `from` ausgeführt wurden. */
const commandsSince = (h, from) => h.executed.slice(from).map((e) => e.command);

suite('ishikawa experiments: Experimente', () => {
  test('Hinzufügen über den Knopf: leere Zeile mit Nummer und Status geplant; Titel über das Feld', async () => {
    const h = await mount(state());
    assertEqual(h.$('.ishikawa__exp-empty').textContent, tr('de', 'noExperiments'));
    h.$('[data-ref="addExperimentBtn"]').click();
    await settle();
    assertEqual(h.vm().model.experiments.length, 1);
    assertEqual(h.$('tr[data-xid="1"] .ishikawa__nr-text').textContent, '1');
    const status = h.$('[data-xp-status="1"]');
    assertEqual(status.value, 'planned');
    assertTrue(status.classList.contains('ishikawa__expstatus-planned'), 'Statusklasse');
    typeIn(h.$('[data-xp-title="1"]'), 'Route testen');
    typeIn(h.$('[data-xp-desc="1"]'), 'zwei Wochen');
    typeIn(h.$('[data-xp-resp="1"]'), 'Bo');
    await settle();
    const x = h.vm().model.experiments[0];
    assertDeepEqual([x.title, x.description, x.responsible], ['Route testen', 'zwei Wochen', 'Bo']);
  });

  test('Status, Daten und Kosten: Kosten „12“ wird 12, „12,5“ wird 12,5, leer wird null; nie Text', async () => {
    const h = await mount(state({ experiments: [xp(1)] }));
    const money = h.$('[data-xp-money="1"]');
    typeIn(money, '12');
    await settle();
    assertEqual(h.vm().model.experiments[0].costMoney, 12);
    typeIn(money, '12,5');
    await settle();
    assertEqual(h.vm().model.experiments[0].costMoney, 12.5);
    typeIn(money, '');
    await settle();
    assertEqual(h.vm().model.experiments[0].costMoney, null);
    typeIn(h.$('[data-xp-hours="1"]'), '3');
    await settle();
    assertEqual(h.vm().model.experiments[0].costHours, 3);
    typeIn(h.$('[data-xp-start="1"]'), '2020-01-05');
    typeIn(h.$('[data-xp-end="1"]'), '2020-01-09');
    choose(h.$('[data-xp-status="1"]'), 'running');
    await settle();
    const x = h.vm().model.experiments[0];
    assertDeepEqual([x.startDate, x.endDate, x.status], ['2020-01-05', '2020-01-09', 'running']);
    assertTrue(h.$('[data-xp-status="1"]').classList.contains('ishikawa__expstatus-running'), 'Statusklasse folgt');
  });

  test('Löschen fragt nach: Nein lässt stehen, Ja löscht', async () => {
    const h = await mount(state({ experiments: [xp(1, { title: 'A' }), xp(2)] }));
    h.dialog.answer = false;
    h.$('[data-xp-del="1"]').click();
    await settle();
    assertEqual(h.confirms.length, 1);
    assertEqual(h.confirms[0].message, 'modules.ishikawa.delExperimentConfirm{"name":"A"}');
    assertEqual(h.vm().model.experiments.length, 2);
    h.dialog.answer = true;
    h.$('[data-xp-del="1"]').click();
    await settle();
    assertDeepEqual(h.vm().model.experiments.map((x) => x.id), [2]);
  });

  test('Knopf der Verknüpfung: Zahl der Ursachen oder die Aufforderung', async () => {
    const h = await mount(dated());
    assertEqual(h.$('[data-xp-link="1"]').textContent, `1 ${tr('de', 'linked')}`);
    assertEqual(h.$('[data-xp-link="2"]').textContent, `2 ${tr('de', 'linked')}`);
    const vm = h.vm();
    assertEqual(vm.expLinkText(xp(9)), tr('de', 'chooseHypotheses'));
  });

  test('Verantwortlich: Vorschläge aus dem Expertenteam', async () => {
    const h = await mount(state({ experiments: [xp(1)] }));
    assertDeepEqual(h.$$('#ishikawa-resp-list option').map((o) => o.value), ['Anna Schmidt', 'Bo']);
    assertEqual(h.$('[data-xp-resp="1"]').getAttribute('list'), 'ishikawa-resp-list');
  });

  test('Geste: Gruppe experiments, abgeschlossen; Zeilen mit id und Index; Vorschau markiert Zeile und Ziel', async () => {
    const h = await mount(state({ experiments: [xp(1), xp(2), xp(3)] }));
    const body = h.$('tbody[data-reorder-group="experiments"]');
    assertTrue(body !== null && body.hasAttribute('data-reorder-closed'), 'Gruppe');
    assertDeepEqual([...body.querySelectorAll('tr')].map((r) => [r.dataset.id, r.dataset.reorderIndex]), [['1', '0'], ['2', '1'], ['3', '2']]);
    assertTrue(body.querySelector('tr[data-id="1"] .ishikawa__grip--exp') !== null, 'Griff');
    h.vm().state.dragPreview = { kind: 'experiments', index: 1, ids: [1] };
    await settle();
    assertTrue(h.$('tr[data-id="1"]').classList.contains('dmike-table__row--dragging'), 'gezogen');
    assertTrue(h.$('tr[data-id="3"]').classList.contains('dmike-table__row--drop-target'), 'Ziel');
    h.vm().state.dragPreview = { kind: 'facts', index: 1, ids: [1] };
    await settle();
    assertEqual(h.$$('.dmike-table__row--dragging').length, 0);
  });
});

suite('ishikawa experiments: Fakten', () => {
  test('Hinzufügen: Datum heute (lokal); Felder; Löschen mit Rückfrage', async () => {
    const h = await mount(state(), { tab: 'facts' });
    assertEqual(h.$('.ishikawa__exp-empty').textContent, tr('de', 'noFacts'));
    h.$('[data-ref="addFactBtn"]').click();
    await settle();
    const f = h.vm().model.facts[0];
    assertEqual(f.date, todayISO());
    assertEqual(h.$('[data-fact-date="1"]').value, todayISO());
    typeIn(h.$('[data-fact-name="1"]'), 'Stau');
    typeIn(h.$('[data-fact-desc="1"]'), 'jeden Montag');
    typeIn(h.$('[data-fact-owner="1"]'), 'Anna Schmidt');
    typeIn(h.$('[data-fact-date="1"]'), '2020-02-03');
    await settle();
    const g = h.vm().model.facts[0];
    assertDeepEqual([g.name, g.description, g.owner, g.date], ['Stau', 'jeden Montag', 'Anna Schmidt', '2020-02-03']);
    assertDeepEqual(h.$$('#ishikawa-fact-owner-list option').map((o) => o.value), ['Anna Schmidt', 'Bo']);
    h.$('[data-fact-del="1"]').click();
    await settle();
    assertEqual(h.confirms[0].message, 'modules.ishikawa.delFactConfirm{"name":"Stau"}');
    assertEqual(h.vm().model.facts.length, 0);
  });

  test('Geste: Gruppe facts, abgeschlossen; Zeilen mit id und Index', async () => {
    const h = await mount(state({ facts: [fact(4), fact(7)] }), { tab: 'facts' });
    const body = h.$('tbody[data-reorder-group="facts"]');
    assertTrue(body !== null && body.hasAttribute('data-reorder-closed'), 'Gruppe');
    assertDeepEqual([...body.querySelectorAll('tr')].map((r) => [r.dataset.id, r.dataset.reorderIndex]), [['4', '0'], ['7', '1']]);
    assertTrue(body.querySelector('tr[data-id="7"] .ishikawa__grip--fact') !== null, 'Griff');
    h.vm().state.dragPreview = { kind: 'facts', index: 0, ids: [7] };
    await settle();
    assertTrue(h.$('tr[data-id="7"]').classList.contains('dmike-table__row--dragging'), 'gezogen');
    assertTrue(h.$('tr[data-id="4"]').classList.contains('dmike-table__row--drop-target'), 'Ziel');
  });
});

suite('ishikawa experiments: Verknüpfen', () => {
  test('Experiment → Ursachen: Baum mit Nummern und Kategorie, Startwerte; Speichern ist setExperimentHypotheses', async () => {
    const h = await mount(dated());
    h.$('[data-xp-link="2"]').click();
    await settle();
    const { body, api, opts } = h.dialog.open;
    assertEqual(opts.title, tr('de', 'chooseHypotheses'));
    assertEqual(body.querySelector('.ishikawa__hyp-pick-hint').textContent, tr('de', 'chooseHypothesesHint'));
    const boxes = [...body.querySelectorAll('input[data-stable-id]')];
    assertDeepEqual(boxes.map((b) => b.dataset.stableId), ['H-001', 'H-002', 'H-003']);
    assertDeepEqual(boxes.map((b) => b.checked), [true, false, true]);
    const rows = [...body.querySelectorAll('.ishikawa__hyp-pick-row')];
    assertDeepEqual(rows.map((r) => r.querySelector('.ishikawa__hyp-pick-num').textContent), ['1', '1.1', '2']);
    assertEqual(rows[1].querySelector('.ishikawa__hyp-pick-cat').textContent, tr('de', 'cat.man'), 'Unterursache mit geerbter Kategorie');
    assertEqual(rows[0].querySelector('.ishikawa__hyp-pick-name').textContent, 'Fahrer');
    const from = h.executed.length;
    boxes[1].click();
    boxes[2].click();
    await settle();
    api.confirm();
    await settle();
    assertEqual(h.dialog.open, null);
    assertDeepEqual(commandsSince(h, from), ['setExperimentHypotheses']);
    assertDeepEqual(h.vm().model.experiments[1].hypothesisIds, ['H-001', 'H-002']);
  });

  test('Ursache → Experimente: Knopf der Ursachenzeile; Hinweis mit Namen; Speichern ist ein Kommando setCauseExperiments', async () => {
    const h = await mount(dated(), { tab: 'hypotheses' });
    const btn = h.$('[data-link-exp="3"]');
    assertEqual(btn.getAttribute('data-help-key'), 'modules.ishikawa.actions.setCauseExperiments.help');
    btn.click();
    await settle();
    const { body, api, opts } = h.dialog.open;
    assertEqual(opts.title, tr('de', 'linkExperimentsTitle'));
    assertEqual(body.querySelector('.ishikawa__hyp-pick-hint').textContent, tr('de', 'chooseExperimentsHint', { name: 'Ofen' }));
    const boxes = [...body.querySelectorAll('input[data-exp-id]')];
    assertDeepEqual(boxes.map((b) => b.dataset.expId), ['1', '2']);
    assertDeepEqual(boxes.map((b) => b.checked), [false, true]);
    const first = body.querySelector('.ishikawa__hyp-pick-row');
    assertEqual(first.querySelector('.ishikawa__hyp-pick-name').textContent, 'Route testen');
    assertEqual(first.querySelector('.ishikawa__hyp-pick-cat').textContent, '2020-01-01 → 2020-01-11');
    assertEqual(first.querySelector('.ishikawa__exp-link-status').textContent, tr('de', 'expStatus.running'));
    assertTrue(first.querySelector('.ishikawa__exp-link-status').classList.contains('ishikawa__expstatus-running'), 'Statusklasse');
    const from = h.executed.length;
    boxes[0].click();
    boxes[1].click();
    await settle();
    api.confirm();
    await settle();
    assertEqual(h.dialog.open, null);
    assertDeepEqual(commandsSince(h, from), ['setCauseExperiments']);
    assertDeepEqual(h.vm().model.experiments.map((x) => x.hypothesisIds), [['H-001', 'H-003'], ['H-001']]);
  });

  test('Ursache ohne Experimente: Hinweis im Dialog; unverändert schließt ohne Kommando', async () => {
    const h = await mount(state(), { tab: 'hypotheses' });
    h.$('[data-link-exp="1"]').click();
    await settle();
    const { body, api } = h.dialog.open;
    const empty = body.querySelector('.ishikawa__no-items');
    assertEqual(empty.textContent, tr('de', 'noExperimentsToLink'));
    assertTrue(empty.style.display !== 'none', 'Hinweis sichtbar');
    const from = h.executed.length;
    api.confirm();
    await settle();
    assertEqual(h.dialog.open, null);
    assertDeepEqual(commandsSince(h, from), []);
  });
});

suite('ishikawa experiments: Diagramme', () => {
  test('ohne datierte Experimente: Hinweise, kein Diagramm, Wirt ohne feste Höhe', async () => {
    const h = await mount(state({ experiments: [xp(1, { costMoney: 5 })] }));
    const vm = h.vm();
    assertEqual(vm.ganttChart, null);
    assertEqual(vm.costChart, null);
    assertEqual(vm.costRateChart, null);
    assertEqual(h.$('[data-ref="ganttCanvas"]').previousElementSibling.textContent, tr('de', 'ganttNoData'));
    assertDeepEqual(h.$$('.ishikawa__gantt-empty').map((e) => e.textContent), [tr('de', 'ganttNoData'), tr('de', 'costChartNoData'), tr('de', 'costChartNoData')]);
    assertEqual(vm.ganttHostStyle, '');
    assertEqual(vm.costHostStyle, '');
    assertEqual(h.$('[data-ref="ganttCanvas"]').style.height, '');
    assertEqual(h.$('[data-ref="ganttCanvas"] svg'), null);
  });

  test('Gantt: Statusfarben, Heute aus der Übersetzung; Wirtshöhe aus der Zeilenzahl', async () => {
    const h = await mount(dated());
    const cfg = h.vm().ganttChart;
    assertDeepEqual(cfg.tasks.map((t) => [t.label, t.color]), [
      ['Route testen', 'var(--ishikawa-status-running)'], ['Ofen messen', 'var(--ishikawa-status-done)'],
    ]);
    assertEqual(cfg.todayLabel, 'Heute');
    assertEqual(h.vm().ganttHostStyle, 'height:106px');
    assertEqual(h.$('[data-ref="ganttCanvas"]').style.height, '106px');
    assertTrue(h.$('[data-ref="ganttCanvas"] svg') !== null, 'gezeichnet');
    assertEqual(h.$$('.ishikawa__gantt-empty').length, 0);
  });

  test('Kosten: zwei Diagramme, Einheiten und Beschriftungen de; Wirtshöhe fest', async () => {
    const h = await mount(dated());
    const vm = h.vm();
    assertEqual(vm.costChart.mode, 'cumulative');
    assertDeepEqual([vm.costChart.moneyUnit, vm.costChart.hoursUnit], ['€', 'h']);
    assertDeepEqual([vm.costRateChart.mode, vm.costRateChart.moneyUnit, vm.costRateChart.hoursUnit], ['rate', '€/Tag', 'h/Tag']);
    assertDeepEqual([vm.costChart.moneyLabel, vm.costChart.hoursLabel], [tr('de', 'costMoney'), tr('de', 'costHours')]);
    assertEqual(vm.costChart.tickLabels[0], '01.01.');
    assertEqual(vm.costHostStyle, 'height:184px');
    assertEqual(h.$('[data-ref="costChartCanvas"]').style.height, '184px');
    assertEqual(h.$('[data-ref="costRateChartCanvas"]').style.height, '184px');
    assertTrue(h.$('[data-ref="costChartCanvas"] svg') !== null && h.$('[data-ref="costRateChartCanvas"] svg') !== null, 'gezeichnet');
  });

  test('Einheiten und Datum en', async () => {
    const h = await mount(dated(), { lang: 'en' });
    const vm = h.vm();
    assertDeepEqual([vm.costRateChart.moneyUnit, vm.costRateChart.hoursUnit], ['€/day', 'h/day']);
    assertEqual(vm.ganttChart.todayLabel, 'Today');
    assertEqual(vm.ganttChart.tickLabels[0], '01/01');
  });

  test('Titel ändern zeichnet den Gantt neu', async () => {
    const h = await mount(dated());
    typeIn(h.$('[data-xp-title="1"]'), 'Neue Route');
    await settle();
    const texts = h.$$('[data-ref="ganttCanvas"] svg text').map((t) => t.textContent);
    assertTrue(texts.includes('Neue Route'), 'neuer Titel im SVG');
    assertTrue(!texts.includes('Route testen'), 'alter Titel weg');
  });

  test('ohne Start, Ende vor Start, Kosten null: kein Fehler, kein NaN, Wirtshöhe mindestens 80 px', async () => {
    const h = await mount(state({
      experiments: [
        xp(1, { title: 'ohne Start', endDate: '2020-01-10', costMoney: 10 }),
        xp(2, { title: 'rückwärts', startDate: '2020-01-10', endDate: '2020-01-02', costMoney: null, costHours: 4 }),
        xp(3, { title: 'ohne Kosten', startDate: '2020-01-03', endDate: '2020-01-04' }),
      ],
    }));
    const vm = h.vm();
    assertDeepEqual(vm.ganttChart.tasks.map((t) => t.label), ['rückwärts', 'ohne Kosten']);
    assertTrue(h.$('[data-ref="ganttCanvas"] svg') !== null, 'Gantt gezeichnet');
    assertTrue(h.$('[data-ref="costChartCanvas"] svg') !== null, 'Kosten gezeichnet');
    assertTrue(!h.container.innerHTML.includes('NaN'), 'kein NaN');
    assertTrue(parseFloat(h.$('[data-ref="ganttCanvas"]').style.height) >= 80, 'Mindesthöhe');
    assertTrue(parseFloat(h.$('[data-ref="costChartCanvas"]').style.height) >= 80, 'Mindesthöhe Kosten');
  });

  test('„Heute“ wird beim Rechnen gelesen', async () => {
    const before = Date.now();
    const h = await mount(dated());
    typeIn(h.$('[data-xp-title="2"]'), 'neu');
    await settle();
    const now = h.vm().ganttChart.now;
    assertTrue(now >= before && now <= Date.now(), 'jetzt');
  });
});

suite('ishikawa experiments: Aufbau der view-Teile', () => {
  const PARTS = ['problem.js', 'causes.js', 'snapshots.js', 'experiments.js'];
  const IMPORT = /^\s*import\s[^'"]*['"]([^'"]+)['"]/gm;
  const PRIVATE = /\bthis\.#|^\s*(?:static\s+)?#[A-Za-z_$][\w$]*\s*(?:=|\(|;)/;
  const source = async (file) => (await fetch(new URL(`../../../js/modules/${ID}/viewmodel/${file}`, import.meta.url), { cache: 'no-cache' })).text();

  for (const file of PARTS) {
    test(`${file} importiert keinen anderen view-Teil und nicht viewmodel.js`, async () => {
      const bad = [...(await source(file)).matchAll(IMPORT)].map((m) => m[1])
        .filter((spec) => ['./viewmodel.js', ...PARTS.map((p) => `./${p}`)].includes(spec));
      assertDeepEqual(bad, [], `${file}: view-Teile kennen einander nicht`);
    });

    test(`${file} hat keine #private-Glieder`, async () => {
      const hits = (await source(file)).split('\n').filter((line) => PRIVATE.test(line));
      assertDeepEqual(hits, [], `${file}: Alpines Proxy erreicht #private nicht`);
    });
  }
});
