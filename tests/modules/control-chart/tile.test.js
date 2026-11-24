/**
 * Regelkarte für Variablen: die SPC-Kachel (tile/tile.js) ohne DOM. Prüft
 * die Anzeige-Zahlen gegen die Literale der Altkachel (beide Altprojekte
 * und drei Beispiele, `en` und `de`), den Vergleich mit der Altkachel bei
 * gleichem Stand und gleichen Daten, die Rechnung der Kachel (eigene Rechnung
 * ohne Stufen, Ausschlüsse und eingefrorene Grenzen), den Fehlerfall ohne
 * Wurf, gelöschte Spalten, die Einstellungen und `enumerate`.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import tile from '../../../js/modules/control-chart/tile/tile.js';
import legacyTile from '../../../js/modules/control-chart/control-chart.tile.js';
import { engineRuns } from '../../../js/modules/control-chart/domain/analyze.js';
import { readSettings, checkValue } from '../../../js/core/model.js';
import { Settings } from '../../../js/modules/control-chart/tile/settings.js';
import { validateSchema, resolveSettings } from '../../../js/pages/dashboard/tile-settings.js';
import controlChartWidget from '../../../js/widgets/control-chart/schema.js';
import { withStoredWorksheetReader } from '../../helpers/worksheet-reader.js';
import { DURCHMESSER, LAENGE, RIESIG } from './analyze.test.js';
import { LEGACY, LEGACY_XBAR } from './migrations.test.js';

const ALL_RULES = [1, 2, 3, 4, 5, 6, 7, 8];
const UI = {};

/** Texte des Moduls je Sprache (einmal geladen). */
async function prepare() {
  for (const lang of ['de', 'en']) {
    if (UI[lang]) continue;
    const res = await fetch(new URL(`../../../js/modules/control-chart/resources/i18n/ui.${lang}.json`, import.meta.url), { cache: 'no-cache' });
    UI[lang] = await res.json();
  }
}

/** Text unter `key` mit `{name}` gefüllt; sonst der Schlüssel. @param {object} ui @param {string} key @param {object} [p] */
function lookup(ui, key, p) {
  const v = key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), ui);
  if (typeof v !== 'string') return key;
  return v.replace(/\{(\w+)\}/g, (_, k) => (p && k in p ? String(p[k]) : `{${k}}`));
}

/** i18n wie im Dashboard: `modules.control-chart.*` aus `ui.<lang>.json`, alles andere als Schlüssel. */
function i18nOf(lang) {
  const prefix = 'modules.control-chart.';
  return {
    language: lang,
    getLanguage: () => lang,
    t: (k, p) => (k.startsWith(prefix) ? lookup(UI[lang], k.slice(prefix.length), p) : k),
    tf: () => (k, p) => lookup(UI[lang], k, p),
  };
}

/** stateManager mit Arbeitsblättern Instanz-Id → gespeicherter Stand (gelesen wie `readSync`). */
function stateManagerOf(sheets) {
  return withStoredWorksheetReader({
    get: (p) => (p === 'phases' ? { control: Object.keys(sheets).map((instanceId) => ({ instanceId, moduleId: 'worksheet' })) } : null),
    getModuleState: (id) => sheets[id] ?? null,
  });
}

/** Ein Blatt mit einer Spalte als gespeicherter Stand. */
const oneSheet = (sheetId, columns) => ({
  sheets: [{ id: sheetId, name: 'S', state: { rowCount: Math.max(...columns.map((c) => c.values.length)), columns } }],
});

const WS = LEGACY.columnRef.instanceId;
/** Arbeitsblatt beider Altprojekte (Spalten wie in den Fixtures). */
const LEGACY_SHEETS = {
  [WS]: oneSheet(LEGACY.columnRef.sheetId, [
    { id: LEGACY.columnRef.columnId, name: 'Durchmesser', type: 'numeric', values: DURCHMESSER },
    { id: LEGACY_XBAR.columnRef.columnId, name: 'Laenge', type: 'numeric', values: LAENGE },
  ]),
};

