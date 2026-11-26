/**
 * C&E-Matrix: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem
 * echten Modul und der echten Vorlage. Prüft: Vorgabe und Hilfe-Anker,
 * Namen über `x-model` (Agent, ein Schritt je Feldbesuch), Gewicht über
 * `x-field` auf der Auswahl, das Tippen einer Bewertung (gültig, abgewiesen,
 * leer, „1“ → „10“ als ein Schritt), Skalenwechsel über Feld, Agent und
 * Rückgängig samt Hinweis, die Konfiguration des Pareto-Widgets und die
 * Übernahme alter chartEdits, Löschen mit Rückfrage samt Bewertungen und
 * Ablehnung der letzten Zeile, die Leistenaktion als ein Schritt, Farbklassen
 * der Summen, Exporte und das Altprojekt ohne Verlaufsschritt.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { registerCommandDirectives, runUiCommand } from '../../js/core/command-directives.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { WIDGET_I18N } from '../widget-i18n.js';
import { runExport } from '../../js/core/exporter.js';
import { setFields } from '../../js/core/model.js';
import mod from '../../js/modules/ce-matrix/viewmodel/viewmodel.js';
import { State } from '../../js/modules/ce-matrix/domain/model.js';

const ID = 'ce-matrix';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };
/** Wartet, bis `ok()` gilt; höchstens zwei Sekunden. @param {() => boolean} ok */
async function until(ok) {
  for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setTimeout(r, 10));
}
/** @type {HTMLElement[]} */
const mounted = [];
let prepared = false;
let UI = null;

/** Text des Moduls unter einem Punktpfad, Platzhalter `{name}` ersetzt; sonst der Pfad. */
function tr(path, params) {
  const v = path.split('.').reduce((o, k) => (o == null ? o : o[k]), UI);
  if (typeof v !== 'string') return path;
  return params ? v.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : v;
}

async function prepare() {
  if (!prepared) {
    registerCommandDirectives(Alpine);
    registerFieldDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
    registerWidgetDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
    if (!Alpine.version) Alpine.start();
    UI = await (await fetch(new URL(`../../js/modules/${ID}/resources/i18n/ui.de.json`, import.meta.url), { cache: 'no-cache' })).json();
    prepared = true;
  }
  // Eine schon eingebettete Vorlage (wie im Build) bleibt stehen.
  if (document.querySelector(`template[data-tpl="${TPL_KEY}"]`)?.content.childElementCount) return;
  const html = await (await fetch(new URL(`../../${TPL_KEY}`, import.meta.url), { cache: 'no-cache' })).text();
  let tpl = document.querySelector(`template[data-tpl="${TPL_KEY}"]`);
  if (!tpl) {
    tpl = document.createElement('template');
    tpl.setAttribute('data-tpl', TPL_KEY);
    document.body.append(tpl);
  }
  tpl.innerHTML = html;
}

function unmountAll() {
  while (mounted.length) {
    const old = mounted.pop();
    Alpine.destroyTree(old);
    old.remove();
  }
}

/** Stand aus der Fixture `legacy-project.json` (ohne `_schema`, wie die Altform ihn schrieb). */
const LEGACY = {
  inputs: ['Ofentemperatur (°C)', 'Teig & Belag <"Spezial">', 'Fahrerverfügbarkeit'],
  outputs: ['Lieferzeit', 'Qualität „heiß“', 'Kosten/Stück'],
  scores: { '2-1': 5, '0-0': 9, '1-1': 9, '0-1': 3, '1-0': 3, '0-2': 1, '2-2': 0 },
  weights: [10, 7],
  scale: '0-1-3-9',
};
const plain = (v) => JSON.parse(JSON.stringify(v));

/**
 * Eine Instanz einhängen.
 * @param {string} instanceId
 * @param {object|null} model gespeicherter Zustand
 * @param {{ keep?: boolean, confirm?: boolean, chartEdits?: Record<string, any> }} [opts]
 */
