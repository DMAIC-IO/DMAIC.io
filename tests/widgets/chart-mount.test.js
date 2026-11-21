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
import { toChart as scatterToChart } from '../../js/widgets/scatter-chart/mount.js';
import trendChart from '../../js/widgets/trend-chart/schema.js';
import histogramChart from '../../js/widgets/histogram-chart/schema.js';
import scatterChart from '../../js/widgets/scatter-chart/schema.js';
import { chartWidget } from '../../js/widgets/chart-parts.js';
import { chartMount } from '../../js/widgets/chart-mount.js';

const i18n = { t: (k) => k, getLanguage: () => 'de' };
let directiveRegistered = false;
const flush = () => new Promise((r) => setTimeout(r, 0));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function fakeManager({ delay = 0, fonts = { titleSize: 15 }, real = false } = {}) {
  const log = { created: [], updated: [], destroyed: 0 };
  return {
    log,
    create(el, type, config) {
      const chart = real
        ? new HistogramChart(el, { ...fonts, ...config }, { i18n, language: 'de', theme: 'light' })
        : { type, config: { ...fonts, ...config }, el, refreshes: 0, refreshEditor() { this.refreshes++; } };
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
/** Doc, das jeden Schreibzugriff auf chartEdits mitzählt (der erste ist die Vorbelegung). */
function countingDoc(writes) {
  return class extends Doc {
    get chartEdits() { return super.chartEdits; }
    set chartEdits(v) { writes.push(v); super.chartEdits = v; }
  };
}
const ScatterDoc = defineModel({ fields: { n: number({ default: 1 }) }, view: { chartEdits: scatterChart.edits() } });
const TrendDoc = defineModel({ fields: { n: number({ default: 1 }) }, view: { chartEdits: trendChart.edits() } });
const SERIES = (rev) => {
  const s = [{ name: 'A', values: [1, 2, 3], fillColor: 'red' }, { name: 'B', values: [4, 5], fillColor: 'blue' }];
  return rev ? s.reverse() : s;
};

async function host(inner, { cm, sm = null, extra = {}, model = {}, Model = null, history = null } = {}) {
  if (!Alpine.version) Alpine.start();
  if (!directiveRegistered) { registerWidgetDirective(Alpine, { i18n, widgets: WIDGETS }); directiveRegistered = true; }
  const services = { eventBus: null, stateManager: sm, i18n, chartManager: cm, instanceId: 'i1', moduleId: 'demo', history };
  const name = `wd${Math.random().toString(36).slice(2)}`;
  Alpine.data(name, () => {
    const comp = {
      model: Object.assign(new (Model || Doc)(), model), show: true, n: 1, rev: false, legacy: 'hist:old', ctrl: null, none: false,
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
    assertEqual(cm.log.updated.length, 1);
    data.show = false;
    await flush();
    assertEqual(cm.log.destroyed, 1);
    root.remove();
  });

  test('nach einem Aktualisieren wird der offene Editor auf die neuen Reihen umgestellt', async () => {
    const cm = fakeManager();
    const { root, data } = await host(HIST, { cm });
    const chart = cm.log.created[0];
    assertEqual(chart.refreshes, 0);
    data.n = 2;
    await flush();
    assertEqual(chart.refreshes, 1);
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

  test('abgelehntes create: der nächste Effektlauf versucht es erneut', async () => {
    const cm = fakeManager();
    let reject = null;
    let fail = true;
    const orig = cm.create;
    cm.create = (...a) => {
      if (!fail) return orig(...a);
      cm.log.created.push(null);
      return new Promise((_, rej) => { reject = rej; });
    };
    const { root, data } = await host(HIST, { cm });
    fail = false;
    const ow = console.warn; console.warn = () => {};
    reject(new Error('boom'));
    await flush();
    data.n = 2;
    await flush(); await flush();
    console.warn = ow;
    assertEqual(cm.log.created.length, 2);
    assertTrue(cm.log.created[1] !== null);
    root.remove();
  });

  test('create liefert null: der nächste Effektlauf versucht es erneut', async () => {
    const cm = fakeManager();
    let empty = true;
    const orig = cm.create;
    cm.create = (...a) => { if (empty) { cm.log.created.push(null); return Promise.resolve(null); } return orig(...a); };
    const { root, data } = await host(HIST, { cm });
    empty = false;
    data.n = 2;
    await flush(); await flush();
    assertEqual(cm.log.created.length, 2);
    root.remove();
  });

  test('Änderung vor dem Eintreffen des Diagramms wird ohne Editor-Neuaufbau nachgeführt', async () => {
    const cm = fakeManager({ delay: 20 });
    const { root, data } = await host(HIST, { cm });
    data.n = 2;
    await flush();
    await wait(60);
    const chart = cm.log.created[0];
    assertEqual(chart.refreshes, 0);
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
    assertDeepEqual(JSON.parse(JSON.stringify(b.data.model.chartEdits)), { title: 'Alt', showLegend: false });
    assertEqual(sm2.log.cleared.length, 1);
    b.root.remove();
  });

  test('Übernahme alter chartEdits: Feld gewinnt, Alteintrag wird gelöscht', async () => {
    const tpl = '<div x-widget="histogram-chart" x-widget-config="histogram" x-widget-value="model.chartEdits" x-widget-legacy-edit-key="legacy"></div>';
    const sm = fakeState({ title: 'X', showYTicks: true });
    const a = await host(tpl, { cm: fakeManager(), sm, model: { chartEdits: { title: 'Y' } } });
    assertDeepEqual(JSON.parse(JSON.stringify(a.data.model.chartEdits)), { title: 'Y', showYTicks: true });
    assertEqual(sm.log.cleared.length, 2);
    assertTrue(sm.log.cleared.every((c) => c[3] === null));
    a.root.remove();
    const sm2 = fakeState({ title: 'X' });
    const w2 = [];
    const b = await host(tpl, { cm: fakeManager(), sm: sm2, Model: countingDoc(w2), model: { chartEdits: { title: 'Y' } } });
    assertDeepEqual(JSON.parse(JSON.stringify(b.data.model.chartEdits)), { title: 'Y' });
    assertEqual(w2.length, 1);
    assertEqual(sm2.log.cleared.length, 1);
    assertEqual(sm2.log.cleared[0][3], null);
    b.root.remove();
    const sm3 = fakeState({ notEditable: 1 });
    const w3 = [];
    const c = await host(tpl, { cm: fakeManager(), sm: sm3, Model: countingDoc(w3), model: { chartEdits: { title: 'Y' } } });
    assertEqual(w3.length, 1);
    assertEqual(sm3.log.cleared.length, 1);
    c.root.remove();
  });

  test('Übernahme alter chartEdits: Feldwerte mit Reihen bleiben unverändert', async () => {
    const tpl = '<div x-widget="histogram-chart" x-widget-config="histogram" x-widget-value="model.chartEdits" x-widget-legacy-edit-key="legacy"></div>';
    const sm = fakeState({ title: 'X' });
    const series = [{ name: 'A', fillColor: 'red' }];
    const a = await host(tpl, { cm: fakeManager(), sm, model: { chartEdits: { series } } });
    assertDeepEqual(JSON.parse(JSON.stringify(a.data.model.chartEdits)), { series, title: 'X' });
    a.root.remove();
  });

  test('Übernahme alter chartEdits: mit Verlauf über amend', async () => {
    const tpl = '<div x-widget="histogram-chart" x-widget-config="histogram" x-widget-value="model.chartEdits" x-widget-legacy-edit-key="legacy"></div>';
    let amends = 0;
    let inAmend = false;
    const history = { amend(fn) { amends++; inAmend = true; try { fn(); } finally { inAmend = false; } } };
    const writes = [];
    const Model = class extends Doc {
      get chartEdits() { return super.chartEdits; }
      set chartEdits(v) { writes.push(inAmend); super.chartEdits = v; }
    };
    const sm = fakeState({ title: 'Alt' });
    const a = await host(tpl, { cm: fakeManager(), sm, Model, history });
    assertDeepEqual(JSON.parse(JSON.stringify(a.data.model.chartEdits)), { title: 'Alt' });
    assertEqual(amends, 1);
    assertEqual(writes.at(-1), true, 'Übernahme im amend');
    assertEqual(sm.log.cleared.length, 1);
    a.root.remove();
  });

  test('Übernahme alter chartEdits: ohne Alteintrag kein amend', async () => {
    const withKey = '<div x-widget="histogram-chart" x-widget-config="histogram" x-widget-value="model.chartEdits" x-widget-legacy-edit-key="legacy"></div>';
    const noKey = '<div x-widget="histogram-chart" x-widget-config="histogram" x-widget-value="model.chartEdits"></div>';
    for (const [tpl, old] of [[withKey, null], [withKey, {}], [noKey, { title: 'Alt' }]]) {
      let amends = 0;
      const history = { amend(fn) { amends++; fn(); } };
      const a = await host(tpl, { cm: fakeManager(), sm: fakeState(old), history });
      assertEqual(amends, 0, `kein amend (${JSON.stringify(old)})`);
      a.root.remove();
    }
  });

  test('Übernahme alter chartEdits: ohne Alteintrag kein Schreiben', async () => {
    const tpl = '<div x-widget="histogram-chart" x-widget-config="histogram" x-widget-value="model.chartEdits" x-widget-legacy-edit-key="legacy"></div>';
    for (const old of [null, {}]) {
      const sm = fakeState(old);
      const a = await host(tpl, { cm: fakeManager(), sm, model: { chartEdits: { title: 'Y' } } });
      assertDeepEqual(JSON.parse(JSON.stringify(a.data.model.chartEdits)), { title: 'Y' });
      assertEqual(sm.log.cleared.length, 0);
      a.root.remove();
    }
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

  test('Balken, Mosaik, Verlauf, Pareto: Typ und Gruppen unverändert durchgereicht', async () => {
    const groups = [{ name: 'B1', values: [1, 2], color: 'var(--color-chart-1)' }];
    const cases = [
      ['bar-chart', 'bar', { categories: ['x', 'y'], groups, stacked: true }],
      ['mosaic-chart', 'mosaic', { categories: ['x', 'y'], groups }],
      ['run-chart', 'run-chart', { values: [1, 2, 3], median: 2 }],
      ['pareto-chart', 'pareto', { categories: ['x', 'y'], groups, otherBucket: true }],
      ['gantt-chart', 'gantt', { tasks: [{ start: 1, end: 2, label: 'A', color: 'var(--ishikawa-status-done)' }], xDomain: { minT: 1, maxT: 2 }, showToday: false }],
      ['cumulative-cost-chart', 'cumulative-cost', { mode: 'rate', moneyPts: [{ t: 1, v: 2 }], hoursPts: [], xDomain: { min: 1, max: 2 }, moneyUnit: '€/d' }],
      ['pareto-chart', 'pareto', { categories: ['x', 'y'], groups, rightYLabel: 'Kumuliert %' }],
      ['multi-vari-chart', 'multi-vari', { panels: [{ panelLevel: '', groups: [{ level: 'a', mean: null, series: [] }] }], seriesLevels: ['s'], refValue: null }],
    ];
    for (const [name, type, cfg] of cases) {
      const cm = fakeManager();
      const { root } = await host(`<div x-widget="${name}" x-widget-config="cfg"></div>`, { cm, extra: { cfg } });
      assertEqual(cm.log.created[0].type, type);
      const made = cm.log.created[0].config;
      for (const k of Object.keys(cfg)) assertDeepEqual(made[k], cfg[k]);
      root.remove();
    }
  });

  test('Gage-Run: leerer Mittelwert (null) kommt als NaN beim Typ an', async () => {
    const cm = fakeManager();
    const cfg = { panels: [{ part: 'P1', series: [{ operator: 'A', values: [], mean: null }, { operator: 'B', values: [1], mean: 1 }] }], operators: ['A', 'B'], refValue: null };
    const { root } = await host('<div x-widget="gage-run-chart" x-widget-config="cfg"></div>', { cm, extra: { cfg } });
    assertEqual(cm.log.created[0].type, 'gage-run-chart');
    const made = cm.log.created[0].config;
    assertTrue(Number.isNaN(made.panels[0].series[0].mean));
    assertEqual(made.panels[0].series[1].mean, 1);
    assertEqual(made.refValue, null);
    root.remove();
  });

  test('Trend: Klick auf die Legende schreibt hiddenSeries in den Wert und die Konfiguration trägt ihn', async () => {
    const cm = fakeManager();
    const cfg = { series: [{ sid: 'H-001', name: 'A', color: 'var(--ishikawa-line-1)', points: [{ x: 0, y: 1 }, { x: 1, y: null }] }], xLabels: [{ date: 'd', name: 'n' }, { date: 'e', name: 'm' }], xCount: 2 };
    const { root, data } = await host('<div x-widget="trend-chart" x-widget-config="cfg" x-widget-value="model.chartEdits"></div>', { cm, Model: TrendDoc, extra: { cfg } });
    const chart = cm.log.created[0];
    assertEqual(chart.type, 'trend');
    chart.config.hiddenSeries = ['H-001'];
    chart.config.onEditorChange(chart);
    await flush();
    assertDeepEqual(JSON.parse(JSON.stringify(data.model.chartEdits)), { hiddenSeries: ['H-001'] });
    root.remove();
  });

  test('Boxplot und Einzelwertdiagramm: Gruppenfarben werden zur Farbliste', async () => {
    const groups = [{ name: 'A', values: [1, 2], color: 'var(--color-chart-1)' }, { name: 'B', values: [3, 4], color: 'var(--color-chart-2)' }];
    for (const [name, type, key] of [['boxplot-chart', 'boxplot', 'boxColors'], ['individual-value-plot-chart', 'individual-value-plot', 'pointColors']]) {
      const cm = fakeManager();
      const { root } = await host(`<div x-widget="${name}" x-widget-config="cfg"></div>`, { cm, extra: { cfg: { groups } } });
      assertEqual(cm.log.created[0].type, type);
      assertDeepEqual(cm.log.created[0].config[key], ['var(--color-chart-1)', 'var(--color-chart-2)']);
      root.remove();
    }
  });

  test('Boxplot ohne Gruppenfarben: keine Farbliste', async () => {
    const cm = fakeManager();
    const cfg = { groups: [{ name: 'A', values: [1, 2] }] };
    const { root } = await host('<div x-widget="boxplot-chart" x-widget-config="cfg"></div>', { cm, extra: { cfg } });
    assertEqual(cm.log.created[0].config.boxColors, undefined);
    assertDeepEqual(cm.log.created[0].config.groups, cfg.groups);
    root.remove();
  });

  test('Heatmap: null in den Zellen wird NaN', async () => {
    const cm = fakeManager();
    const cfg = { xCategories: ['u', 'v'], yCategories: ['p', 'q'], cells: [[1, null], [null, 4]] };
    const { root } = await host('<div x-widget="heatmap-chart" x-widget-config="cfg"></div>', { cm, extra: { cfg } });
    const cells = cm.log.created[0].config.cells;
    assertEqual(cm.log.created[0].type, 'heatmap');
    assertEqual(cells[0][0], 1);
    assertTrue(Number.isNaN(cells[0][1]));
    assertTrue(Number.isNaN(cells[1][0]));
    assertEqual(cells[1][1], 4);
    root.remove();
  });

  test('Torte: Typ pie, Stücke mit name unverändert durchgereicht', async () => {
    const cm = fakeManager();
    const cfg = { title: 'T', slices: [{ name: 'A', value: 3, color: 'red' }, { name: 'B', value: 1 }], innerRadius: 0.5 };
    const { root } = await host('<div x-widget="pie-chart" x-widget-config="cfg"></div>', { cm, extra: { cfg } });
    assertEqual(cm.log.created[0].type, 'pie');
    assertEqual(cm.log.created[0].config.slices[0].name, 'A');
    assertDeepEqual(cm.log.created[0].config.slices, cfg.slices);
    assertEqual(cm.log.created[0].config.innerRadius, 0.5);
    root.remove();
  });

  test('Kontur: Typ contour, null im Gitter kommt als null an', async () => {
    const cm = fakeManager();
    const cfg = { grid: [[1, null], [null, 4]], xRange: [0, 1], yRange: [0, 1] };
    const { root } = await host('<div x-widget="contour-chart" x-widget-config="cfg"></div>', { cm, extra: { cfg } });
    assertEqual(cm.log.created[0].type, 'contour');
    assertDeepEqual(cm.log.created[0].config.grid, [[1, null], [null, 4]]);
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

  test('Achsentitel und Titel der Modulkonfiguration sind die automatischen Werte des Editors (Platzhalter)', async () => {
    const cm = fakeManager({ real: true });
    const tpl = '<div x-widget="histogram-chart" x-widget-config="labelled" x-widget-value="model.chartEdits"></div>';
    const labelled = (xLabel) => ({ title: 'auto', xLabel, series: SERIES(false), data: [1] });
    const extra = { labelled: labelled('X-Spalte') };
    const { root, data } = await host(tpl, { cm, extra });
    const chart = cm.log.created[0];
    assertDeepEqual({ ...chart._autoLabels }, { title: 'auto', xLabel: 'X-Spalte' });
    data.labelled = labelled('Neu');
    await flush();
    await flush();
    assertEqual(chart._autoLabels.xLabel, 'Neu');
    assertEqual(chart._autoLabels.title, 'auto');
    root.remove();
  });

  test('Rückgängig einer Editor-Einstellung ohne Modulwert setzt das Diagramm auf die Vorgabe zurück', async () => {
    const cm = fakeManager({ real: true });
    const { root, data } = await host(HIST, { cm });
    const chart = cm.log.created[0];
    const before = chart.config.titleSize;
    chart.config.titleSize = 31;
    chart.config.onEditorChange(chart);
    await flush();
    await flush();
    assertEqual(data.model.chartEdits.titleSize, 31);
    data.model.chartEdits = {};
    await flush();
    await flush();
    assertEqual(chart.config.titleSize, before);
    root.remove();
  });

  test('eigener Editor-Write löst kein update am Diagramm aus', async () => {
    const cm = fakeManager();
    const { root } = await host(HIST, { cm });
    const chart = cm.log.created[0];
    const before = cm.log.updated.length;
    chart.config.title = 'Mein Titel';
    chart.config.onEditorChange(chart);
    await flush();
    await flush();
    assertEqual(cm.log.updated.length, before);
    assertEqual(chart.refreshes, 0);
    root.remove();
  });

  test('eigener Editor-Write, den das Feld in seine Schlüsselreihenfolge bringt: kein update, Editor bleibt', async () => {
    const cm = fakeManager();
    const scatter = { series: [{ name: 'A', x: [1, 2], y: [3, 4], color: '#111111' }] };
    const tpl = '<div x-widget="scatter-chart" x-widget-config="scatter" x-widget-value="model.chartEdits"></div>';
    const { root, data } = await host(tpl, {
      cm, Model: ScatterDoc, model: { chartEdits: { series: [{ name: 'A', color: '#ff0000' }] } }, extra: { scatter },
    });
    const chart = cm.log.created[0];
    const before = cm.log.updated.length;
    // Die Verbindungslinie kommt in der Reihe nach der Farbe dazu; das Feld ordnet nach dem Schema.
    chart.config.series[0].connectLine = { show: true, dash: 'dot', width: 2 };
    chart.config.onEditorChange(chart);
    await flush();
    await flush();
    assertEqual(data.model.chartEdits.series[0].connectLine.dash, 'dot');
    assertTrue(JSON.stringify(data.model.chartEdits.series[0]) !== JSON.stringify({ name: 'A', color: '#ff0000', connectLine: { show: true, dash: 'dot', width: 2 } }), 'Feld ordnet nicht um: Test prüft nichts');
    assertEqual(cm.log.updated.length, before);
    assertEqual(chart.refreshes, 0);
    root.remove();
  });

  test('abgelehnter Editor-Write: das Diagramm zeigt danach wieder den Modellwert', async () => {
    const cm = fakeManager();
    const { root, data } = await host(HIST, { cm, model: { chartEdits: { showLegend: false } } });
    const chart = cm.log.created[0];
    chart.config.showLegend = 'zzz';
    chart.config.onEditorChange(chart);
    await flush();
    assertEqual(data.model.chartEdits.showLegend, false);
    assertEqual(chart.config.showLegend, false);
    root.remove();
  });

  const FOC = 'input, select, textarea, button';
  async function openEditor() {
    const cm = fakeManager({ real: true });
    const h = await host(HIST, { cm });
    const chart = cm.log.created[0];
    chart._editorOpen = true;
    chart._buildEditor();
    return { ...h, chart, all: () => [...chart._editorInner.querySelectorAll(FOC)] };
  }

  test('fremder Wert bei offenem Editor: Fokus und Cursor bleiben am selben Feld', async () => {
    const { root, data, chart, all } = await openEditor();
    const input = chart._editorInner.querySelector('input[type="text"]');
    assertTrue(input !== null, 'Editor hat ein Textfeld');
    input.focus();
    input.value = 'abcdef';
    input.setSelectionRange(2, 2);
    const index = all().indexOf(input);
    data.model.chartEdits = { showLegend: false };
    await flush();
    assertEqual(chart.config.showLegend, false);
    const now = document.activeElement;
    assertTrue(chart._editorInner.contains(now), 'Fokus liegt weiter im Editor');
    assertEqual(all().indexOf(now), index);
    assertEqual(now.selectionStart, 2);
    root.remove();
  });

  test('Fokus außerhalb des Editors bleibt, wo er war', async () => {
    const { root, chart } = await openEditor();
    const other = document.createElement('input');
    document.body.append(other);
    other.focus();
    chart.refreshEditor();
    assertTrue(document.activeElement === other);
    other.remove();
    root.remove();
  });

  test('Fokus auf Auswahl oder Kontrollkästchen (ohne Cursor) wandert mit', async () => {
    const { root, chart, all } = await openEditor();
    const box = all().find((e) => e.type === 'checkbox' || e.tagName === 'SELECT');
    assertTrue(box !== undefined, 'Editor hat Kontrollkästchen oder Auswahl');
    box.focus();
    const index = all().indexOf(box);
    chart.refreshEditor();
    assertEqual(all().indexOf(document.activeElement), index);
    assertTrue(document.activeElement !== box, 'neues Element');
    root.remove();
  });

  test('erscheint vor dem Feld eine Zeile, erhält kein anderes Feld den Fokus', async () => {
    const { root, chart, all } = await openEditor();
    const input = chart._editorInner.querySelector('input[type="text"]');
    input.focus();
    const build = chart._buildEditor.bind(chart);
    chart._buildEditor = () => {
      build();
      const row = document.createElement('label');
      row.append('Neu', Object.assign(document.createElement('input'), { type: 'text' }));
      chart._editorInner.prepend(row);
    };
    chart.refreshEditor();
    const a = document.activeElement;
    assertTrue(!chart._editorInner.contains(a), 'kein Feld des Editors fokussiert');
    root.remove();
  });
});

suite('Diagramm-Widgets: Streudiagramm toChart', () => {
  test('xTickLabels: Beschriftung am nächsten ganzen Tick, sonst leer; xTicks bleibt', () => {
    const c = scatterToChart({ xTicks: [0, 1, 2], xTickLabels: ['A', 'B', 'C'], series: [] });
    assertEqual(c.xTickFormat(1), 'B');
    assertEqual(c.xTickFormat(1.2), 'B');
    assertEqual(c.xTickFormat(5), '');
    assertDeepEqual(c.xTicks, [0, 1, 2]);
    assertTrue(!('xTickLabels' in c) && !('xAxis' in c));
  });
  test('xAxis date: ISO-Datum, NaN leer', () => {
    const c = scatterToChart({ xAxis: 'date', series: [] });
    assertEqual(c.xTickFormat(Date.UTC(2026, 0, 5)), '2026-01-05');
    assertEqual(c.xTickFormat(NaN), '');
    assertTrue(!('xAxis' in c));
  });
  test('y mit null wird NaN, Eingabe bleibt unverändert', () => {
    const cfg = { series: [{ name: 'R', x: [1, 2, 3], y: [1, null, 3] }] };
    const c = scatterToChart(cfg);
    assertTrue(Number.isNaN(c.series[0].y[1]));
    assertEqual(c.series[0].y[0], 1);
    assertEqual(cfg.series[0].y[1], null);
  });
  test('errorBars kommt unverändert beim Typ an', () => {
    const eb = { show: true, yMode: 'relative', yPlus: [0.1, null], yMinus: [0.2, null] };
    const c = scatterToChart({ series: [{ name: 'R', x: [1, 2], y: [1, 2], errorBars: eb }] });
    assertDeepEqual(c.series[0].errorBars, eb);
  });
  test('ohne Besonderheiten bleibt die Konfiguration gleich', () => {
    const c = scatterToChart({ title: 'T', series: [{ name: 'R', x: [1], y: [2] }] });
    assertEqual(c.title, 'T');
    assertTrue(!('xTickFormat' in c));
  });
  test('Knotenlinien: zwei Links zeichnen zwei Pfade, highlight trägt die Klasse, Wechsel zeichnet neu', async () => {
    const { default: ChartManager } = await import('../../js/core/chart/chart-manager.js');
    const cm = new ChartManager({ on() {} }, i18n);
    const mk = (links) => ({ links, highlightClass: 'hl', padding: 0, origin: 'zero' });
    const two = mk([
      { from: 'a', to: 'b', shape: 'curve', x1: 10, y1: 0, x2: 50, y2: 40 },
      { from: 'a', to: 'c', shape: 'curve', x1: 10, y1: 0, x2: 90, y2: 40, highlight: true },
    ]);
    const { root, data } = await host('<div x-widget="node-links" x-widget-config="cfg"></div>', { cm, extra: { cfg: two } });
    await wait(60);
    const paths = () => [...root.querySelectorAll('svg path')].filter((p) => p.getAttribute('d')?.startsWith('M'));
    assertEqual(paths().length, 2);
    assertEqual(root.querySelectorAll('svg .hl').length, 1);
    assertEqual(root.querySelectorAll('.modebar, [data-ref="modebar"]').length, 0);
    data.cfg = mk([{ from: 'a', to: 'b', shape: 'elbow', x1: 10, y1: 0, x2: 50, y2: 40 }]);
    await wait(60);
    assertEqual(paths().length, 1);
    assertEqual(root.querySelectorAll('svg .hl').length, 0);
    root.remove();
    cm.destroyAll();
  });
});

suite('Diagramm-Widgets: roles', () => {
  const W = chartWidget({ name: 'test-roles', type: 'scatter', roles: ['moveLabel', 'select'] });
  const mountRoles = async (config, { command, cm = fakeManager(), notify = () => {} } = {}) => {
    const root = document.createElement('div');
    const warned = [];
    const ow = console.warn; console.warn = (...a) => warned.push(a.join(' '));
    const services = { chartManager: cm, i18n, notify, instanceId: 'i1' };
    try {
      chartMount(W)(root, { props: { config }, value: null, services, effect: (fn) => fn(), command });
      await flush();
    } finally { console.warn = ow; }
    return { cm, warned, chart: cm.log.created[0] };
  };

  test('api.roles und Schlüssel der Konfiguration', () => {
    assertDeepEqual([...W.roles], ['moveLabel', 'select']);
    assertTrue('commands' in W.props.config.shape && 'commandArgs' in W.props.config.shape);
    const plain = chartWidget({ name: 'test-plain', type: 'scatter' });
    assertDeepEqual([...plain.roles], []);
    assertTrue(!('commands' in plain.props.config.shape));
  });
  test('meldet über command', async () => {
    const calls = [];
    const command = async (name, args) => { calls.push([name, args]); return { ok: true }; };
    const { chart } = await mountRoles({ commands: { moveLabel: 'moveFn' }, commandArgs: { inst: 'a' } }, { command });
    await chart.config.onCommand('moveLabel', { id: 'f1', x: 3, y: 4 });
    assertDeepEqual(calls, [['moveFn', { inst: 'a', id: 'f1', x: 3, y: 4 }]]);
    assertTrue(!('commands' in chart.config) && !('commandArgs' in chart.config));
  });
  test('unbekannte Rolle wirft', async () => {
    let err = null;
    try { await mountRoles({ commands: { drag: 'x' } }, { command: async () => ({ ok: true }) }); } catch (e) { err = e; }
    assertTrue(err && /invalid role "drag"/.test(err.message));
    assertTrue(/allowed: moveLabel, select/.test(err.message));
  });
  test('fehlende Rolle: nur belegte Rollen, ohne commands weder onCommand noch commandRoles', async () => {
    const command = async () => ({ ok: true });
    const a = await mountRoles({ commands: { select: 'sel' } }, { command });
    assertDeepEqual(a.chart.config.commandRoles, ['select']);
    const b = await mountRoles({ title: 'x' }, { command });
    assertTrue(!('onCommand' in b.chart.config) && !('commandRoles' in b.chart.config));
  });
  test('ok: false meldet übersetzt, Ursache geht an console.warn, Diagramm wird neu gezeichnet', async () => {
    const seen = [];
    const command = async () => ({ ok: false, error: new Error('x') });
    const { cm, chart } = await mountRoles({ commands: { select: 'sel' } }, { command, notify: (m, t) => seen.push([m, t]) });
    const before = cm.log.updated.length;
    const warned = [];
    const ow = console.warn; console.warn = (...a) => warned.push(a.join(' '));
    try { await chart.config.onCommand('select', { id: 'a' }); } finally { console.warn = ow; }
    assertDeepEqual(seen, [['common.widget.commandRejected', 'error']]);
    assertEqual(cm.log.updated.length, before + 1);
    assertTrue(typeof chart.config.onCommand === 'function');
    assertTrue(warned.some((w) => /sel/.test(w)));
  });
  test('ein Kommando nimmt einem Feld außerhalb den Fokus, bevor es läuft', async () => {
    const field = document.createElement('input');
    document.body.append(field);
    try {
      field.focus();
      const events = [];
      field.addEventListener('focusout', () => events.push('focusout'));
      const command = async (name) => { events.push(name); return { ok: true }; };
      const { chart } = await mountRoles({ commands: { moveLabel: 'moveFn' } }, { command });
      await chart.config.onCommand('moveLabel', { id: 'f1', x: 1, y: 2 });
      assertDeepEqual(events, ['focusout', 'moveFn']);
      assertTrue(document.activeElement !== field);
    } finally { field.remove(); }
  });
  test('abgebrochenes Kommando: keine Meldung, aber Neuzeichnen', async () => {
    const seen = [];
    const command = async () => ({ ok: false, cancelled: true });
    const { cm, chart } = await mountRoles({ commands: { select: 'sel' } }, { command, notify: (m, t) => seen.push([m, t]) });
    const before = cm.log.updated.length;
    await chart.config.onCommand('select', {});
    assertEqual(seen.length, 0);
    assertEqual(cm.log.updated.length, before + 1);
  });
});