/** Die drei Beispiele mit Kachel-Literalen: Arbeitsblatt unter `examples/`, Blatt, Spalte, Stand. */
const EXAMPLES = [
  ['control-chart-capability', 'worksheets/spc-subgroups-stable.json', 'sheet-xbar-r', 'c-diameter',
    { chartTypeId: 'xbar-r', subgroupSize: 5, usl: 10.25, lsl: 9.75, enabledRules: ALL_RULES }],
  ['control-chart-imr-annotated-frozen', 'shared/worksheets/spc-imr-shift.json', 'sheet-imr-shift', 'c-value', {
    baselineCount: 29, enabledRules: [1],
    annotations: { 13: { comment: 'Werkzeugwechsel / tool change', excluded: true } },
    frozenLimits: {
      chartTypeId: 'i-mr', subgroupSize: 1, columnRef: { instanceId: 'ws-ex', sheetId: 'sheet-imr-shift', columnId: 'c-value' }, baselineEnd: 29,
      primary: { cl: 9.974160714285713, ucl: 10.181934855038577, lcl: 9.766386573532849, sigma: 0.0692580469176214 },
      secondary: { cl: 0.07812307692307693, ucl: 0.25522809230769233, lcl: 0, sigma: 0.059035005128205136 },
      excludedIndices: [13],
    },
  }],
  ['control-chart-imr-shift', 'shared/worksheets/spc-imr-shift.json', 'sheet-imr-shift', 'c-value', { enabledRules: ALL_RULES }],
];

/** Stand und stateManager eines Beispiels. */
async function exampleCase([, file, sheetId, columnId, over]) {
  const res = await fetch(new URL(`../../../examples/${file}`, import.meta.url), { cache: 'no-cache' });
  const ws = await res.json();
  const state = {
    chartTypeId: 'i-mr', subgroupSize: 1, baselineCount: null, stagesText: '', usl: null, lsl: null,
    enabledRules: [1], annotations: {}, frozenLimits: null, exampleWorksheetId: null,
    columnRef: { instanceId: 'ws-ex', sheetId, columnId }, ...over,
  };
  return { state, sm: stateManagerOf({ 'ws-ex': ws }) };
}

/**
 * Was die Kachel zeigt, in der Form der Altkachel: Kopf, Kennwerte, Kennzahlen, Diagramm.
 * @param {any} vm
 */
function shown(vm) {
  return {
    empty: vm.empty, typeLabel: vm.typeLabel, colName: vm.colName,
    stats: vm.stats.map((s) => [s.label, s.value]),
    metrics: [vm.violations, vm.outOfSpec, vm.cpk].filter(Boolean).map((m) => [m.modifier, m.value, m.label, m.sub]),
  };
}

/** Dieselbe Sicht aus dem viewModel der Altkachel. @param {any} vm */
function shownLegacy(vm) {
  return {
    empty: vm.empty, typeLabel: vm.typeLabel, colName: vm.colName,
    stats: vm.stats.map((s) => [s.label, s.value]),
    metrics: vm.metrics.map((m) => [m.modifier, m.value, m.label, m.sub]),
  };
}

const settingsOf = (t, over = {}) => resolveSettings(validateSchema(t.settings), over);
const args = (t, state, sm, lang = 'en', over = {}) => ({
  tileId: 'spc:i', instanceId: 'i', state, settings: settingsOf(t, over), i18n: i18nOf(lang),
  theme: 'light', chartManager: null, stateManager: sm,
});
const vmOf = (state, sm, lang, over) => tile.viewModel(args(tile, state, sm, lang, over));
const legacyVmOf = (state, sm, lang, over) => legacyTile.viewModel(args(legacyTile, state, sm, lang, over));

