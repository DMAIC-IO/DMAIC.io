/**
 * TRIZ-Funktionsanalyse: das Viewmodel im Browser (viewmodel/viewmodel.js) mit
 * dem echten Modul, der echten Vorlage resources/view.html und Attrappen für
 * stateManager, Event-Bus, Dialog und Meldungen. Prüft die Verdrahtung des
 * view-Blocks: Getter und computed, das Viewmodel-Kommando select, die Handler
 * mit Ablehnung und den Bildexport.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import mod from '../../js/modules/triz-function-analysis/viewmodel/viewmodel.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerCommandDirectives } from '../../js/core/command-directives.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { formatCurrency } from '../../js/core/number-format.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { WIDGET_I18N } from '../widget-i18n.js';

const ID = 'triz-function-analysis';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 4; i++) await flush(); };
const mounted = [];
let ready = false;

/** Echte Vorlage unter ihrem Schlüssel; Direktiven wie in app.js. */
async function ensureTemplate() {
  if (ready) return;
  registerFieldDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
  registerWidgetDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
  registerCommandDirectives(Alpine);
  if (!Alpine.version) Alpine.start();
  if (!document.querySelector(`template[data-tpl="${TPL_KEY}"]`)) {
    const html = await (await fetch(new URL(`../../${TPL_KEY}`, import.meta.url), { cache: 'no-cache' })).text();
    const tpl = document.createElement('template');
    tpl.setAttribute('data-tpl', TPL_KEY);
    tpl.innerHTML = html;
    document.body.append(tpl);
  }
  ready = true;
}

/** @returns {Promise<object>} Zahnbürsten-Beispiel (Modulzustand) */
async function toothbrush() {
  const url = new URL(`../../js/modules/${ID}/resources/examples/projects/triz-function-analysis-toothbrush.json`, import.meta.url);
  return (await fetch(url, { cache: 'no-cache' })).json();
}

/**
 * Modul einhängen.
 * @param {object|null} [model] gespeicherter Zustand der Instanz
 */
async function mount(model = null) {
  await ensureTemplate();
  while (mounted.length) mounted.pop().remove();
  const states = { 'tfa-1': model };
  const notes = [];
  const handlers = [];
  const bus = {
    on: (n, fn) => handlers.push([n, fn]),
    off: (n, fn) => { const i = handlers.findIndex(([a, f]) => a === n && f === fn); if (i >= 0) handlers.splice(i, 1); },
    emit: (n, p) => { for (const [a, f] of [...handlers]) if (a === n) f(p); },
  };
  const context = {
    instanceId: 'tfa-1',
    stateManager: {
      get: () => undefined,
      getModuleState: (id) => states[id] ?? null,
      setModuleState: (id, s) => { states[id] = s; },
      getProjectCycle: () => 'dmaic',
    },
    i18n: { t: (k) => k, tf: () => (k) => k, getLanguage: () => 'de' },
    eventBus: bus,
    notify: (msg) => notes.push(msg),
    dialog: { confirm: async () => true, show: () => ({ close() {}, setTitle() {} }) },
    theme: 'light',
    language: 'de',
  };
  const container = document.createElement('div');
  document.body.append(container);
  mounted.push(container);
  await mod.init(container, context);
  await settle();
  const vm = () => Alpine.$data(container.querySelector('[x-data]'));
  return { container, vm, notes, $: (s) => container.querySelector(s) };
}

/** @param {any} vm @param {string} id */
const nodeOf = (vm, id) => vm.diagram.nodes.find((n) => n.id === id);

