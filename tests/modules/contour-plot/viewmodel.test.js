/**
 * Konturdiagramm: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem
 * echten Modul, dem echten chartManager (Typ `contour`) und einer
 * Arbeitsblatt-Attrappe. Prüft Diagramm, Infokarten, Legende, Messpunkte,
 * Achsentitel je Sprache und den Tabellen-Export.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import Alpine from '../../../vendor/alpinejs/csp.js';
import mod from '../../../js/modules/contour-plot/viewmodel/viewmodel.js';
import ChartManager from '../../../js/core/chart/chart-manager.js';
import { installWorksheetRevisions } from '../../../js/core/worksheet-data.js';
import { registerWidgetDirective } from '../../../js/core/widget-directive.js';
import { WIDGETS } from '../../../js/widgets/registry.js';
import { setFields } from '../../../js/core/model.js';
import { WIDGET_I18N } from '../../widget-i18n.js';

const ID = 'contour-plot';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;

/** Die Texte, die die Prüfungen lesen; sonst der Schlüssel. */
const TEXTS = {
  de: { title: 'Konturdiagramm', xLabelDefault: 'Faktor X', yLabelDefault: 'Faktor Y', zLabelDefault: 'Antwort Z', levels: 'Konturstufen', legend: 'Legende' },
  en: { title: 'Contour Plot', xLabelDefault: 'Factor X', yLabelDefault: 'Factor Y', zLabelDefault: 'Response Z', levels: 'contour levels', legend: 'Legend' },
};

let widgetsRegistered = false;
const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 4; i++) await flush(); };
/** Wartet, bis `ok()` gilt (das Diagramm lädt seinen Typ nach); höchstens zwei Sekunden. */
async function until(ok) {
  for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setTimeout(r, 10));
}
const mounted = [];

function ensureTemplate() {
  if (!Alpine.version) Alpine.start();
  if (!widgetsRegistered) { registerWidgetDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS }); widgetsRegistered = true; }
  if (document.querySelector(`template[data-tpl="${TPL_KEY}"]`)) return;
  // Schlankes Gerüst mit dem Namen, den Karten, der Legende und dem Diagramm der echten Vorlage
  const tpl = document.createElement('template');
  tpl.setAttribute('data-tpl', TPL_KEY);
  tpl.innerHTML = '<div class="contour" x-data="contourPlot">'
    + '<template x-for="(v, i) in model.b" :key="i"><input :data-ref="\'b\' + i" :value="coefficientText(i)" @change="coefficientChanged(i, $event)"></template>'
    + '<input data-ref="zLabel" x-model="model.zLabel" :placeholder="t(\'zLabelDefault\')">'
    + '<p data-ref="formula-error" x-show="formulaErrorText" x-text="formulaErrorText"></p>'
    + '<div data-ref="infoRangeSub" x-text="info.rangeSub"></div>'
    + '<div data-ref="infoZmax" x-text="info.zMax"></div>'
    + '<div data-ref="legend"><template x-for="(it, i) in legend.items" :key="i"><span class="contour__legend-item" x-text="it.value"></span></template></div>'
    + '<div data-ref="chart-wrap" style="width: 700px; height: 520px">'
    + '<div x-widget="contour-chart" x-widget-config="chart" x-widget-value="model.chartEdits"></div>'
    + '</div>'
    + '</div>';
  document.body.append(tpl);
}

/**
 * Modul mit echtem chartManager einhängen.
 * @param {object|null} model gespeicherter Zustand der Instanz
 * @param {Record<string, any>} [sheets] Modulzustände weiterer Instanzen
 */