/** Kachel-Literale (`en`): die Zahlen der Altkachel auf 4 bzw. 3 Stellen. */
const SHOWN_EN = {
  'legacy-project': {
    typeLabel: 'I-MR', colName: 'Durchmesser',
    stats: [['CL', '10.0000'], ['UCL', '10.2366'], ['LCL', '9.7634'], ['σ̂', '0.0789']],
    metrics: [
      ['dashboard-spc__metric--bad', '5', 'dashboard.spcViolations', 'dashboard.spcOf'],
      ['dashboard-spc__metric--warn', '1', 'dashboard.spcOutOfSpec', 'dashboard.spcOf'],
      ['dashboard-spc__metric--ok', '2.114', 'Cpk', 'Cp = 2.325'],
    ],
  },
  'legacy-project-xbar': {
    typeLabel: 'X̄-R', colName: 'Laenge',
    stats: [['CL', '10.1878'], ['UCL', '10.2649'], ['LCL', '10.1106'], ['σ̂', '0.0257']],
    metrics: [
      ['dashboard-spc__metric--bad', '8', 'dashboard.spcViolations', 'dashboard.spcOf'],
      ['dashboard-spc__metric--ok', '0', 'dashboard.spcOutOfSpec', 'dashboard.spcOf'],
      ['dashboard-spc__metric--ok', '3.407', 'Cpk', 'Cp = 4.638'],
    ],
  },
  'control-chart-capability': {
    typeLabel: 'X̄-R', colName: 'Durchmesser',
    stats: [['CL', '9.9914'], ['UCL', '10.0608'], ['LCL', '9.9220'], ['σ̂', '0.0231']],
    metrics: [
      ['dashboard-spc__metric--ok', '0', 'dashboard.spcViolations', 'dashboard.spcOf'],
      ['dashboard-spc__metric--ok', '0', 'dashboard.spcOutOfSpec', 'dashboard.spcOf'],
      ['dashboard-spc__metric--ok', '1.556', 'Cpk', 'Cp = 1.611'],
    ],
  },
  'control-chart-imr-annotated-frozen': {
    typeLabel: 'I-MR',
    stats: [['CL', '9.9810'], ['UCL', '10.2008'], ['LCL', '9.7612'], ['σ̂', '0.0733']],
    metrics: [['dashboard-spc__metric--bad', '8', 'dashboard.spcViolations', 'dashboard.spcOf']],
  },
  'control-chart-imr-shift': {
    typeLabel: 'I-MR',
    stats: [['CL', '10.0666'], ['UCL', '10.3187'], ['LCL', '9.8145'], ['σ̂', '0.0840']],
    metrics: [['dashboard-spc__metric--bad', '37', 'dashboard.spcViolations', 'dashboard.spcOf']],
  },
};

/** Prüft die Literale; der Spaltenname der Beispiele kommt aus der Datei und steht nur bei `capability` fest. */
function assertShown(id, vm) {
  const e = SHOWN_EN[id];
  const s = shown(vm);
  assertEqual(s.empty, null, id);
  assertEqual(s.typeLabel, e.typeLabel, id);
  if (e.colName) assertEqual(s.colName, e.colName, id);
  assertDeepEqual(s.stats, e.stats, id);
  assertDeepEqual(s.metrics, e.metrics, id);
}

