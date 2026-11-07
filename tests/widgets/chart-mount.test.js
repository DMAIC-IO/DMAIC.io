/**
 * Diagramm-Widgets (js/widgets/chart-mount.js): Erzeugen, Aktualisieren, Abbau,
 * Editor-Rückmeldung in den Modulzustand, Übernahme alter chartEdits.
 */
import Alpine from '../../vendor/alpinejs/csp.js';
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import { defineModel, number } from '../../js/core/model.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import HistogramChart from '../../js/core/chart/types/histogram.js';
import histogramChart from '../../js/widgets/histogram-chart/schema.js';

const i18n = { t: (k) => k, getLanguage: () => 'de' };
const flush = () => new Promise((r) => setTimeout(r, 0));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function fakeManager({ delay = 0, fonts = { titleSize: 15 }, real = false } = {}) {
  const log = { created: [], updated: [], destroyed: 0 };
  return {
    log,
    create(el, type, config) {
      const chart = real
        ? new HistogramChart(el, { ...fonts, ...config }, { i18n, language: 'de', theme: 'light' })
        : { type, config: { ...fonts, ...config }, el };
      log.created.push(chart);
      return new Promise((r) => setTimeout(() => r(chart), delay));
    },
    update(chart, patch) { Object.assign(chart.config, patch); log.updated.push(patch); },
    destroy() { log.destroyed++; },
  };
}

function fakeState(old = null) {
  const log = { reads: [], cleared: [] };
  return {
    log,
    getChartEdits(inst, key) { log.reads.push([inst, key]); return old; },
    setChartEdit(inst, key, k, v) { log.cleared.push([inst, key, k, v]); },
  };
}

const Doc = defineModel({ fields: { n: number({ default: 1 }) }, view: { chartEdits: histogramChart.edits() } });
const SERIES = (rev) => {
  const s = [{ name: 'A', values: [1, 2, 3], fillColor: 'red' }, { name: 'B', values: [4, 5], fillColor: 'blue' }];
  return rev ? s.reverse() : s;
};

async function host(inner, { cm, sm = null, extra = {}, model = {} } = {}) {
  if (!Alpine.version) Alpine.start();
  registerWidgetDirective(Alpine, { i18n, widgets: WIDGETS });
  const services = { eventBus: null, stateManager: sm, i18n, chartManager: cm, instanceId: 'i1', moduleId: 'demo' };
  const name = `wd${Math.random().toString(36).slice(2)}`;
  Alpine.data(name, () => {
    const comp = {
      model: Object.assign(new Doc(), model), show: true, n: 1, rev: false, legacy: 'hist:old', ctrl: null, none: false,
      get histogram() { return { title: 'auto', series: SERIES(this.rev), data: [this.n] }; },
      get nothing() { return this.none ? null : { title: 'x', series: SERIES(false), data: [1] }; },
      ...extra,
    };
    Object.defineProperty(comp, '_ui', { enumerable: false, get() { return { services }; } });
    return comp;
  });
  const root = document.createElement('div');
  root.setAttribute('x-data', name);
  root.innerHTML = inner;
  document.body.append(root);
  // Widget-Fehler gehen als Warnung hinaus: im Test sind sie Fehler.
  const ow = console.warn; const seen = []; console.warn = (...a) => seen.push(a.join(' '));
  Alpine.initTree(root);
  await flush();
  await flush();
  console.warn = ow; if (seen.length) throw new Error('WARN ' + seen.join(' || '));
  return { root, data: Alpine.$data(root) };
}

const HIST = '<template x-if="show"><div x-widget="histogram-chart" x-widget-config="histogram" x-widget-value="model.chartEdits"></div></template>';