async function mount(model, sheets = {}) {
  ensureTemplate();
  while (mounted.length) mounted.pop().remove();
  const states = { 'cp-1': model, ...sheets };
  const handlers = [];
  const bus = {
    on: (name, fn) => handlers.push([name, fn]),
    off: (name, fn) => { const i = handlers.findIndex(([n, f]) => n === name && f === fn); if (i >= 0) handlers.splice(i, 1); },
    emit: (name, payload) => { for (const [n, f] of [...handlers]) if (n === name) f(payload); },
  };
  installWorksheetRevisions(bus);
  const lang = { current: 'de' };
  const i18n = {
    t: (k) => k,
    tf: () => (k) => TEXTS[lang.current][k] ?? k,
    getLanguage: () => lang.current,
  };
  const context = {
    instanceId: 'cp-1',
    stateManager: {
      getModuleState: (id) => states[id] ?? null,
      setModuleState: () => {},
      getProjectCycle: () => 'dmaic',
      get: () => undefined,
    },
    i18n,
    eventBus: bus,
    chartManager: new ChartManager(bus, i18n),
    notify: () => {},
    dialog: { confirm: async () => true },
    theme: 'light',
    get language() { return lang.current; },
  };
  const container = document.createElement('div');
  document.body.append(container);
  mounted.push(container);
  await mod.init(container, context);
  await settle();
  const host = () => container.querySelector('[x-widget="contour-chart"]');
  await until(() => host()?.querySelector('svg image'));
  return {
    container, lang, bus, states, host,
    vm: () => Alpine.$data(container.querySelector('[x-data]')),
    lines: () => host().querySelectorAll('path.chart-contour-line').length,
    points: () => host().querySelectorAll('.chart-contour-point').length,
    image: () => host().querySelector('svg image')?.getAttribute('href') ?? null,
    placeholder: (ref) => container.querySelector(`[data-ref="${ref}"]`)?.getAttribute('placeholder') ?? null,
    text: (ref) => container.querySelector(`[data-ref="${ref}"]`)?.textContent ?? '',
  };
}

const sheet = (cols) => ({
  sheets: [{ id: 's1', state: { columns: Object.entries(cols).map(([id, values]) => ({ id, name: id, shortName: id, values })) } }],
});
const ref = (col) => ({ instanceId: 'ws1', sheetId: 's1', columnId: col });