suite('control-chart Kachel: Zahlen wie die Altkachel', () => {
  test('Altprojekt I-MR: Phase II, Ausschluss und Spezifikation wirken nicht (eigene Rechnung)', async () => {
    await prepare();
    const vm = vmOf(LEGACY, stateManagerOf(LEGACY_SHEETS));
    assertShown('legacy-project', vm);
    assertEqual(vm.chart.baselineEnd, 20);
    assertEqual(vm.chart.values.length, 30);
    assertDeepEqual(vm.chart.violationIndices, [20, 24, 25, 26, 28]);
    assertDeepEqual([vm.chart.usl, vm.chart.lsl], [10.5, 9.4]);
    assertDeepEqual(vm.chart.cl, [10.000000000000002], 'Livegrenze, nicht die eingefrorene CL 10');
  });

  test('Altprojekt X̄-R: ohne Stufen, keine Trennlinie', async () => {
    await prepare();
    const vm = vmOf(LEGACY_XBAR, stateManagerOf(LEGACY_SHEETS));
    assertShown('legacy-project-xbar', vm);
    assertEqual(vm.chart.baselineEnd, null);
    assertEqual(vm.chart.values.length, 8);
  });

  test('Beispiele capability, imr-annotated-frozen, imr-shift', async () => {
    await prepare();
    for (const ex of EXAMPLES) {
      const { state, sm } = await exampleCase(ex);
      assertShown(ex[0], vmOf(state, sm));
    }
  });

  test('de: Dezimalkomma in Kennwerten, Cpk und „Cp = …“', async () => {
    await prepare();
    const vm = vmOf(LEGACY, stateManagerOf(LEGACY_SHEETS), 'de');
    assertDeepEqual(shown(vm).stats, [['CL', '10,0000'], ['UCL', '10,2366'], ['LCL', '9,7634'], ['σ̂', '0,0789']]);
    assertDeepEqual([vm.cpk.value, vm.cpk.label, vm.cpk.sub], ['2,114', 'Cpk', 'Cp = 2,325']);
  });

  test('gleich der Altkachel: Kopf, Kennwerte, Kennzahlen und Diagramm (beide Altprojekte, drei Beispiele, lastN)', async () => {
    await prepare();
    const cases = [
      ['legacy-project', LEGACY, stateManagerOf(LEGACY_SHEETS)],
      ['legacy-project-xbar', LEGACY_XBAR, stateManagerOf(LEGACY_SHEETS)],
    ];
    for (const ex of EXAMPLES) {
      const { state, sm } = await exampleCase(ex);
      cases.push([ex[0], state, sm]);
    }
    for (const [id, state, sm] of cases) {
      for (const over of [{}, { lastN: 10 }]) {
        const vm = vmOf(state, sm, 'en', over);
        const old = legacyVmOf(state, sm, 'en', over);
        assertDeepEqual(shown(vm), shownLegacy(old), id);
        const { cl, ucl, lcl, sigma, violationIndices, ...rest } = vm.chart;
        const o = old.chart;
        assertDeepEqual([cl, ucl, lcl, sigma], [[o.cl], [o.ucl], [o.lcl], [o.sigma]], `${id}: Grenzen als Listen`);
        // Die Altkachel listet in der Reihenfolge der Regeln, die neue aufsteigend; das Widget nimmt eine Menge.
        assertDeepEqual(violationIndices, [...o.violationIndices].sort((a, b) => a - b), id);
        for (const k of ['values', 'baselineEnd', 'xOffset', 'xMin', 'xMax', 'usl', 'lsl', 'showZones', 'xLabel', 'yLabel']) {
          assertDeepEqual(rest[k], o[k], `${id}: ${k}`);
        }
      }
    }
  });

  test('die Kachel zählt nicht als Rechnung des Moduls', async () => {
    await prepare();
    const n = engineRuns();
    shown(vmOf(LEGACY, stateManagerOf(LEGACY_SHEETS)));
    assertEqual(engineRuns(), n);
  });
});

suite('control-chart Kachel: Leer- und Fehlerfälle', () => {
  const COL = { instanceId: 'w', sheetId: 's', columnId: 'v' };
  const STATE = { chartTypeId: 'i-mr', subgroupSize: 1, columnRef: COL };
  const sm = (values, name = 'Messwert') => stateManagerOf({ w: oneSheet('s', [{ id: 'v', name, type: 'numeric', values }]) });

  test('ohne Spalte spcEmpty, ohne Stand ebenso; unter zwei Werten spcNoData', async () => {
    await prepare();
    assertEqual(vmOf({ ...STATE, columnRef: null }, sm([1, 2])).empty, 'dashboard.spcEmpty');
    assertEqual(vmOf(undefined, sm([1, 2])).empty, 'dashboard.spcEmpty');
    const one = vmOf(STATE, sm([10]));
    assertEqual(one.empty, 'dashboard.spcNoData');
    assertEqual(one.chart, null);
    assertEqual(one.typeLabel, '');
    assertDeepEqual(one.stats.map((s) => s.value), ['—', '—', '—', '—']);
  });

  test('Werte um 1,7·10³⁰⁸: keine Daten statt NaN, kein Wurf, eine Warnung', async () => {
    await prepare();
    const warn = console.warn;
    let warned = 0;
    console.warn = () => { warned++; };
    try {
      const vm = vmOf(STATE, sm(RIESIG));
      assertDeepEqual(vm.analysis, { status: 'error', reason: 'errCompute' });
      assertEqual(vm.empty, 'dashboard.spcNoData');
      assertEqual(vm.chart, null);
      assertEqual(vm.cpk, null);
      assertEqual(vm.outOfSpec, null);
      assertEqual(vm.violations.value, '0');
      assertTrue(vm.stats.every((s) => s.value === '—'));
    } finally {
      console.warn = warn;
    }
    assertEqual(warned, 1, 'eine Rechnung je Rendern');
  });

  test('gelöschte Spalte oder unbekanntes Arbeitsblatt: keine Daten, Spaltenname „?“', async () => {
    await prepare();
    const gone = vmOf({ ...STATE, columnRef: { ...COL, columnId: 'weg' } }, sm([1, 2, 3]));
    assertEqual(gone.empty, 'dashboard.spcNoData');
    assertEqual(gone.colName, '?');
    assertEqual(vmOf({ ...STATE, columnRef: { ...COL, instanceId: 'fremd' } }, sm([1, 2, 3])).empty, 'dashboard.spcNoData');
  });

  test('Text und Leerzellen fallen heraus wie in der Altkachel', async () => {
    await prepare();
    const values = [10, '2,5', null, 10.2, 9.8, '', 10.1];
    const vm = vmOf(STATE, sm(values));
    assertEqual(vm.chart.values.length, 4);
    assertDeepEqual(shown(vm), shownLegacy(legacyVmOf(STATE, sm(values))));
  });

  test('Diagrammkonfiguration erfüllt das Schema des Widgets', async () => {
    await prepare();
    const vm = vmOf(LEGACY, stateManagerOf(LEGACY_SHEETS), 'en', { lastN: 5 });
    checkValue(controlChartWidget.props.config, 'chart', vm.chart);
    assertEqual(vm.chart.values.length, 5);
    assertEqual(vm.chart.xOffset, 25);
    for (const k of ['showTitle', 'showXLabel', 'showYLabel', 'showXTicks', 'showYTicks', 'showLegend']) assertEqual(vm.chart[k], false, k);
    assertEqual(vm.chart.showZones, true);
    assertEqual(vm.chart.xLabel, UI.en.xLabelSample);
    assertEqual(vmOf(LEGACY, stateManagerOf(LEGACY_SHEETS), 'en', { showChart: false }).chart, null);
  });
});

