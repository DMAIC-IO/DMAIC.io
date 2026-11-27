/**
 * Evolutionstrends (TRIZ): das Viewmodel im Browser (viewmodel/viewmodel.js)
 * mit dem echten Modul und der echten Vorlage. Prüft: System und Notizen
 * schreiben ins Model, die Stufenwahl läuft über das Kommando (Klick auf die
 * Beschriftung und Auslösen am Optionsfeld wie bei den Pfeiltasten),
 * Rückgängig und Wiederholen, Radiogruppen und ids je Instanz und das
 * Altprojekt ohne Verlaufsschritt.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual, fakeChartManager } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { registerCommandDirectives } from '../../js/core/command-directives.js';
import mod from '../../js/modules/triz-evolution-trends/viewmodel/viewmodel.js';

const ID = 'triz-evolution-trends';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };
const TREND_IDS = ['aggregation', 'dynamism', 'scale', 'automation', 'completeness', 'controllability', 'matching', 'uneven'];
const STAGES = { aggregation: 4, dynamism: 5, scale: 4, automation: 4, completeness: 4, controllability: 4, matching: 4, uneven: 0 };
/** @type {HTMLElement[]} */
const mounted = [];
let prepared = false;
let UI = null;

/** Text des Moduls unter einem Punktpfad; sonst der Pfad. */
function tr(path) {
  const v = path.split('.').reduce((o, k) => (o == null ? o : o[k]), UI);
  return typeof v === 'string' ? v : path;
}