suite('triz-function-analysis: Viewmodel im Browser', () => {
  test('vcRows: Kosten über formatCurrency, leere Kosten „–“', async () => {
    const data = await toothbrush();
    data.components.find((c) => c.id === 'c-kopf').cost = null;
    const { vm } = await mount(data);
    const rows = vm().vcRows;
    assertEqual(rows[0].id, 'c-borsten');
    assertEqual(rows[0].cost, formatCurrency(0.06, 'EUR', 'de'));
    assertEqual(rows.find((r) => r.id === 'c-kopf').cost, '–');
    assertEqual(rows.find((r) => r.id === 'c-kopf').normCost, '–');
  });

  test('valueCostEmpty: ohne Komponenten der Hinweis vc.emptyComponents', async () => {
    const { vm } = await mount();
    assertEqual(vm().valueCostEmpty(), 'vc.emptyComponents');
  });

  test('select schaltet um, mit toggle false bleibt die Auswahl', async () => {
    const { vm } = await mount(await toothbrush());
    vm().select({ id: 'c-griff' });
    assertEqual(vm().state.selectedId, 'c-griff');
    vm().select({ id: 'c-griff' });
    assertEqual(vm().state.selectedId, null);
    vm().select({ id: 'c-griff', toggle: false });
    vm().select({ id: 'c-griff', toggle: false });
    assertEqual(vm().state.selectedId, 'c-griff');
  });

  test('toggleCell auf einem genutzten Paar: Meldung pairLocked, Model unverändert', async () => {
    const { vm, notes } = await mount(await toothbrush());
    const before = JSON.stringify([vm().model.interactions, vm().model.exclusions]);
    const comps = vm().matrixComponents;
    const belag = comps.find((c) => c.id === 'c-belag');
    const borsten = comps.find((c) => c.id === 'c-borsten');
    await vm().toggleCell(belag, borsten);
    assertDeepEqual(notes, ['pairLocked']);
    assertEqual(JSON.stringify([vm().model.interactions, vm().model.exclusions]), before);
  });

  test('kindChanged auf ein zweites Ziel: Meldung targetDemoted, altes Ziel wird Systemkomponente', async () => {
    const { vm, notes } = await mount(await toothbrush());
    const griff = vm().model.components.find((c) => c.id === 'c-griff');
    await vm().kindChanged(griff, { target: { value: 'target' } });
    assertDeepEqual(notes, ['targetDemoted']);
    assertEqual(vm().model.components.find((c) => c.id === 'c-belag').kind, 'system');
    assertEqual(vm().model.components.find((c) => c.id === 'c-griff').kind, 'target');
  });

  test('diagram folgt dragPreview; unbekannte id wirft nicht; Rollen und leere lines', async () => {
    const { vm } = await mount(await toothbrush());
    assertDeepEqual(vm().diagram.commands, { moveLabel: 'moveLabel', select: 'select' });
    assertTrue(vm().diagram.nodes.every((n) => Array.isArray(n.lines) && n.lines.length === 0), 'lines leer');
    const link = () => vm().diagram.links.find((l) => l.from === 'c-hand' || l.to === 'c-hand');
    const before = { ...link() };
    vm().state.dragPreview = { id: 'c-hand', x: 600, y: 400 };
    await flush();
    assertEqual(nodeOf(vm(), 'c-hand').x, 600);
    assertEqual(nodeOf(vm(), 'c-hand').y, 400);
    assertTrue(link().x1 !== before.x1 || link().y1 !== before.y1, 'Pfeilende verschoben');
    vm().state.dragPreview = { id: 'gibt-es-nicht', x: 1, y: 2 };
    await flush();
    assertEqual(vm().diagram.error, undefined);
    assertEqual(vm().diagram.nodes.length, 7);
  });

  test('canvasStyle wächst mit labels', async () => {
    const { vm } = await mount(await toothbrush());
    const width = () => Number(/width:(\d+)px/.exec(vm().canvasStyle())[1]);
    const before = width();
    vm().model.moveLabel({ id: vm().model.functions[0].id, x: before + 500, y: 10 });
    assertEqual(width(), before + 560);
  });

  test('Vorlage: Verb per x-model, Kosten per x-field mit Dezimalkomma, Widgets ohne Fehler', async () => {
    const { vm, container } = await mount(await toothbrush());
    const fn = vm().model.functions[0];
    const verb = /** @type {HTMLInputElement} */ (container.querySelector(`[data-role="function"][data-id="${fn.id}"] [data-role="fn-verb"]`));
    verb.value = 'reinigt';
    verb.dispatchEvent(new Event('input', { bubbles: true }));
    assertEqual(vm().model.functions[0].verb, 'reinigt');
    const cost = /** @type {HTMLInputElement} */ (container.querySelector('[data-role="component"][data-id="c-griff"] [data-role="component-cost"]'));
    cost.value = '24,5';
    cost.dispatchEvent(new Event('input', { bubbles: true }));
    cost.dispatchEvent(new Event('change', { bubbles: true }));
    assertEqual(vm().model.components.find((c) => c.id === 'c-griff').cost, 24.5);
    assertEqual(container.querySelector('.widget-root--error'), null);
    const basic = vm().model.functions.find((f) => f.carrier === 'c-borsten' && f.object === 'c-belag');
    assertEqual(vm().rankLabel(basic), 'rank.basic (rankCode.basic)');
    assertEqual(container.querySelectorAll('[data-role="component"]').length, 7);
  });

  test('newComponent(target) bei vorhandenem Ziel: still, Model unverändert', async () => {
    const { vm, notes } = await mount(await toothbrush());
    const before = JSON.stringify(vm().model.components);
    await vm().newComponent('target');
    assertDeepEqual(notes, []);
    assertEqual(JSON.stringify(vm().model.components), before);
  });

  test('Klick auf einen Nachteil schaltet um, Klick auf eine Karte nicht', async () => {
    const { vm, $ } = await mount(await toothbrush());
    const dis = /** @type {HTMLElement} */ ($('[data-role="disadvantage"]'));
    const id = dis.dataset.id;
    dis.click();
    await settle();
    assertEqual(vm().state.selectedId, id);
    dis.click();
    await settle();
    assertEqual(vm().state.selectedId, null);
    const card = /** @type {HTMLElement} */ ($(`[data-role="function"][data-id="${id}"]`));
    card.click();
    await settle();
    card.click();
    await settle();
    assertEqual(vm().state.selectedId, id);
  });

  test('Löschen des Gewählten hebt die Auswahl auf, auch mitgelöscht', async () => {
    const { vm } = await mount(await toothbrush());
    const fn = vm().model.functions.find((f) => f.carrier === 'c-griff');
    vm().select({ id: fn.id });
    vm().model.removeFunction({ id: fn.id });
    await settle();
    assertEqual(vm().state.selectedId, null);
    vm().select({ id: 'c-hand' });
    const viaCascade = vm().model.functions.find((f) => f.carrier === 'c-hand');
    vm().select({ id: viaCascade.id, toggle: false });
    vm().model.removeComponent({ id: 'c-hand' });
    await settle();
    assertEqual(vm().state.selectedId, null);
    vm().select({ id: 'c-griff' });
    vm().model.swapDirection({ id: vm().model.functions[0].id });
    await settle();
    assertEqual(vm().state.selectedId, 'c-griff', 'andere Kommandos lassen die Auswahl stehen');
  });

  test('exports.image ohne Komponenten liefert null', async () => {
    const { vm } = await mount();
    assertEqual(vm()._ui.exports.image.call(vm()), null);
  });
});