suite('control-chart Kachel: Vertrag und Einstellungen', () => {
  test('enumerate: eine Kachel je Instanz mit tileId spc:<id> und Titel „SPC — …“', async () => {
    await prepare();
    const ctx = { i18n: i18nOf('de'), findInstances: (id) => (id === 'control-chart' ? [{ instanceId: 'a', customName: 'Linie 2' }, { instanceId: 'b' }] : []) };
    assertDeepEqual(tile.enumerate(ctx), [
      { tileId: 'spc:a', instanceId: 'a', title: 'SPC — Linie 2' },
      { tileId: 'spc:b', instanceId: 'b', title: `SPC — ${UI.de.name}` },
    ]);
    assertDeepEqual(tile.enumerate(ctx), legacyTile.enumerate(ctx), 'gleich der Altkachel');
  });

  test('Größe, Präfix und refreshOn (mit Arbeitsblattänderung)', () => {
    assertDeepEqual(tile.size, legacyTile.size);
    assertEqual(tile.titlePrefix, 'SPC');
    assertDeepEqual(tile.refreshOn, ['state:saved', 'resize', 'worksheet:dataChanged']);
    assertEqual(tile.template, 'js/modules/control-chart/resources/tile.html');
  });

  test('Einstellungen wie die Altkachel: lastN 0–500 ganzzahlig, showChart; Labels fallen auf dashboard.tileSettings zurück', () => {
    const s = tile.settings;
    assertDeepEqual(Object.keys(s), Object.keys(legacyTile.settings));
    assertDeepEqual([s.lastN.type, s.lastN.min, s.lastN.max, s.lastN.step, s.lastN.default], ['number', 0, 500, 1, 0]);
    assertDeepEqual([s.showChart.type, s.showChart.default], ['boolean', true]);
    assertDeepEqual(s.lastN.label, ['modules.control-chart.tile.settings.lastN.label', 'dashboard.tileSettings.lastN']);
    assertEqual(s.showChart.helpKey, 'modules.control-chart.tile.settings.showChart.help');
    const warnings = [];
    validateSchema(s, (m) => warnings.push(m));
    assertDeepEqual(warnings, []);
  });

  test('gespeicherte Einstellungen der Altkachel gelten unverändert, Ungültiges fällt auf die Vorgabe', () => {
    assertDeepEqual(readSettings(Settings, { lastN: 30, showChart: false }), { lastN: 30, showChart: false });
    assertDeepEqual(readSettings(Settings, resolveSettings(validateSchema(legacyTile.settings), { lastN: 12 })), { lastN: 12, showChart: true });
    assertDeepEqual(readSettings(Settings, { lastN: 900, showChart: 'ja' }), { lastN: 0, showChart: true });
    assertDeepEqual(readSettings(Settings, undefined), { lastN: 0, showChart: true });
  });
});