async function prepare() {
  if (!prepared) {
    registerCommandDirectives(Alpine);
    if (!Alpine.version) Alpine.start();
    UI = await (await fetch(new URL(`../../js/modules/${ID}/resources/i18n/ui.de.json`, import.meta.url), { cache: 'no-cache' })).json();
    prepared = true;
  }
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

/** Stand aus der Fixture `legacy-project.json` (gespeichert mit `_schema` '1.0'). */
const LEGACY = {
  _schema: { name: 'triz-evolution-trends', version: '1.0' },
  system: 'Spritzgießwerkzeug für Türgriffe & Blenden <Serie "B">',
  trends: {
    aggregation: { stage: 3, notes: 'Heute: Familienwerkzeug mit vier Kavitäten.\nNächste Stufe: Werkzeug als Teil einer verketteten Zelle.' },
    dynamism: { stage: 4, notes: 'Schieber über Feld-Lösung (Induktion) — „ohne Mechanik“.' },
    scale: { stage: 0, notes: 'Makro: Bauteile > 200 mm.\nMikro-Strukturen nur als Oberfläche.' },
    automation: { stage: -1, notes: 'Noch nicht eingeordnet — Daten aus Schicht 2 & 3 fehlen.' },
    completeness: { stage: 2, notes: 'Motor + Übertragung + Werkzeug; Steuerung kommt von der Maschine.' },
    controllability: { stage: 1, notes: 'Ein Regelkreis für die Werkzeugtemperatur (Soll < 80 °C).' },
    matching: { stage: 2, notes: 'Einsätze je Variante tauschbar.\nRüstzeit ≈ 12 min.' },
    uneven: { stage: -1, notes: 'Kühlung hinkt hinterher: Bohrungen von 1995, Zykluszeit "steht".\nEngpass für jede weitere Kavität.' },
  },
};

/**
 * Eine Instanz einhängen (eigene Kopie des Moduls wie in der Registry).
 * @param {string} instanceId
 * @param {object|null} model gespeicherter Zustand
 * @param {{ keep?: boolean }} [opts] `keep`: vorher eingehängte Instanzen bleiben
 */
async function mount(instanceId, model, { keep = false } = {}) {
  await prepare();
  if (!keep) unmountAll();
  const states = { [instanceId]: model };
  /** @type {any[][]} */
  const notes = [];
  const handlers = [];
  const bus = {
    on: (n, fn) => handlers.push([n, fn]),
    off: (n, fn) => { const i = handlers.findIndex(([a, f]) => a === n && f === fn); if (i >= 0) handlers.splice(i, 1); },
    emit: (n, p) => { for (const [a, f] of [...handlers]) if (a === n) f(p); },
  };
  const context = {
    instanceId,
    instances: { list: () => [], read: async () => ({}), interact: async () => ({ ok: false, results: [] }) },
    stateManager: {
      getModuleState: (id) => states[id] ?? null,
      setModuleState: (id, s) => { states[id] = s; },
      getProjectCycle: () => 'eightd',
      get: () => undefined,
      getChartEdits: () => null,
      setChartEdit: () => {},
    },
    i18n: { t: (k) => k, tf: () => tr, getLanguage: () => 'de' },
    eventBus: bus,
    chartManager: fakeChartManager(),
    notify: (...args) => { notes.push(args); },
    dialog: { confirm: async () => true },
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
  return {
    inst, states, notes, container, q, qa,
    vm: () => Alpine.$data(container.querySelector('[x-data]')),
    system: () => q('[data-role="system"]'),
    notesField: (id) => q(`[data-role="notes"][data-trend="${id}"]`),
    stageLabel: (id, s) => q(`label.triz-evo__stage[data-trend="${id}"][data-idx="${s}"]`),
    radio: (id, s) => q(`input[data-role="stage"][data-trend="${id}"][value="${s}"]`),
    selected: (id) => qa(`label.triz-evo__stage.is-selected[data-trend="${id}"]`).map((el) => Number(el.dataset.idx)),
    /** Ins Feld wechseln, Text tippen und das Feld verlassen (Fokus wie bei der Bedienung). */
    type: async (el, value) => {
      el.focus();
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
      await settle();
      return el;
    },
  };
}

suite('triz-evolution-trends: Viewmodel im Browser', () => {
  test('acht Karten in Reihenfolge, Stufen je Trend, die ungleichmäßige Entwicklung ohne Stufenwahl', async () => {
    const h = await mount('evo-1', null);
    const cards = h.qa('.triz-evo__trend');
    assertEqual(cards.length, 8);
    assertDeepEqual(h.qa('.triz-evo__trend-num').map((el) => el.textContent), ['1', '2', '3', '4', '5', '6', '7', '8']);
    assertDeepEqual(h.qa('.triz-evo__trend-title').map((el) => el.textContent), TREND_IDS.map((id) => tr(`trend.${id}.name`)));
    assertDeepEqual(h.qa('.triz-evo__trend--qualitative').map((el) => el.querySelector('[data-role="notes"]').dataset.trend), ['uneven']);
    for (const id of TREND_IDS) {
      const radios = h.qa(`input[data-role="stage"][data-trend="${id}"]`);
      assertEqual(radios.length, STAGES[id], id);
      assertEqual(h.selected(id).length, 0, `${id} ohne Wahl`);
    }
    assertEqual(h.q('.triz-evo__trend--qualitative .triz-evo__stages'), null);
    assertEqual(h.stageLabel('dynamism', 4).querySelector('.triz-evo__stage-idx').textContent, '5');
    assertEqual(h.stageLabel('dynamism', 4).querySelector('.triz-evo__stage-label').textContent, tr('trend.dynamism.stages.4'));
  });

  test('Platzhalter je Trend und Hilfe-Anker an jeder Beschriftung', async () => {
    const h = await mount('evo-1', null);
    assertEqual(h.system().placeholder, tr('systemPlaceholder'));
    for (const id of TREND_IDS) {
      const want = id === 'uneven' ? tr('trend.uneven.notesPlaceholder') : tr('notesPlaceholder');
      assertEqual(h.notesField(id).placeholder, want, id);
    }
    assertTrue(tr('trend.uneven.notesPlaceholder') !== tr('notesPlaceholder'), 'Platzhalter gleich');
    const keys = h.qa('[data-help-key]').map((el) => el.getAttribute('data-help-key')).filter(Boolean);
    const count = (k) => keys.filter((x) => x === k).length;
    assertEqual(count(`modules.${ID}.fields.system.help`), 1);
    assertEqual(count(`modules.${ID}.fields.trends.help`), 8);
    assertEqual(count(`modules.${ID}.actions.setTrendStage.help`), 7);
    assertEqual(keys.length, 16, keys.join(', '));
    // Das Kommando am Optionsfeld setzt keinen eigenen Anker: ein Kreis je Stufengruppe.
    for (const el of h.qa('input[data-role="stage"]')) assertEqual(el.getAttribute('data-help-key'), '');
    for (const el of h.qa('label.triz-evo__stage')) assertEqual(el.hasAttribute('data-help-key'), false);
  });

  test('System und Notiz schreiben ins Model und in den gespeicherten Stand', async () => {
    const h = await mount('evo-1', null);
    const vm = h.vm();
    await h.type(h.system(), ' Pkw-Beleuchtung & <Matrix> "neu" ');
    assertEqual(vm.model.system, ' Pkw-Beleuchtung & <Matrix> "neu" ');
    assertEqual(h.states['evo-1'].system, ' Pkw-Beleuchtung & <Matrix> "neu" ');
    for (const id of TREND_IDS) {
      await h.type(h.notesField(id), `Notiz ${id}\nzweite Zeile`);
      assertEqual(vm.model.trends[id].notes, `Notiz ${id}\nzweite Zeile`, id);
      assertEqual(h.states['evo-1'].trends[id].notes, `Notiz ${id}\nzweite Zeile`, `${id} gespeichert`);
    }
    assertEqual(vm.read().trends.uneven.stage, -1);
  });

  test('Klick auf eine Stufe wählt sie über das Kommando, ein Verlaufsschritt je Wahl', async () => {
    const h = await mount('evo-1', null);
    const vm = h.vm();
    h.stageLabel('aggregation', 2).click();
    await settle();
    assertEqual(vm.model.trends.aggregation.stage, 2);
    assertEqual(h.states['evo-1'].trends.aggregation.stage, 2);
    assertDeepEqual(h.selected('aggregation'), [2]);
    assertTrue(h.radio('aggregation', 2).checked, 'nicht ausgewählt');
    assertTrue(h.inst.historyCan('undo'), 'kein Schritt nach der Wahl');
    // Die gewählte Stufe noch einmal: gleicher Stand, kein neuer Schritt.
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig ohne Wirkung');
    await settle();
    assertEqual(h.inst.historyCan('undo'), false);
    h.stageLabel('aggregation', 2).click();
    await settle();
    h.stageLabel('aggregation', 2).click();
    await settle();
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig ohne Wirkung');
    await settle();
    assertEqual(vm.model.trends.aggregation.stage, -1);
    assertEqual(h.inst.historyCan('undo'), false, 'Klick auf die gewählte Stufe war ein Schritt');
    assertEqual(h.notes.length, 0, JSON.stringify(h.notes));
  });

  test('Auslösen am Optionsfeld (wie Pfeiltasten und Leertaste) setzt die Stufe über das Kommando', async () => {
    const h = await mount('evo-1', null);
    const vm = h.vm();
    h.radio('dynamism', 0).click();
    await settle();
    h.radio('dynamism', 1).focus();
    h.radio('dynamism', 1).click();
    await settle();
    assertEqual(vm.model.trends.dynamism.stage, 1);
    assertDeepEqual(h.selected('dynamism'), [1]);
    assertTrue(h.radio('dynamism', 1).checked && !h.radio('dynamism', 0).checked, 'checked passt nicht');
    h.radio('dynamism', 4).click();
    await settle();
    assertEqual(vm.model.trends.dynamism.stage, 4);
    assertEqual(h.notes.length, 0, JSON.stringify(h.notes));
  });

  test('Rückgängig und Wiederholen für Stufe und Notiz', async () => {
    const h = await mount('evo-1', null);
    const vm = h.vm();
    h.stageLabel('scale', 1).click();
    await settle();
    await h.type(h.notesField('scale'), 'Meso');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Notiz) ohne Wirkung');
    await settle();
    assertEqual(vm.model.trends.scale.notes, '');
    assertEqual(h.notesField('scale').value, '');
    assertEqual(vm.model.trends.scale.stage, 1);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Stufe) ohne Wirkung');
    await settle();
    assertEqual(vm.model.trends.scale.stage, -1);
    assertDeepEqual(h.selected('scale'), []);
    assertTrue(!h.radio('scale', 1).checked, 'Optionsfeld bleibt gewählt');
    assertEqual(h.inst.historyCan('undo'), false);
    assertTrue(h.inst.historyStep('redo'), 'Wiederholen (Stufe) ohne Wirkung');
    await settle();
    assertDeepEqual(h.selected('scale'), [1]);
    assertTrue(h.radio('scale', 1).checked, 'Optionsfeld nicht gewählt');
    assertTrue(h.inst.historyStep('redo'), 'Wiederholen (Notiz) ohne Wirkung');
    await settle();
    assertEqual(h.notesField('scale').value, 'Meso');
  });

  test('zwei Instanzen: getrennte Radiogruppen, eindeutige ids, Wahl in B lässt A stehen', async () => {
    const a = await mount('evo-a', null);
    const b = await mount('evo-b', null, { keep: true });
    assertTrue(a.vm().radioName('scale') !== b.vm().radioName('scale'), 'radioName gleich');
    const ids = [...document.querySelectorAll('.triz-evo [id]')].map((el) => el.id);
    assertEqual(ids.length, 2);
    assertEqual(new Set(ids).size, ids.length, `doppelte ids: ${ids.join(', ')}`);
    for (const h of [a, b]) {
      for (const label of h.container.querySelectorAll('label[for]')) {
        const target = document.getElementById(label.htmlFor);
        assertTrue(!!target && h.container.contains(target), `${label.htmlFor} zeigt nicht ins eigene Modul`);
      }
    }
    const namesA = new Set(a.qa('input[data-role="stage"]').map((el) => el.name));
    const namesB = new Set(b.qa('input[data-role="stage"]').map((el) => el.name));
    assertEqual(namesA.size, 7);
    for (const n of namesA) assertTrue(!namesB.has(n), `gemeinsame Gruppe ${n}`);
    a.stageLabel('automation', 1).click();
    await settle();
    b.stageLabel('automation', 3).click();
    await settle();
    assertEqual(a.vm().model.trends.automation.stage, 1);
    assertEqual(b.vm().model.trends.automation.stage, 3);
    assertTrue(a.radio('automation', 1).checked, 'Wahl in B hebt A auf');
    assertTrue(b.radio('automation', 3).checked, 'B nicht gewählt');
    await b.type(b.system(), 'nur B');
    assertEqual(a.vm().model.system, '');
    unmountAll();
  });

  test('Altprojekt: alle Werte sichtbar, Laden ist kein Verlaufsschritt', async () => {
    const h = await mount('evo-1', structuredClone(LEGACY));
    assertEqual(h.system().value, LEGACY.system);
    for (const id of TREND_IDS) {
      const { stage, notes } = LEGACY.trends[id];
      assertEqual(h.notesField(id).value, notes, id);
      assertDeepEqual(h.selected(id), stage >= 0 ? [stage] : [], `${id} Stufe`);
      if (stage >= 0) assertTrue(h.radio(id, stage).checked, `${id} nicht gewählt`);
    }
    assertEqual(h.inst.historyCan('undo'), false);
    const { _schema, ...fields } = LEGACY;
    assertDeepEqual(h.vm().read(), fields);
    unmountAll();
  });
});