async function mount(instanceId, model, { keep = false, confirm = true, chartEdits = {} } = {}) {
  await prepare();
  if (!keep) unmountAll();
  const states = { [instanceId]: model };
  /** @type {any[][]} */
  const notes = [];
  /** @type {any[]} */
  const confirms = [];
  const handlers = [];
  /** @type {string[]} */
  const commands = [];
  /** @type {any[]} */
  const charts = [];
  const context = {
    instanceId,
    instances: { list: () => [], read: async () => ({}), interact: async () => ({ ok: false, results: [] }) },
    stateManager: {
      getModuleState: (id) => states[id] ?? null,
      setModuleState: (id, s) => { states[id] = s; },
      getProjectCycle: () => 'dmaic',
      get: () => undefined,
      getChartEdits: (inst, key) => chartEdits[inst]?.[key] ?? null,
      setChartEdit: (inst, key, k, v) => {
        const e = chartEdits[inst]?.[key];
        if (!e) return;
        if (v === null) delete e[k]; else e[k] = v;
      },
    },
    i18n: { t: (k) => k, tf: () => tr, getLanguage: () => 'de' },
    eventBus: {
      on: (n, fn) => handlers.push([n, fn]),
      off: (n, fn) => { const i = handlers.findIndex(([a, f]) => a === n && f === fn); if (i >= 0) handlers.splice(i, 1); },
      emit: (n, p) => {
        if (n === 'command:executed') commands.push(p.command);
        for (const [a, f] of [...handlers]) if (a === n) f(p);
      },
    },
    chartManager: {
      create: async (el, type, config) => { const c = { el, type, config: { ...config } }; charts.push(c); return c; },
      update: (chart, config) => { Object.assign(chart.config, config); },
      destroy: () => {},
    },
    notify: (...args) => { notes.push(args); },
    dialog: { confirm: async (o) => { confirms.push(o); return confirm; }, show: () => ({ close() {}, setTitle() {} }) },
    theme: 'light',
    language: 'de',
  };
  const container = document.createElement('div');
  document.body.append(container);
  mounted.push(container);
  const inst = { ...mod };
  await inst.init(container, context);
  await settle();
  const q = (sel) => container.querySelector(sel);
  const qa = (sel) => [...container.querySelectorAll(sel)];
  const vm = () => Alpine.$data(container.querySelector('[x-data]'));
  const h = {
    inst, states, notes, confirms, commands, charts, chartEdits, container, q, qa, vm,
    inputNames: () => qa('.ce-matrix__input-name').map((el) => /** @type {HTMLInputElement} */ (el).value),
    outputNames: () => qa('.ce-matrix__output-name').map((el) => /** @type {HTMLInputElement} */ (el).value),
    nameInput: (id) => /** @type {HTMLInputElement} */ (q(`.ce-matrix__input-name[data-input-id="${id}"]`)),
    outName: (id) => /** @type {HTMLInputElement} */ (q(`.ce-matrix__output-name[data-output-id="${id}"]`)),
    weight: (id) => /** @type {HTMLSelectElement} */ (q(`.ce-matrix__weight-select[data-output-id="${id}"]`)),
    score: (i, o) => /** @type {HTMLInputElement} */ (q(`.ce-matrix__score-input[data-input-id="${i}"][data-output-id="${o}"]`)),
    scale: () => /** @type {HTMLSelectElement} */ (q('.ce-matrix__scale-select')),
    rowSums: () => qa('tbody .ce-matrix__result-cell').map((el) => el.textContent),
    colSums: () => qa('tfoot .ce-matrix__result-cell').map((el) => el.textContent),
    total: () => q('.ce-matrix__grand-total').textContent,
    delInput: (id) => /** @type {HTMLButtonElement} */ (q(`.ce-matrix__row-del-btn[data-input-id="${id}"]`)),
    delOutput: (id) => /** @type {HTMLButtonElement} */ (q(`.ce-matrix__col-del-btn[data-output-id="${id}"]`)),
    saved: () => plain(states[instanceId]),
    /**
     * Ein Feld besuchen, Text tippen (je Zeichen ein input-Ereignis, mit
     * `whole` in einem wie beim Einfügen), verlassen.
     */
    type: async (el, text, { leave = true, whole = false } = {}) => {
      el.focus();
      el.value = '';
      if (whole || text === '') {
        el.value = text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        for (const ch of text) {
          el.value += ch;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          await settle();
        }
      }
      if (leave) {
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.blur();
      }
      await settle();
    },
    /** Eine Auswahl wählen, wie ein Nutzer: Fokus, Wert, change, verlassen. */
    select: async (el, value) => {
      el.focus();
      el.value = String(value);
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
      await settle();
    },
    click: async (el) => { el.click(); await settle(); },
  };
  return h;
}