suite('contour-plot: Viewmodel im Browser', () => {
  test('eingehängt: SVG mit Rasterbild im Diagramm-Wirt, kein canvas im Modul', async () => {
    const h = await mount(null);
    assertTrue(h.host().querySelector('svg image') !== null, 'kein Rasterbild');
    assertEqual(h.container.querySelectorAll('canvas').length, 0);
    assertTrue(h.lines() > 0, 'keine Höhenlinien');
  });

  test('eigene Formel x: surface.zMax = 3, das Diagramm zeichnet neu', async () => {
    const h = await mount(null);
    const lines = h.lines();
    const before = h.image();
    setFields(h.vm().model, { modelType: 'custom', customFormula: 'x' });
    await settle();
    assertEqual(h.vm().read().surface.zMax, 3);
    assertEqual(h.lines(), lines);
    assertTrue(h.image() !== before, 'Bild unverändert');
  });

  test('numLevels 6: sechs Linien, Infokarte „6 Stufen“, sechs Legendenfelder; 14 → zehn Felder', async () => {
    const h = await mount(null);
    h.vm().model.chartEdits = { numLevels: 6 };
    await settle();
    assertEqual(h.lines(), 6);
    assertEqual(h.text('infoRangeSub'), '6 Konturstufen');
    assertEqual(h.container.querySelectorAll('.contour__legend-item').length, 6);
    h.vm().model.chartEdits = { numLevels: 14 };
    await settle();
    assertEqual(h.container.querySelectorAll('.contour__legend-item').length, 10);
  });

  test('drei Spalten gesetzt: Marker sichtbar; showDataPoints false: keine', async () => {
    const h = await mount(
      { _schema: { version: '1.0' }, datasets: [{ x: ref('a'), y: ref('b'), z: ref('c') }] },
      { ws1: sheet({ a: [0, 1, 'x', 2], b: [0, 1, 1, -1], c: [50, 55, 60, 52] }) },
    );
    assertEqual(h.vm().dataPoints.length, 3);
    assertEqual(h.points(), 3);
    h.vm().model.chartEdits = { showDataPoints: false };
    await settle();
    assertEqual(h.points(), 0);
  });

  test('ohne Spalten: keine Marker', async () => {
    const h = await mount(null);
    assertEqual(h.points(), 0);
    assertEqual(h.vm().chart.showDataPoints, undefined);
  });

  test('xLabel leer: Achsentitel „Faktor X“, nach Sprachwechsel „Factor X“, Model bleibt leer', async () => {
    const h = await mount(null);
    assertEqual(h.vm().chart.xLabel, 'Faktor X');
    assertEqual(h.vm().chart.title, 'Konturdiagramm: Antwort Z');
    h.lang.current = 'en';
    mod.onLanguageChange();
    await settle();
    assertEqual(h.vm().chart.xLabel, 'Factor X');
    assertEqual(h.vm().chart.yLabel, 'Factor Y');
    assertEqual(h.vm().model.xLabel, '');
  });

  test('gesetzter xLabel geht vor', async () => {
    const h = await mount({ _schema: { version: '1.0' }, xLabel: 'Temperatur', zLabel: 'Ausbeute' });
    assertEqual(h.vm().chart.xLabel, 'Temperatur');
    assertEqual(h.vm().chart.title, 'Konturdiagramm: Ausbeute');
  });

  test('exports.table(): Kopf x;y;z, gridRes² Zeilen, vier Nachkommastellen', async () => {
    const h = await mount(null);
    h.vm().model.chartEdits = { gridRes: 40 };
    await settle();
    const ui = h.vm()._ui;
    const rows = await ui.exports.table.call(ui.component);
    assertDeepEqual(rows[0], ['x', 'y', 'z']);
    assertEqual(rows.length, 40 * 40 + 1);
    assertDeepEqual(rows[1], [-3, 3, 50 - 24 + 15 - 27 - 18 - 13.5]);
    assertDeepEqual(rows[2].slice(0, 2), [-2.8462, 3]);
    assertEqual(ui.exports.fileName, 'contour-plot');
  });

  test('Infokarten im Deutschen mit Komma', async () => {
    const h = await mount(null);
    const info = h.vm().info;
    assertTrue(/,\d\d$/.test(info.zMax), info.zMax);
    assertTrue(/^x=-?\d+,\d\d, y=-?\d+,\d\d$/.test(info.optPos), info.optPos);
    assertEqual(h.text('infoZmax'), info.zMax);
    assertTrue(h.vm().legend.items.every((it) => /^-?\d+,\d$/.test(it.value)), 'Legende ohne Komma');
  });

  test('Koeffizient tippen: „2,5“ wird übernommen, Text wird abgewiesen', async () => {
    const h = await mount(null);
    const input = /** @type {HTMLInputElement} */ (h.container.querySelector('[data-ref="b1"]'));
    assertEqual(input.value, '8');
    input.value = '2,5';
    input.dispatchEvent(new Event('change'));
    await settle();
    assertDeepEqual(h.vm().model.b, [50, 2.5, 5, -3, -2, 1.5]);
    assertEqual(h.container.querySelector('[data-ref="b5"]').value, '1,5');
    input.value = 'abc';
    input.dispatchEvent(new Event('change'));
    await settle();
    assertEqual(h.vm().model.b[1], 2.5);
    assertEqual(input.value, '2,5');
  });

  test('Formelfehler foo(x): Diagramm bleibt (flache Fläche), Fehlertext sichtbar, read().surface null', async () => {
    const h = await mount(null);
    setFields(h.vm().model, { modelType: 'custom', customFormula: 'foo(x)' });
    await settle();
    assertTrue(h.host().querySelector('svg') !== null, 'kein SVG');
    assertTrue(h.image() !== null, 'kein Rasterbild');
    assertEqual(h.text('formula-error'), 'formulaErrFn');
    assertEqual(h.vm().read().surface, null);
    assertEqual(h.vm().info.zMax, '0,00');
    assertEqual(h.vm().legend.items.length, 10);
  });

  test('leerer z-Name: Platzhalter ist der übersetzte Rückfall und folgt der Sprache', async () => {
    const h = await mount(null);
    assertEqual(h.vm().model.zLabel, '');
    assertEqual(h.placeholder('zLabel'), 'Antwort Z');
    h.lang.current = 'en';
    mod.onLanguageChange();
    await settle();
    assertEqual(h.placeholder('zLabel'), 'Response Z');
    assertEqual(h.vm().model.zLabel, '');
  });
});
