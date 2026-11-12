/**
 * Ishikawa: view-Teil Ursachen (viewmodel/causes.js) im Browser — das echte
 * Modul mit der echten Vorlage resources/view.html, den deutschen Texten aus
 * resources/i18n/ui.de.json und Attrappen für stateManager, Event-Bus,
 * Dialog, Meldungen und chartManager. Prüft Expertenteam, Baum (Reihenfolge,
 * Filter, Einklappen, Geste), Bewertungen, Kategorien und Pareto.
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

const ids = (h) => h.vm().visibleRows.map((v) => v.row.id);
const lastChart = (h) => h.chartCalls.filter((c) => c[0] === 'create').at(-1)?.[3] ?? null;

suite('ishikawa causes: Experten', () => {
  test('Hinzufügen über das Formular: Name getrimmt, Feld geleert; doppelter Name wird abgelehnt', async () => {
    const h = await mount();
    const input = h.$('[data-ref="expertNameInput"]');
    typeIn(input, '  Max Mustermann ');
    h.$('.ishikawa__expert-add-form').requestSubmit();
    await settle();
    assertDeepEqual(h.vm().model.experts.map((e) => e.name), ['Max Mustermann']);
    assertEqual(input.value, '');
    assertEqual(h.$$('.ishikawa__expert-tag').length, 1);
    typeIn(input, 'max mustermann');
    h.$('.ishikawa__expert-add-form').requestSubmit();
    await settle();
    assertEqual(h.vm().model.experts.length, 1);
    assertEqual(input.getAttribute('aria-invalid'), 'true');
  });

  test('Umbenennen beim Verlassen; doppelter Name meldet sich und stellt das Feld zurück', async () => {
    const h = await mount(tree());
    const field = h.$('[data-expert-name-id="1"]');
    field.value = 'Anna S.';
    field.dispatchEvent(new Event('blur'));
    await settle();
    assertEqual(h.vm().model.experts[0].name, 'Anna S.');
    field.value = 'bo';
    field.dispatchEvent(new Event('blur'));
    await settle();
    assertEqual(h.vm().model.experts[0].name, 'Anna S.');
    assertEqual(field.value, 'Anna S.');
    assertEqual(h.notes.at(-1)[0], 'Ein Experte mit diesem Namen existiert bereits.');
  });

  test('Escape stellt den Namen wieder her, leer ändert nichts', async () => {
    const h = await mount(tree());
    const field = h.$('[data-expert-name-id="2"]');
    field.value = 'Neu';
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assertEqual(field.value, 'Bo');
    field.value = '   ';
    field.dispatchEvent(new Event('blur'));
    await settle();
    assertEqual(h.vm().model.experts[1].name, 'Bo');
    assertEqual(field.value, 'Bo');
  });

  test('Entfernen-Knopf entfernt den Experten samt Bewertungen; Initialen', async () => {
    const h = await mount(tree());
    assertEqual(h.$('[data-expert-ini-for="1"]').textContent, 'AS');
    assertEqual(h.vm().ini('bo'), 'BO');
    h.$('.ishikawa__expert-rm[data-expert-id="1"]').click();
    await settle();
    assertDeepEqual(h.vm().model.experts.map((e) => e.id), [2]);
    assertDeepEqual({ ...h.vm().model.rows[0].ratings }, { 2: 8 });
    assertEqual(h.$$('th.ishikawa__col-expert').length, 1);
  });
});

suite('ishikawa causes: Baum', () => {
  test('visibleRows: Baumreihenfolge, Nummern, Tiefe, wirksame Kategorie', async () => {
    const h = await mount(tree());
    const vr = h.vm().visibleRows;
    assertDeepEqual(vr.map((v) => v.row.id), [1, 2, 3, 4, 5]);
    assertDeepEqual(vr.map((v) => v.num), ['1', '1.1', '1.1.1', '2', '3']);
    assertDeepEqual(vr.map((v) => v.depth), [0, 1, 2, 0, 0]);
    assertDeepEqual(vr.map((v) => v.effCat), ['man', 'man', 'man', 'machine', '']);
    assertDeepEqual(vr.map((v) => v.hasKids), [true, true, false, false, false]);
    assertDeepEqual(h.$$('tbody tr[data-id]').map((tr) => tr.dataset.id), ['1', '2', '3', '4', '5']);
    assertDeepEqual(h.$$('tbody tr[data-id]').map((tr) => tr.dataset.reorderIndex), ['0', '1', '2', '3', '4']);
    assertTrue(h.$('tr[data-id="3"]').classList.contains('ishikawa__depth-2'), h.$('tr[data-id="3"]').className);
    assertEqual(h.$('tr[data-id="2"] .ishikawa__cat-inherited').textContent, 'Mensch');
  });

  test('Filter über die Chips: wirksame Kategorie samt Unterursachen; leer zeigt alle; Zählung je Kategorie', async () => {
    const h = await mount(tree());
    assertEqual(h.$('[data-filter="man"] .ishikawa__filter-chip-count').textContent, '(3)');
    assertEqual(h.$('[data-filter="all"] .ishikawa__filter-chip-count').textContent, '(5)');
    h.$('[data-filter="man"]').click();
    await settle();
    assertEqual(h.vm().state.filter, 'man');
    assertDeepEqual(ids(h), [1, 2, 3]);
    assertTrue(h.$('[data-filter="man"]').classList.contains('ishikawa__filter-chip--active'));
    h.$('[data-filter="all"]').click();
    await settle();
    assertEqual(h.vm().state.filter, '');
    assertEqual(ids(h).length, 5);
  });

  test('setFilter (Kommando) und leere Kategorie: Text „keine in dieser Kategorie“', async () => {
    const h = await mount(tree());
    h.vm().setFilter({ category: 'material' });
    await settle();
    assertDeepEqual(ids(h), []);
    assertEqual(h.$('.ishikawa__empty-row td').textContent, 'Keine Hypothesen in dieser Kategorie.');
    assertThrows(() => h.vm().setFilter({ category: 'money' }), /category/);
  });

  test('Einklappen verbirgt den Teilbaum; alle zu, alle auf', async () => {
    const h = await mount(tree());
    h.$('[data-toggle="1"]').click();
    await settle();
    assertDeepEqual(ids(h), [1, 4, 5]);
    assertDeepEqual([...h.vm().state.collapsed], [1]);
    h.vm().expandAll();
    await settle();
    assertEqual(ids(h).length, 5);
    h.vm().collapseAll();
    await settle();
    assertDeepEqual(ids(h), [1, 4, 5]);
    h.vm().toggleCollapse(1);
    await settle();
    assertDeepEqual(ids(h), [1, 2, 4, 5]);
  });

  test('Unterursache über den Knopf klappt den Elternknoten auf und hängt hinter den Teilbaum', async () => {
    const h = await mount(tree());
    h.vm().collapseAll();
    await settle();
    h.$('[data-add-sub="1"]').click();
    await settle();
    assertTrue(!h.vm().state.collapsed.includes(1), JSON.stringify(h.vm().state.collapsed));
    assertDeepEqual(ids(h).slice(0, 4), [1, 2, 6, 4]);
    assertEqual(h.vm().model.rows.find((r) => r.id === 6).parentId, 1);
  });

  test('afterAddSubRow auch ohne Oberfläche: model.addSubRow (wie der Agent) klappt auf', async () => {
    const h = await mount(tree());
    h.vm().state.collapsed = [2];
    h.vm().model.addSubRow({ parentId: 2 });
    await settle();
    assertDeepEqual([...h.vm().state.collapsed], []);
  });

  test('Hauptursache über den Knopf: am Ende, Namensfeld fokussiert', async () => {
    const h = await mount(tree());
    h.$('[data-ref="addRowBtn"]').click();
    await settle();
    assertDeepEqual(ids(h), [1, 2, 3, 4, 5, 6]);
    assertEqual(document.activeElement, h.$('tr[data-id="6"] .ishikawa__name-input'));
  });

  test('duplicateRow hängt „ (Kopie)“ an und kopiert den Teilbaum', async () => {
    const h = await mount(tree());
    h.$('[data-dupe="1"]').click();
    await settle();
    const names = h.vm().visibleRows.map((v) => v.row.name);
    assertDeepEqual(names, ['Fahrer', 'Ortskenntnis', 'Navi', 'Fahrer (Kopie)', 'Ortskenntnis', 'Navi', 'Ofen', 'Wetter']);
    assertEqual(h.vm().duplicateRow({ rowId: 4 }), 9);
    assertEqual(h.vm().model.rows.find((r) => r.id === 9).name, 'Ofen (Kopie)');
  });

  test('Löschen fragt mit delRowConfirmWithSubs, danach ist der Teilbaum weg', async () => {
    const h = await mount(tree({ experiments: [] }));
    h.vm().state.collapsed = [2];
    h.$('[data-del-row="1"]').click();
    await until(() => h.vm().model.rows.length === 2);
    assertTrue(h.confirms[0].message.startsWith('modules.ishikawa.delRowConfirmWithSubs'), h.confirms[0].message);
    assertDeepEqual(ids(h), [4, 5]);
    assertDeepEqual([...h.vm().state.collapsed], []);
  });

  test('Name, Beschreibung, Kategorie und Status schreiben ins Model; doppelter Name ist markiert', async () => {
    const h = await mount(tree());
    typeIn(h.$('[data-row-name="5"]'), 'Ofen');
    typeIn(h.$('[data-row-desc="5"]'), 'zu heiß');
    const cat = h.$('[data-row-cat="5"]');
    cat.value = 'environment';
    cat.dispatchEvent(new Event('change', { bubbles: true }));
    const st = h.$('[data-row-status="5"]');
    st.value = 'confirmed';
    st.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    const r = h.vm().model.rows.find((x) => x.id === 5);
    assertDeepEqual([r.name, r.description, r.category, r.status], ['Ofen', 'zu heiß', 'environment', 'confirmed']);
    assertTrue(h.$('[data-row-name="5"]').classList.contains('ishikawa__name-input--dup'));
    assertTrue(h.$('[data-row-status="5"]').classList.contains('ishikawa__status-confirmed'));
    assertEqual(h.$('[data-row-cat="2"]'), null);
  });

  test('Vorschau der Geste: Teilbaum als Block, Einfügemarke an der Zielzeile', async () => {
    const h = await mount(tree());
    h.vm().state.dragPreview = { kind: 'tree', index: 0, ids: [4] };
    await settle();
    assertTrue(h.$('tr[data-id="4"]').classList.contains('dmike-table__row--dragging'));
    assertTrue(h.$('tr[data-id="1"]').classList.contains('dmike-table__row--drop-target'));
    h.vm().state.dragPreview = { kind: 'tree', index: 3, ids: [1, 2, 3] };
    await settle();
    for (const id of ['1', '2', '3']) assertTrue(h.$(`tr[data-id="${id}"]`).classList.contains('dmike-table__row--dragging'), id);
    assertTrue(h.$('tr[data-id="5"]').classList.contains('dmike-table__row--drop-target'), h.$('tr[data-id="5"]').className);
    h.vm().state.dragPreview = null;
    await settle();
    assertEqual(h.$$('.dmike-table__row--dragging, .dmike-table__row--drop-target').length, 0);
  });

  test('Ziehen über den eigenen Teilbaum ergibt kein Kommando, über eine andere Zeile moveRowBefore', async () => {
    const h = await mount(tree());
    const grip = h.$('tr[data-id="1"] .ishikawa__grip--tree');
    // Obere Hälfte einer Zeile: Einfügen vor ihr.
    const upper = (id) => { const b = h.$(`tr[data-id="${id}"]`).getBoundingClientRect(); return [b.left + 10, b.top + b.height / 4]; };
    const center = (id) => { const b = h.$(`tr[data-id="${id}"]`).getBoundingClientRect(); return [b.left + 10, b.top + b.height / 2]; };
    const pointer = (type, [x, y]) => grip.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, clientX: x, clientY: y,
    }));
    const drag = (to) => {
      const from = center(1);
      pointer('pointerdown', from);
      for (let i = 1; i <= 4; i++) pointer('pointermove', [from[0], from[1] + (to[1] - from[1]) * i / 4]);
      pointer('pointerup', to);
    };
    const before = JSON.stringify(h.vm().model.rows);
    drag(upper(3));
    await settle();
    assertEqual(JSON.stringify(h.vm().model.rows), before);
    assertEqual(h.executed.filter((e) => e.command === 'moveRowBefore').length, 0);
    assertDeepEqual(h.notes.filter(([, t]) => t === 'error'), []);
    drag(upper(5));
    await settle();
    assertEqual(h.executed.filter((e) => e.command === 'moveRowBefore').length, 1);
    assertDeepEqual(ids(h), [4, 1, 2, 3, 5]);
  });
});

suite('ishikawa causes: Bewertungen', () => {
  test('Eingabe begrenzt auf 0–9, leer löscht; Klasse der Stufe am Feld', async () => {
    const h = await mount(tree());
    const cell = h.$('[data-rating-row="5"][data-rating-exp="1"]');
    cell.value = '12';
    cell.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    assertEqual(h.vm().model.rows.find((r) => r.id === 5).ratings[1], 9);
    assertEqual(cell.value, '9');
    assertTrue(cell.classList.contains('ishikawa__rating--9'), cell.className);
    cell.value = '';
    cell.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    assertEqual(h.vm().model.rows.find((r) => r.id === 5).ratings[1], undefined);
    assertTrue(!cell.className.includes('ishikawa__rating--'), cell.className);
  });

  test('ratingClass, scoreBar, Score-Zelle im Zahlformat der Sprache', async () => {
    const h = await mount(tree());
    const vm = h.vm();
    assertEqual(vm.ratingClass(0), 'ishikawa__rating--0');
    assertEqual(vm.ratingClass(undefined), '');
    assertDeepEqual(vm.scoreBar(9), { level: 'high', pct: 100 });
    assertDeepEqual(vm.scoreBar(4.5), { level: 'mid', pct: 50 });
    assertEqual(vm.scoreBar(2).level, 'low');
    assertEqual(h.$('tr[data-id="1"] .ishikawa__score-badge').textContent, '7,0');
    assertTrue(h.$('tr[data-id="1"] .ishikawa__score-badge').classList.contains('ishikawa__score-high'));
    const bar = h.$('tr[data-id="1"] .ishikawa__score-bar-fill');
    assertTrue(bar.classList.contains('ishikawa__score-bar--high'), bar.className);
    assertTrue(bar.getAttribute('style').includes('width:77.7'), bar.getAttribute('style'));
    assertEqual(h.$('tr[data-id="3"] .ishikawa__score-badge').textContent, '–');
  });

  test('Zusammenfassung: Haupt/Sub, höchster Score, bestätigt, verknüpfte Experimente', async () => {
    const h = await mount(tree({
      experiments: [{ id: 1, title: 'A', description: '', responsible: '', status: 'planned', startDate: '', endDate: '', costMoney: null, costHours: null, hypothesisIds: ['H-001'] }],
    }));
    const vm = h.vm();
    vm.model.setRowField({ rowId: 4, status: 'confirmed' });
    assertEqual(vm.summaryBreakdown, '(3 Haupt · 2 Sub)');
    assertEqual(vm.topScore, '9,0');
    assertEqual(vm.confirmedCount, 1);
    assertEqual(vm.linkedExpCount(vm.model.rows[0]), 1);
    assertEqual(vm.linkExpTitle(vm.model.rows[0]), '1 verknüpfte Versuche – klicken zum Bearbeiten');
    assertEqual(vm.linkExpTitle(vm.model.rows[3]), 'Versuche verknüpfen');
  });
});

suite('ishikawa causes: Kategorien', () => {
  test('Umbenennen über den Dialog: Startwerte aus catLabels, Speichern schreibt', async () => {
    const h = await mount(tree({ catLabels: { man: 'Personal', machine: '', environment: '', material: '', measurement: '', method: '' } }));
    h.$('[data-ref="renameCatsBtn"]').click();
    await settle();
    const { body, api, opts } = h.dialog.open;
    assertEqual(opts.title, '6M-Kategorien umbenennen');
    assertEqual(body.querySelector('[data-cat-key="man"]').value, 'Personal');
    typeIn(body.querySelector('[data-cat-key="machine"]'), 'Anlage');
    api.confirm();
    await settle();
    assertEqual(h.dialog.open, null);
    assertEqual(h.vm().model.catLabels.machine, 'Anlage');
    assertEqual(h.vm().catLabel('machine'), 'Anlage');
    assertEqual(h.$('[data-filter="machine"] span').textContent, 'Anlage');
  });

  test('doppelter Name hält den Dialog offen und schreibt nichts', async () => {
    const h = await mount(tree());
    h.$('[data-ref="renameCatsBtn"]').click();
    await settle();
    const { body, api } = h.dialog.open;
    typeIn(body.querySelector('[data-cat-key="man"]'), 'Team');
    typeIn(body.querySelector('[data-cat-key="machine"]'), 'team');
    api.confirm();
    await settle();
    assertTrue(h.dialog.open !== null, 'Dialog geschlossen');
    assertEqual(h.vm().model.catLabels.man, '');
    api.cancel();
    await settle();
  });

  test('setCategoryLabels: unbenannte bleiben, gleich dem Standardnamen einer anderen oder unbekannter Schlüssel → Ablehnung', async () => {
    const h = await mount(tree());
    const vm = h.vm();
    vm.setCategoryLabels({ labels: { man: ' Personal ' } });
    assertEqual(vm.model.catLabels.man, 'Personal');
    assertEqual(vm.catLabel('machine'), 'Maschine');
    assertThrows(() => vm.setCategoryLabels({ labels: { man: 'maschine' } }), /labels/);
    let clash = null;
    try { vm.setCategoryLabels({ labels: { man: 'maschine' } }); } catch (err) { clash = err; }
    assertEqual(clash?.hintKey, 'renameCatsDuplicate');
    assertThrows(() => vm.setCategoryLabels({ labels: { money: 'Geld' } }), /labels/);
    assertEqual(vm.model.catLabels.man, 'Personal');
  });
});

suite('ishikawa causes: Pareto', () => {
  test('paretoChart: absteigend, Farbe der wirksamen Kategorie (auch Unterursachen), Sammelposten, rechte Achse', async () => {
    const h = await mount(tree());
    const cfg = h.vm().paretoChart;
    assertDeepEqual(cfg.items, [
      { name: 'Ortskenntnis', value: 9, color: 'var(--ishikawa-cat-man)' },
      { name: 'Fahrer', value: 7, color: 'var(--ishikawa-cat-man)' },
      { name: 'Wetter', value: 4 },
      { name: 'Ofen', value: 2, color: 'var(--ishikawa-cat-machine)' },
    ]);
    assertEqual(cfg.otherBucket, true);
    assertEqual(cfg.rightYLabel, 'Kumulativ %');
    assertEqual(cfg.yLabel, 'Ø Bewertung');
    assertEqual(cfg.showXTicks, false);
    await until(() => lastChart(h) !== null);
    assertEqual(lastChart(h).type, 'pareto');
    assertEqual(h.$('.ishikawa__pareto-body .ishikawa__trend-empty'), null);
  });

  test('ohne Bewertung: kein Diagramm, Hinweis', async () => {
    const h = await mount({ _schema: { version: '1.0' }, rows: [row(1, null)] });
    assertEqual(h.vm().paretoChart, null);
    assertEqual(h.$('.ishikawa__pareto-body .ishikawa__trend-empty').textContent, 'Keine Hypothesen mit Bewertungen vorhanden.');
    assertEqual(h.chartCalls.length, 0);
  });

  test('Umbenennen einer Ursache zeichnet das Pareto neu', async () => {
    const h = await mount(tree());
    await until(() => lastChart(h) !== null);
    typeIn(h.$('[data-row-name="4"]'), 'Backofen');
    await settle();
    const names = (lastChart(h).config.items ?? []).map((i) => i.name);
    assertTrue(names.includes('Backofen'), JSON.stringify(names));
  });

  test('Quelle Snapshot, Heilung nach Löschen; Auswahl über das Feld', async () => {
    const snap = { id: 3, name: 'Alt', date: '2026-01-01T00:00:00.000Z', data: { problem: '', experts: [{ id: 1, name: 'A', color: '#6366f1' }], rows: [row(1, null, 'method', { name: 'Damals', ratings: { 1: 5 } })] } };
    const h = await mount(tree({ snapshots: [snap] }));
    const select = h.$('[data-ref="paretoSelect"]');
    select.value = 'snap-3';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    assertEqual(h.vm().state.paretoSnapId, 3);
    assertDeepEqual(h.vm().paretoChart.items, [{ name: 'Damals', value: 5, color: 'var(--ishikawa-cat-method)' }]);
    assertEqual(h.vm().paretoSourceValue, 'snap-3');
    h.vm().model.removeSnapshot({ snapshotId: 3 });
    await settle();
    assertEqual(h.vm().paretoSourceValue, 'current');
    assertEqual(h.vm().paretoChart.items.length, 4);
    h.vm().setParetoSource({ snapshotId: null });
    assertEqual(h.vm().state.paretoSnapId, null);
    assertThrows(() => h.vm().setParetoSource({ snapshotId: 99 }), /snapshotId/);
  });

  test('Editor des Widgets: Änderung landet in model.paretoEdits und übersteht den Neuaufbau', async () => {
    const h = await mount(tree());
    await until(() => lastChart(h) !== null);
    const chart = lastChart(h);
    chart.config.refLineValue = 70;
    chart.config.onEditorChange(chart);
    await settle();
    assertEqual(h.vm().model.paretoEdits.refLineValue, 70);
    const creates = h.chartCalls.filter((c) => c[0] === 'create').length;
    h.lang.current = 'en';
    mod.onLanguageChange();
    await settle();
    h.vm().state.tab = 'hypotheses';
    await until(() => h.chartCalls.filter((c) => c[0] === 'create').length > creates);
    assertEqual(h.vm().model.paretoEdits.refLineValue, 70);
    assertEqual(lastChart(h).config.refLineValue, 70);
  });
});