suite('Diagramm-Widgets (chart-mount)', () => {
  test('Erzeugen, Aktualisieren, Abbau', async () => {
    const cm = fakeManager();
    const { root, data } = await host(HIST, { cm });
    assertEqual(cm.log.created.length, 1);
    assertEqual(cm.log.created[0].type, 'histogram');
    assertEqual(cm.log.created[0].config.series.length, 2);
    data.n = 2;
    await flush();
    assertEqual(cm.log.created.length, 1);
    assertTrue(cm.log.updated.length >= 1);
    data.show = false;
    await flush();
    assertEqual(cm.log.destroyed, 1);
    root.remove();
  });

  test('überholtes create wird verworfen', async () => {
    const cm = fakeManager({ delay: 20 });
    const { root, data } = await host(HIST, { cm });
    data.show = false; await flush(); data.show = true;
    await wait(80);
    assertEqual(cm.log.created.length - cm.log.destroyed, 1);
    root.remove();
  });

  test('Editor-Änderung geht in value, Leeren stellt automatisch wieder her, Reihen nach Name', async () => {
    const cm = fakeManager();
    const { root, data } = await host(HIST, { cm });
    const chart = cm.log.created[0];
    chart.config.title = 'Mein Titel';
    chart.config.series[1].fillColor = 'green';
    chart.config.onEditorChange(chart);
    await flush();
    assertDeepEqual(JSON.parse(JSON.stringify(data.model.chartEdits)), { title: 'Mein Titel', series: [{ name: 'B', fillColor: 'green' }] });
    assertEqual(cm.log.created.length, 1);
    chart.config.title = '';
    chart.config.onEditorChange(chart);
    await flush();
    assertTrue(!('title' in data.model.chartEdits));
    assertEqual(chart.config.title, 'auto');
    data.rev = true;
    await flush();
    const last = cm.log.updated.at(-1);
    assertEqual(last.series[0].name, 'B');
    assertEqual(last.series[0].fillColor, 'green');
    root.remove();
  });

  test('gespeicherte Einstellungen beim ersten Zeichnen', async () => {
    const cm = fakeManager();
    const { root } = await host(HIST, { cm, model: { chartEdits: { showLegend: false } } });
    assertEqual(cm.log.created[0].config.showLegend, false);
    root.remove();
  });

  test('entfallene gespeicherte Einstellung wird im Diagramm zurückgesetzt', async () => {
    const cm = fakeManager({ real: true });
    const { root, data } = await host(HIST, { cm, model: { chartEdits: { showLegend: false } } });
    assertEqual(cm.log.created[0].config.showLegend, false);
    data.model.chartEdits = {};
    await flush();
    assertEqual(cm.log.created[0].config.showLegend, true);
    assertEqual(cm.log.created.length, 1);
    root.remove();
  });

  test('ohne x-widget-value keine Rückmeldung', async () => {
    const cm = fakeManager();
    const { root } = await host('<div x-widget="histogram-chart" x-widget-config="histogram"></div>', { cm });
    assertEqual(cm.log.created.length, 1);
    assertEqual(cm.log.created[0].config.onEditorChange, undefined);
    root.remove();
  });

  test('Übernahme alter chartEdits', async () => {
    const cm = fakeManager();
    const sm = fakeState({ title: 'Alt', showYTicks: true, notEditable: 1 });
    const tpl = '<div x-widget="histogram-chart" x-widget-config="histogram" x-widget-value="model.chartEdits" x-widget-legacy-edit-key="legacy"></div>';
    const a = await host(tpl, { cm, sm });
    assertDeepEqual(JSON.parse(JSON.stringify(a.data.model.chartEdits)), { title: 'Alt', showYTicks: true });
    assertEqual(sm.log.cleared.length, 3);
    assertTrue(sm.log.cleared.every((c) => c[3] === null));
    a.root.remove();
    const sm2 = fakeState({ title: 'Alt' });
    const b = await host(tpl, { cm: fakeManager(), sm: sm2, model: { chartEdits: { showLegend: false } } });
    assertEqual(sm2.log.reads.length, 0);
    assertEqual(sm2.log.cleared.length, 0);
    b.root.remove();
  });

  test('Regelkarte: Grenzen als Zahl, Indizes als Set', async () => {
    const cm = fakeManager();
    const { root } = await host('<div x-widget="control-chart" x-widget-config="ctrl"></div>', {
      cm, extra: { ctrl: { values: [1, 2], cl: [1.5], ucl: [3, 3], lcl: [0, 0], sigma: [0.4], violationIndices: [1] } },
    });
    const c = cm.log.created[0].config;
    assertEqual(c.cl, 1.5);
    assertDeepEqual(c.ucl, [3, 3]);
    assertTrue(c.violationIndices instanceof Set && c.violationIndices.has(1));
    root.remove();
  });

  test('config null: kein Diagramm, dann gültig, dann wieder abgebaut', async () => {
    const cm = fakeManager();
    const { root, data } = await host('<div x-widget="histogram-chart" x-widget-config="nothing"></div>', { cm, extra: { none: true } });
    assertEqual(cm.log.created.length, 0);
    data.none = false;
    await flush();
    assertEqual(cm.log.created.length, 1);
    data.none = true;
    await flush();
    assertEqual(cm.log.destroyed, 1);
    root.remove();
  });
});