/** Der gespeicherte Stand lädt streng (ohne Reparatur). @param {any} saved */
function assertValid(saved) {
  let err = null;
  try { State.fromJSON(plain(saved)); } catch (e) { err = e; }
  assertEqual(err, null, `gespeicherter Stand ungültig: ${err?.message}`);
}

suite('ce-matrix: Viewmodel im Browser', () => {
  test('Vorgabe: 3 × 3, Gewichte 1, Skala 0-10, leere Zellen, Summen 0, nichts gespeichert, kein Schritt', async () => {
    const h = await mount('ce-1', null);
    assertDeepEqual(h.inputNames(), ['Input 1', 'Input 2', 'Input 3']);
    assertDeepEqual(h.outputNames(), ['Output 1', 'Output 2', 'Output 3']);
    await until(() => h.weight('o1').value === '1');
    assertDeepEqual(['o1', 'o2', 'o3'].map((o) => h.weight(o).value), ['1', '1', '1']);
    assertEqual(h.weight('o1').options.length, 10);
    await until(() => h.scale().value === '0-10');
    assertEqual(h.scale().value, '0-10');
    assertDeepEqual([...h.scale().options].map((o) => o.textContent), ['0–10', '0 / 1 / 3 / 9', '0 / 3 / 7 / 10']);
    assertEqual(h.score('i1', 'o1').value, '');
    assertEqual(h.score('i1', 'o1').type, 'text');
    assertEqual(h.score('i1', 'o1').getAttribute('inputmode'), 'numeric');
    assertEqual(h.score('i1', 'o1').hasAttribute('max'), false);
    assertDeepEqual(h.rowSums(), ['0', '0', '0']);
    assertEqual(h.total(), '0');
    assertEqual(h.nameInput('i1').placeholder, tr('inputPlaceholder'));
    assertEqual(h.states['ce-1'], null);
    assertEqual(h.inst.historyCan('undo'), false);
    unmountAll();
  });

  test('Hilfe-Anker: Wichtigkeit, Σ Zeile, Skala je einmal; Auswahlen und Löschknöpfe leer', async () => {
    const h = await mount('ce-1', plain(LEGACY));
    const keys = h.qa('[data-help-key]').map((el) => el.getAttribute('data-help-key')).filter(Boolean);
    assertDeepEqual(keys.sort(), [
      `modules.${ID}.fields.outputs.weight.help`, `modules.${ID}.fields.rowSums.help`, `modules.${ID}.fields.scale.help`,
    ]);
    for (const el of [...h.qa('select'), ...h.qa('.dmike-del-btn')]) assertEqual(el.getAttribute('data-help-key'), '', el.className);
    assertEqual(h.qa('.dmike-del-btn').length, 6);
    unmountAll();
  });

  test('Altprojekt: Namen, Gewichte, Bewertungen, Markierung 5, Summen; Migration ist kein Schritt', async () => {
    const h = await mount('ce-1', plain(LEGACY));
    assertDeepEqual(h.inputNames(), LEGACY.inputs);
    assertDeepEqual(h.outputNames(), LEGACY.outputs);
    await until(() => h.weight('o1').value === '10');
    assertDeepEqual(['o1', 'o2', 'o3'].map((o) => h.weight(o).value), ['10', '7', '1']);
    assertEqual(h.scale().value, '0-1-3-9');
    assertEqual(h.score('i3', 'o2').value, '5');
    assertEqual(h.score('i3', 'o3').value, '0');
    assertEqual(h.score('i3', 'o1').value, '');
    assertTrue(h.score('i3', 'o2').classList.contains('ce-matrix__score-input--invalid'), 'Markierung fehlt');
    assertEqual(h.score('i3', 'o2').title, tr('scoreAllowed', { allowed: '0, 1, 3, 9' }));
    assertEqual(h.qa('.ce-matrix__score-input--invalid').length, 1);
    assertDeepEqual(h.rowSums(), ['112', '93', '35']);
    assertDeepEqual(h.colSums(), ['120', '119', '1']);
    assertEqual(h.total(), '240');
    assertEqual(h.inst.historyCan('undo'), false);
    assertEqual(h.notes.length, 0);
    unmountAll();
  });

  test('Farbklassen der Summen: Abschnitt und Anteil; ohne Spannweite keine Klasse', async () => {
    const h = await mount('ce-1', plain(LEGACY));
    const cells = h.qa('tbody .ce-matrix__result-cell');
    // 112 ist das Maximum (Abschnitt 3, Anteil 1), 35 das Minimum (Abschnitt 0, Anteil 0).
    assertTrue(cells[0].classList.contains('ce-matrix__heat--s3'), cells[0].className);
    assertEqual(cells[0].style.getPropertyValue('--ce-heat-t'), '1');
    assertTrue(cells[2].classList.contains('ce-matrix__heat--s0'), cells[2].className);
    assertEqual(cells[2].style.getPropertyValue('--ce-heat-t'), '0');
    const t = (93 - 35) / (112 - 35);
    assertTrue(cells[1].classList.contains('ce-matrix__heat--s3'), cells[1].className);
    assertTrue(Math.abs(Number(cells[1].style.getPropertyValue('--ce-heat-t')) - (t - 0.75) / 0.25) < 1e-9);
    const fresh = await mount('ce-2', null);
    for (const el of fresh.qa('.ce-matrix__result-cell')) {
      assertTrue(![...el.classList].some((c) => c.startsWith('ce-matrix__heat--')), el.className);
      assertEqual(el.style.getPropertyValue('--ce-heat-t'), '');
    }
    unmountAll();
  });

  test('Namen (x-model): Tippen speichert, ein Schritt je Feldbesuch; Agent erscheint im Feld; Rückgängig/Wiederholen', async () => {
    const h = await mount('ce-1', null);
    await h.type(h.nameInput('i2'), 'Ofen');
    assertEqual(h.vm().model.inputs[1].name, 'Ofen');
    assertEqual(h.saved().inputs[1].name, 'Ofen');
    await h.type(h.outName('o1'), 'Zeit');
    assertEqual(h.saved().outputs[0].name, 'Zeit');
    assertValid(h.saved());
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Spalte)');
    await settle();
    assertEqual(h.outName('o1').value, 'Output 1');
    assertEqual(h.nameInput('i2').value, 'Ofen');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Zeile)');
    await settle();
    assertEqual(h.nameInput('i2').value, 'Input 2');
    assertEqual(h.inst.historyCan('undo'), false);
    assertTrue(h.inst.historyStep('redo'), 'Wiederholen');
    await settle();
    assertEqual(h.nameInput('i2').value, 'Ofen');
    h.vm().model.setInputName({ inputId: 'i3', text: 'Vom Agenten' });
    await until(() => h.nameInput('i3').value === 'Vom Agenten');
    assertEqual(h.nameInput('i3').value, 'Vom Agenten');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Agent)');
    await until(() => h.nameInput('i3').value === 'Input 3');
    assertEqual(h.nameInput('i3').value, 'Input 3');
    unmountAll();
  });

  test('Gewicht (x-field auf der Auswahl): Wahl speichert, Summen folgen; Agent stellt um; Rückgängig', async () => {
    const h = await mount('ce-1', plain(LEGACY));
    await until(() => h.weight('o3').value === '1');
    await h.select(h.weight('o3'), 10);
    assertEqual(h.vm().model.outputs[2].weight, 10);
    assertEqual(h.saved().outputs[2].weight, 10);
    await until(() => h.rowSums()[0] === '121');
    assertDeepEqual(h.rowSums(), ['121', '93', '35']);
    await h.select(h.weight('o1'), 2);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (o1)');
    await until(() => h.weight('o1').value === '10');
    assertEqual(h.weight('o3').value, '10');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (o3)');
    await until(() => h.weight('o3').value === '1');
    assertEqual(h.inst.historyCan('undo'), false);
    h.vm().model.setWeight({ outputId: 'o2', value: 3 });
    await until(() => h.weight('o2').value === '3');
    assertEqual(h.weight('o2').value, '3');
    await until(() => h.rowSums()[0] === '100');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Agent)');
    await until(() => h.weight('o2').value === '7');
    assertEqual(h.weight('o2').value, '7');
    unmountAll();
  });

  test('Bewertung tippen: gültig speichert, „1“ → „10“ ein Schritt, ungültig markiert und lässt das Model, leer löscht', async () => {
    const h = await mount('ce-1', null);
    const el = h.score('i1', 'o1');
    await h.type(el, '10');
    assertEqual(h.vm().model.scores['i1:o1'], 10);
    assertEqual(h.saved().scores['i1:o1'], 10);
    assertDeepEqual(h.rowSums(), ['10', '0', '0']);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig');
    await until(() => h.score('i1', 'o1').value === '');
    assertEqual(Object.hasOwn(h.vm().model.scores, 'i1:o1'), false);
    assertEqual(h.inst.historyCan('undo'), false);
    assertTrue(h.inst.historyStep('redo'), 'Wiederholen');
    await until(() => h.score('i1', 'o1').value === '10');
    // Ungültig: 15, -5, 2,5, Text — eingefügt; Model bleibt, Feld markiert, Hinweis.
    for (const bad of ['15', '-5', '2,5', 'x']) {
      const notes = h.notes.length;
      await h.type(h.score('i1', 'o1'), bad, { leave: false, whole: true });
      assertEqual(h.vm().model.scores['i1:o1'], 10, bad);
      assertEqual(h.score('i1', 'o1').getAttribute('aria-invalid'), 'true', bad);
      assertTrue(h.score('i1', 'o1').classList.contains('field--error'), bad);
      assertEqual(h.notes.at(-1)?.[1], 'warning', bad);
      assertTrue(h.notes.length > notes, bad);
      h.score('i1', 'o1').blur();
    }
    assertEqual(h.notes.at(-1)[0], tr('scoreRejected', { value: 'x', allowed: '0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10' }));
    // Getippt wie die Altform: „15“ speichert erst die 1, dann wird „15“ abgewiesen.
    await h.type(h.score('i1', 'o2'), '15', { leave: false });
    assertEqual(h.vm().model.scores['i1:o2'], 1);
    assertEqual(h.score('i1', 'o2').getAttribute('aria-invalid'), 'true');
    h.score('i1', 'o2').blur();
    // Gültig danach hebt die Markierung auf.
    await h.type(h.score('i1', 'o1'), '7');
    assertEqual(h.vm().model.scores['i1:o1'], 7);
    assertEqual(h.score('i1', 'o1').getAttribute('aria-invalid'), null);
    assertTrue(!h.score('i1', 'o1').classList.contains('field--error'));
    // Leer löscht.
    await h.type(h.score('i1', 'o1'), '');
    assertEqual(Object.hasOwn(h.vm().model.scores, 'i1:o1'), false);
    assertValid(h.saved());
    unmountAll();
  });

  test('Bewertung über den Agenten: erscheint im Feld, außerhalb der Skala abgelehnt; Rückgängig', async () => {
    const h = await mount('ce-1', null);
    h.vm().model.setScore({ inputId: 'i2', outputId: 'o3', value: 9 });
    await until(() => h.score('i2', 'o3').value === '9');
    assertEqual(h.score('i2', 'o3').value, '9');
    let err = null;
    try { h.vm().model.setScore({ inputId: 'i2', outputId: 'o3', value: 11 }); } catch (e) { err = e; }
    assertEqual(err?.param, 'value');
    assertEqual(h.vm().model.scores['i2:o3'], 9);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig');
    await until(() => h.score('i2', 'o3').value === '');
    assertEqual(h.score('i2', 'o3').value, '');
    unmountAll();
  });

  test('Skala (x-field): markiert Fremdwerte und meldet sie; ebenso der Agent; Rückgängig hebt auf und meldet erneut', async () => {
    const h = await mount('ce-1', null);
    h.vm().model.setScore({ inputId: 'i1', outputId: 'o1', value: 5 });
    h.vm().model.setScore({ inputId: 'i1', outputId: 'o2', value: 3 });
    await settle();
    // Eine abgewiesene Eingabe steht am Feld; der Skalenwechsel hebt sie auf.
    await h.type(h.score('i2', 'o1'), '15', { leave: false, whole: true });
    h.score('i2', 'o1').blur();
    assertTrue(h.score('i2', 'o1').classList.contains('field--error'));
    const before = h.notes.length;
    await h.select(h.scale(), '0-1-3-9');
    assertEqual(h.vm().model.scale, '0-1-3-9');
    await until(() => h.qa('.ce-matrix__score-input--invalid').length === 1);
    assertTrue(h.score('i1', 'o1').classList.contains('ce-matrix__score-input--invalid'));
    assertTrue(!h.score('i1', 'o2').classList.contains('ce-matrix__score-input--invalid'));
    assertTrue(!h.score('i2', 'o1').classList.contains('field--error'), 'Ablehnung bleibt nach Skalenwechsel');
    assertDeepEqual(h.notes.slice(before).map((n) => n.slice(0, 2)), [[tr('offScale', { count: 1 }), 'warning']]);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Skala)');
    await until(() => h.scale().value === '0-10');
    await until(() => h.qa('.ce-matrix__score-input--invalid').length === 0);
    assertEqual(h.notes.length, before + 1, 'kein Fremdwert auf 0-10: keine Meldung');
    setFields(h.vm().model, { scale: '0-3-7-10' });
    await until(() => h.scale().value === '0-3-7-10');
    await until(() => h.qa('.ce-matrix__score-input--invalid').length === 1);
    assertEqual(h.notes.at(-1)[0], tr('offScale', { count: 1 }));
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Agent)');
    await until(() => h.scale().value === '0-10');
    assertTrue(h.inst.historyStep('redo'), 'Wiederholen');
    await until(() => h.scale().value === '0-3-7-10');
    await until(() => h.notes.length === before + 3);
    assertEqual(h.notes.length, before + 3, 'Wiederholen meldet erneut');
    unmountAll();
  });

  test('Pareto: Konfiguration folgt Bewertung, Gewicht, Name, Anlegen und Löschen; ohne Legende, mit Sammelposten', async () => {
    const h = await mount('ce-1', plain(LEGACY));
    const cfg = () => h.vm().paretoChart;
    assertDeepEqual(cfg().items, [
      { name: 'Ofentemperatur (°C)', value: 112 }, { name: 'Teig & Belag <"Spezial">', value: 93 }, { name: 'Fahrerverfügbarkeit', value: 35 },
    ]);
    assertEqual(cfg().otherBucket, true);
    assertEqual(cfg().showLegend, false);
    assertEqual(cfg().title, tr('paretoTitle'));
    assertEqual(cfg().yLabel, tr('paretoYLabel'));
    h.vm().model.setScore({ inputId: 'i3', outputId: 'o1', value: 9 });
    await settle();
    assertEqual(cfg().items[2].value, 125);
    h.vm().model.setWeight({ outputId: 'o1', value: 1 });
    await settle();
    assertEqual(cfg().items[0].value, 31);
    await h.type(h.nameInput('i1'), '');
    assertEqual(cfg().items[0].name, 'Input 1');
    const id = h.vm().model.addInput({});
    await settle();
    assertDeepEqual(cfg().items.at(-1), { name: 'Input 4', value: 0 });
    h.vm().model.removeInput({ inputId: id });
    await settle();
    assertEqual(cfg().items.length, 3);
    assertTrue(h.charts.length >= 1, 'kein Diagramm angelegt');
    assertEqual(h.charts[0].type, 'pareto');
    unmountAll();
  });

  test('Pareto: alte chartEdits[pareto] werden übernommen (kein Schritt); der Editor schreibt paretoEdits', async () => {
    const chartEdits = { 'ce-1': { pareto: { title: 'Legacy-Pareto' } } };
    const h = await mount('ce-1', plain(LEGACY), { chartEdits });
    await until(() => h.vm().model.paretoEdits?.title === 'Legacy-Pareto');
    assertEqual(h.vm().model.paretoEdits.title, 'Legacy-Pareto');
    assertEqual(h.inst.historyCan('undo'), false);
    h.vm().model.paretoEdits = { ...h.vm().model.paretoEdits, refLineValue: 90 };
    await settle();
    assertEqual(h.saved().paretoEdits.refLineValue, 90);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Editor)');
    await settle();
    assertEqual(h.vm().model.paretoEdits.refLineValue, undefined);
    unmountAll();
  });

  test('Löschen (x-command): Rückfrage, Zeile samt Bewertungen; Rückgängig bringt beides zurück; Abbrechen lässt alles', async () => {
    const h = await mount('ce-1', plain(LEGACY));
    await h.click(h.delInput('i1'));
    assertEqual(h.confirms.length, 1);
    await until(() => h.inputNames().length === 2);
    assertDeepEqual(h.inputNames(), LEGACY.inputs.slice(1));
    assertEqual(Object.keys(h.vm().model.scores).some((k) => k.startsWith('i1:')), false);
    assertDeepEqual(h.commands, ['removeInput']);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig');
    await until(() => h.inputNames().length === 3);
    assertEqual(h.vm().model.scores['i1:o1'], 9);
    assertEqual(h.score('i1', 'o1').value, '9');
    assertTrue(h.inst.historyStep('redo'), 'Wiederholen');
    await until(() => h.inputNames().length === 2);
    await h.click(h.delOutput('o2'));
    await until(() => h.outputNames().length === 2);
    assertEqual(Object.keys(h.vm().model.scores).some((k) => k.endsWith(':o2')), false);
    h.vm().model.removeOutput({ outputId: 'o1' });
    await until(() => h.outputNames().length === 1);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Agent)');
    await until(() => h.outputNames().length === 2);
    const c = await mount('ce-2', plain(LEGACY), { confirm: false });
    await c.click(c.delInput('i2'));
    assertEqual(c.inputNames().length, 3);
    assertEqual(c.inst.historyCan('undo'), false);
    unmountAll();
  });

  test('Löschen der letzten Zeile/Spalte: abgelehnt mit Hinweis, nichts entfernt', async () => {
    const h = await mount('ce-1', {
      _schema: { name: ID, version: '1.0' }, inputs: [{ id: 'i1', name: 'X' }], outputs: [{ id: 'o1', name: 'Y', weight: 1 }],
      scores: { 'i1:o1': 3 }, scale: '0-10',
    });
    await h.click(h.delInput('i1'));
    await until(() => h.notes.length > 0);
    assertEqual(h.inputNames().length, 1);
    assertEqual(h.vm().model.scores['i1:o1'], 3);
    assertEqual(h.notes.length, 1);
    await h.click(h.delOutput('o1'));
    await until(() => h.notes.length > 1);
    assertEqual(h.outputNames().length, 1);
    assertEqual(h.inst.historyCan('undo'), false);
    unmountAll();
  });

  test('Leistenaktion addInput/addOutput: je ein Schritt, liefert die id', async () => {
    const h = await mount('ce-1', null);
    const ui = h.vm()._ui;
    const r = await runUiCommand(ui, 'addInput', {});
    assertEqual(r.ok, true);
    await settle();
    assertEqual(h.inputNames().at(-1), 'Input 4');
    assertEqual(h.vm().model.inputs.at(-1).id, r.ok ? r.result : null);
    await runUiCommand(ui, 'addOutput', {});
    await settle();
    assertDeepEqual(h.outputNames().at(-1), 'Output 4');
    await until(() => h.weight(h.vm().model.outputs.at(-1).id)?.value === '1');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Spalte)');
    await until(() => h.outputNames().length === 3);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Zeile)');
    await until(() => h.inputNames().length === 3);
    assertEqual(h.inst.historyCan('undo'), false);
    unmountAll();
  });

  test('Exporte: CSV im Kernformat, JSON in der Form des Altexports', async () => {
    const h = await mount('ce-1', plain(LEGACY));
    const files = [];
    const io = {
      downloadFile: (text, name) => files.push({ text, name }),
      downloadBlob: async (blob, name) => files.push({ text: await blob.text(), name }),
      ensureXLSX: async () => { throw new Error('nicht geladen'); },
    };
    await runExport(h.vm()._ui, 'csv', /** @type {any} */ (io));
    await runExport(h.vm()._ui, 'json', /** @type {any} */ (io));
    await until(() => files.length === 2);
    assertEqual(files[0].name, 'ce-matrix.csv');
    assertEqual(files[0].text.split('\n')[1], `"${tr('weight')}";10;7;1;""`);
    assertEqual(files[0].text.split('\n').at(-2), `"${tr('colSum')}";120;119;1`);
    assertEqual(files[1].name, 'ce-matrix.json');
    assertDeepEqual(JSON.parse(files[1].text), {
      inputs: LEGACY.inputs, outputs: LEGACY.outputs,
      scores: { '0-0': 9, '0-1': 3, '0-2': 1, '1-0': 3, '1-1': 9, '2-1': 5, '2-2': 0 },
      weights: [10, 7, 1], scale: '0-1-3-9',
    });
    unmountAll();
  });
});
