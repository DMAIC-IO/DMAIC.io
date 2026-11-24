/**
 * Regelkarte für Variablen (I-MR, X̄-R, X̄-S): Model (domain/model.js) —
 * Schema und Vorgaben gegen die Engine, Schreiben über `instance.set`
 * (`setFields`), Invarianten `subgroupRange` und `chartKeys`, Kommandos und
 * Ableitungen.
 */
import { suite, test, assert, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../../test-utils.js';
import {
  State, SUBGROUP_RANGE, CHART_KEYS, clampSubgroup,
} from '../../../js/modules/control-chart/domain/model.js';
import { inputsOf, analyze, freezeLimitsOf, engineRuns } from '../../../js/modules/control-chart/domain/analyze.js';
import { CHART_TYPES, NELSON_RULES, DEFAULT_ENABLED_RULES } from '../../../js/engines/control-chart-engine.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { setFields } from '../../../js/core/model.js';
import { writableByAgent } from '../../../js/core/agent/agent-schema.js';
import { sourceColumns } from '../../../js/core/source-columns.js';
import controlChart from '../../../js/widgets/control-chart/schema.js';
import { sheetSource } from '../../helpers/sheet-source.js';
import {
  DURCHMESSER, LAENGE, TEST_DATA_CONTROL, RIESIG, LEGACY_RESULT, LEGACY_XBAR_RESULT, TEST_DATA_CONTROL_RESULT,
  BOLZEN_CSV_RESULT,
} from './analyze.test.js';
import { LEGACY, LEGACY_XBAR } from './migrations.test.js';

const plain = (v) => JSON.parse(JSON.stringify(v));
const ref = (c) => ({ instanceId: 'ws1', sheetId: 's1', columnId: c });
/** Übersetzer-Stub. */
const T = (k) => `«${k}»`;

const SRC = sheetSource({ durchmesser: DURCHMESSER, laenge: LAENGE, value: TEST_DATA_CONTROL, riesig: RIESIG, kurz: [1] });
/** Das Arbeitsblatt der Altprojekt-Fixtures (Ids wie dort). */
const LEGACY_SRC = sheetSource({ col_src_durchmesser: DURCHMESSER, col_src_laenge: LAENGE },
  { instanceId: LEGACY.columnRef.instanceId, sheetId: 'sheet_1' });

const load = (json) => State.fromJSON(json, { repair: true });
/** @param {Record<string, any>} [values] */
const make = (values = {}) => { const m = new State(); setFields(m, values); return m; };
/** @param {any} m @param {string[]} [names] @param {any} [src] */
const derived = (m, names, src = SRC) => evaluateDerived(m, src, names, T);

/** @param {() => void} fn @returns {any} der Fehler */
function thrown(fn) {
  try { fn(); } catch (e) { return e; }
  throw new Error('erwartet: Ablehnung');
}

/** Die Schlüssel eines Objekts, rekursiv (Pfade). */
const keyPaths = (o, p = '') => Object.entries(o).flatMap(([k, v]) =>
  (v && typeof v === 'object' && !Array.isArray(v) && !('instanceId' in v) ? keyPaths(v, `${p}${k}.`) : [`${p}${k}`]));
/** Die Schlüssel einer `object`-Form, rekursiv (Pfade). */
const shapePaths = (s, p = '') => Object.entries(s.shape).flatMap(([k, v]) =>
  (v.kind === 'object' ? shapePaths(v, `${p}${k}.`) : [`${p}${k}`]));

suite('control-chart: Model — Schema gegen die Engine', () => {
  test('Kartentypen: Literal gleich den Typen der Engine, Vorgabe I-MR', () => {
    const f = State.schema.fields.chartTypeId;
    assertEqual(f.kind, 'oneOf');
    assertDeepEqual([...f.values], CHART_TYPES.map((c) => c.id));
    assertDeepEqual([...State.schema.fields.frozenLimits.shape.chartTypeId.values], CHART_TYPES.map((c) => c.id));
    assertDeepEqual([...State.schema.commands.setChartType.params.chartTypeId.values], CHART_TYPES.map((c) => c.id));
  });

  test('Regeln: Literal gleich den Nelson-Regeln der Engine, Vorgabe wie die Engine', () => {
    const ids = NELSON_RULES.map((r) => r.id);
    const f = State.schema.fields.enabledRules;
    assertEqual(f.kind, 'list');
    assertDeepEqual([...f.item.values], ids);
    assertEqual(f.unique, true);
    assertEqual(f.sorted, true);
    assertDeepEqual([...f.default], DEFAULT_ENABLED_RULES);
    assertDeepEqual([...State.schema.commands.toggleRule.params.ruleId.values], ids);
  });

  test('SUBGROUP_RANGE gleich dem Bereich der Engine; Feldgrenzen umfassen alle Typen', () => {
    assertDeepEqual(Object.keys(SUBGROUP_RANGE), CHART_TYPES.map((c) => c.id));
    for (const c of CHART_TYPES) assertDeepEqual([...SUBGROUP_RANGE[c.id]], [c.minSubgroupSize, c.maxSubgroupSize], c.id);
    const f = State.schema.fields.subgroupSize;
    assertEqual(f.integer, true);
    assertEqual(f.min, Math.min(...CHART_TYPES.map((c) => c.minSubgroupSize)));
    assertEqual(f.max, Math.max(...CHART_TYPES.map((c) => c.maxSubgroupSize)));
    assert(Object.isFrozen(SUBGROUP_RANGE));
  });

  test('CHART_KEYS gleich den Teilkarten-Ids der Engine, eingefroren', () => {
    assertDeepEqual([...CHART_KEYS], [...new Set(CHART_TYPES.flatMap((c) => c.subcharts.map((s) => s.id)))]);
    assert(Object.isFrozen(CHART_KEYS));
  });

  test('clampSubgroup klemmt in den Bereich', () => {
    assertDeepEqual([clampSubgroup('i-mr', 5), clampSubgroup('xbar-r', 30), clampSubgroup('xbar-r', 1), clampSubgroup('xbar-s', 30), clampSubgroup('xbar-s', 7)],
      [1, 10, 2, 25, 7]);
  });
});

suite('control-chart: Model — Schema und Vorgaben', () => {
  test('Felder, Ansicht, Kommandos, Invarianten', () => {
    assertDeepEqual(Object.keys(State.schema.fields), ['chartTypeId', 'subgroupSize', 'columnRef', 'baselineCount',
      'stagesText', 'usl', 'lsl', 'enabledRules', 'annotations', 'frozenLimits']);
    assertDeepEqual(Object.keys(State.schema.view).sort(), ['charts', 'exampleWorksheetId']);
    assertDeepEqual(Object.keys(State.schema.commands), ['setChartType', 'toggleRule', 'removeAnnotation']);
    assertDeepEqual(Object.keys(State.schema.invariants), ['subgroupRange', 'chartKeys']);
    assertDeepEqual([...State.schema.invariants.chartKeys.fields], ['charts']);
    assertDeepEqual([...State.schema.invariants.subgroupRange.fields], ['subgroupSize', 'chartTypeId']);
  });

  test('Spalte numerisch ab zwei Werten, nullbar; Phase I ganzzahlig ab 1, nullbar; LSL/USL Zahl, nullbar', () => {
    const c = State.schema.fields.columnRef;
    assertEqual(c.kind, 'columnRef');
    assertDeepEqual([...c.types], ['numeric']);
    assertEqual(c.minCount, 2);
    assertEqual(c.nullable, true);
    const b = State.schema.fields.baselineCount;
    assertEqual(b.integer, true);
    assertEqual(b.min, 1);
    assertEqual(b.nullable, true);
    for (const k of ['usl', 'lsl']) {
      assertEqual(State.schema.fields[k].kind, 'number', k);
      assertEqual(State.schema.fields[k].nullable, true, k);
    }
  });

  test('Anmerkungen: Map mit Zahlschlüssel ab 0, Wert { comment, excluded }', () => {
    const a = State.schema.fields.annotations;
    assertEqual(a.kind, 'map');
    assertEqual(a.key.kind, 'number');
    assertEqual(a.key.integer, true);
    assertEqual(a.key.min, 0);
    assertDeepEqual(Object.keys(a.value.shape), ['comment', 'excluded']);
  });

  test('Ansicht: Editor-Einstellungen je Teilkarte und Beispielblatt', () => {
    assertEqual(State.schema.view.charts.kind, 'map');
    assertEqual(State.schema.view.charts.value.kind, controlChart.edits().kind);
    assertEqual(State.schema.view.exampleWorksheetId.nullable, true);
  });

  test('Anmerkungen und eingefrorene Grenzen schreibt der Agent nicht; die übrigen Felder schon', () => {
    assertEqual(writableByAgent(State.schema.fields.annotations), false);
    assertEqual(writableByAgent(State.schema.fields.frozenLimits), false);
    for (const k of ['chartTypeId', 'subgroupSize', 'columnRef', 'baselineCount', 'stagesText', 'usl', 'lsl', 'enabledRules']) {
      assertEqual(writableByAgent(State.schema.fields[k]), true, k);
    }
  });

  test('Vorgaben und kein Inhalt', () => {
    const m = new State();
    const { _schema, ...json } = plain(m.toJSON());
    assertDeepEqual(json, {
      chartTypeId: 'i-mr', subgroupSize: 1, columnRef: null, baselineCount: null, stagesText: '', usl: null, lsl: null,
      enabledRules: [1], annotations: {}, frozenLimits: null, exampleWorksheetId: null, charts: {},
    });
    assertEqual(m.hasContent(), false);
  });

  test('hasContent: jede Abweichung zählt, Ansichtsfelder nicht', () => {
    for (const v of [{ columnRef: ref('value') }, { baselineCount: 5 }, { stagesText: '10' }, { usl: 1 }, { lsl: 1 },
      { enabledRules: [] }, { enabledRules: [1, 2] }, { annotations: { 3: { comment: 'x', excluded: false } } }]) {
      assertEqual(make(v).hasContent(), true, JSON.stringify(v));
    }
    const s = new State();
    s.setChartType({ chartTypeId: 'xbar-r' });
    assertEqual(s.hasContent(), true, 'Kartentyp');
    const v = new State();
    v.exampleWorksheetId = 'x';
    v.charts = { i: { title: 'T' } };
    assertEqual(v.hasContent(), false);
  });
});

suite('control-chart: Model — instance.set', () => {
  test('Felder setzen und leeren', () => {
    const m = make({ columnRef: ref('value'), baselineCount: 12, stagesText: '10, 20', usl: 24.5, lsl: -1, enabledRules: [6, 2, 2] });
    assertDeepEqual(plain(m.columnRef), ref('value'));
    assertEqual(m.baselineCount, 12);
    assertEqual(m.stagesText, '10, 20');
    assertEqual(m.usl, 24.5);
    assertEqual(m.lsl, -1);
    assertDeepEqual(plain(m.enabledRules), [2, 6], 'Normalform ohne Doppelte, sortiert');
    setFields(m, { columnRef: null, baselineCount: null, usl: null, lsl: null, enabledRules: [] });
    assertEqual(m.columnRef, null);
    assertEqual(m.baselineCount, null);
    assertEqual(m.usl, null);
    assertDeepEqual(plain(m.enabledRules), []);
  });

  test('falsche Form je Feld abgelehnt, Stand unverändert', () => {
    const bad = {
      chartTypeId: ['p', 5, null], subgroupSize: [0, 26, 2.5, '3'], columnRef: ['value', 5, { columnId: 'x' }],
      baselineCount: [0, -1, 2.5, 'x'], stagesText: [5, null], usl: ['x', Infinity], lsl: ['x', NaN],
      enabledRules: [[0], [9], 'all', [1.5]],
    };
    for (const [k, vals] of Object.entries(bad)) {
      for (const v of vals) {
        const m = make({ columnRef: ref('value') });
        const before = plain(m.toJSON());
        assertThrows(() => setFields(m, { [k]: v }), undefined, `${k} ${JSON.stringify(v)}`);
        assertDeepEqual(plain(m.toJSON()), before, `${k} ${JSON.stringify(v)}`);
      }
    }
  });

  test('Anmerkungen und Grenzen: Form geprüft (Schlüssel ganze Zahl ab 0)', () => {
    const m = new State();
    for (const k of ['x', '-1', '2.5']) {
      assertThrows(() => setFields(m, { annotations: { [k]: { comment: '', excluded: true } } }), undefined, k);
    }
    assertThrows(() => setFields(m, { annotations: { 1: { comment: 5, excluded: true } } }));
    assertThrows(() => setFields(m, { frozenLimits: { chartTypeId: 'i-mr' } }));
    assertDeepEqual(plain(m.annotations), {});
    assertEqual(m.frozenLimits, null);
  });

  test('unbekanntes Feld abgelehnt', () => {
    assertThrows(() => setFields(new State(), { foo: 1 }), /unknown field/);
    for (const k of ['pickableColumns', 'pointsColumns', 'result', 'points']) {
      assertThrows(() => setFields(new State(), { [k]: {} }), /unknown field/, k);
    }
  });
});

suite('control-chart: Model — Invariante subgroupRange', () => {
  test('Untergruppe außerhalb des Typbereichs abgelehnt, Grund an subgroupSize, Stand unverändert', () => {
    const m = new State();
    m.setChartType({ chartTypeId: 'xbar-r' });
    setFields(m, { subgroupSize: 5 });
    for (const n of [1, 11, 25]) {
      const err = thrown(() => setFields(m, { subgroupSize: n }));
      assertEqual(err.invariant, 'subgroupRange', String(n));
      assertEqual(err.param, 'subgroupSize', String(n));
      assertEqual(m.subgroupSize, 5, String(n));
    }
    m.setChartType({ chartTypeId: 'xbar-s' });
    setFields(m, { subgroupSize: 25 });
    assertEqual(m.subgroupSize, 25);
  });

  test('instance.set({ chartTypeId }) mit unpassender Untergruppe abgelehnt', () => {
    const m = new State();
    m.setChartType({ chartTypeId: 'xbar-r' });
    setFields(m, { subgroupSize: 5 });
    const err = thrown(() => setFields(m, { chartTypeId: 'i-mr' }));
    assertEqual(err.invariant, 'subgroupRange');
    assertEqual(err.param, 'chartTypeId');
    assertEqual(m.chartTypeId, 'xbar-r');
    setFields(m, { chartTypeId: 'xbar-s' });
    assertEqual(m.chartTypeId, 'xbar-s', 'passt auch zu X̄-S');
    setFields(m, { chartTypeId: 'i-mr', subgroupSize: 1 });
    assertEqual(m.chartTypeId, 'i-mr', 'beide zusammen');
  });

  test('Reparatur beim Laden klemmt wie der Kartentypwechsel', () => {
    for (const [type, n, want] of [['i-mr', 5, 1], ['xbar-r', 25, 10], ['xbar-r', 1, 2], ['xbar-s', 1, 2]]) {
      const json = { _schema: { version: '1.0' }, chartTypeId: type, subgroupSize: n };
      assertEqual(load(json).subgroupSize, want, `${type} ${n}`);
      assertThrows(() => State.fromJSON(json), undefined, `streng ${type} ${n}`);
    }
  });
});

suite('control-chart: Model — Invariante chartKeys', () => {
  test('die Teilkarten-Ids werden angenommen', () => {
    const m = new State();
    m.charts = { i: { title: 'I' }, mr: { title: 'M' }, xbar: { title: 'X' }, r: {}, s: {} };
    assertDeepEqual(Object.keys(m.charts), ['i', 'mr', 'xbar', 'r', 's']);
  });

  test('fremder Schlüssel abgelehnt mit invariant chartKeys, Stand unverändert', () => {
    const m = new State();
    m.charts = { i: { title: 'I' } };
    for (const k of ['i#2', 'mr#2', 'control-chart', 'x']) {
      const err = thrown(() => { m.charts = { i: { title: 'I' }, [k]: { title: 'alt' } }; });
      assertEqual(err.invariant, 'chartKeys', k);
      assertDeepEqual(Object.keys(m.charts), ['i'], k);
    }
  });

  test('Reparatur beim Laden verwirft fremde Schlüssel, auch streng (nur Ansichtsfeld)', () => {
    const json = { _schema: { version: '1.0' }, charts: { i: { title: 'a' }, mr: { showTitle: true }, 'i#2': { title: 'b' }, foo: {} } };
    assertDeepEqual(plain(load(json).charts), { i: { title: 'a' }, mr: { showTitle: true } });
    assertDeepEqual(plain(State.fromJSON(json).charts), { i: { title: 'a' }, mr: { showTitle: true } });
  });
});

suite('control-chart: Model — Kommandos', () => {
  test('setChartType klemmt die Untergruppe wie die Altform', () => {
    const m = new State();
    m.setChartType({ chartTypeId: 'xbar-r' });
    assertEqual(m.subgroupSize, 2, 'I-MR 1 → X̄-R 2');
    setFields(m, { subgroupSize: 8 });
    m.setChartType({ chartTypeId: 'xbar-s' });
    assertEqual(m.subgroupSize, 8, 'X̄-R → X̄-S behält 8');
    setFields(m, { subgroupSize: 20 });
    m.setChartType({ chartTypeId: 'xbar-r' });
    assertEqual(m.subgroupSize, 10, 'X̄-S 20 → X̄-R 10');
    m.setChartType({ chartTypeId: 'i-mr' });
    assertEqual(m.subgroupSize, 1, 'I-MR erzwingt 1');
    assertEqual(m.chartTypeId, 'i-mr');
  });

  test('setChartType: unbekannter Typ abgelehnt, Stand unverändert', () => {
    const m = new State();
    const err = thrown(() => m.setChartType({ chartTypeId: 'p' }));
    assertEqual(err.param, 'chartTypeId');
    assertEqual(m.chartTypeId, 'i-mr');
    assertEqual(m.subgroupSize, 1);
  });

  test('toggleRule: an, aus, in Normalform; unbekannte Regel abgelehnt', () => {
    const m = new State();
    m.toggleRule({ ruleId: 5, on: true });
    m.toggleRule({ ruleId: 2, on: true });
    m.toggleRule({ ruleId: 2, on: true });
    assertDeepEqual(plain(m.enabledRules), [1, 2, 5]);
    m.toggleRule({ ruleId: 1, on: false });
    m.toggleRule({ ruleId: 7, on: false });
    assertDeepEqual(plain(m.enabledRules), [2, 5]);
    assertEqual(thrown(() => m.toggleRule({ ruleId: 9, on: true })).param, 'ruleId');
    assertDeepEqual(plain(m.enabledRules), [2, 5]);
  });

  test('removeAnnotation löscht den Eintrag; ein Index ohne Anmerkung wird mit param index abgelehnt', () => {
    const m = load(LEGACY);
    m.removeAnnotation({ index: 20 });
    assertDeepEqual(plain(m.annotations), { 28: { comment: 'Messung wiederholt', excluded: false } });
    for (const index of [20, 5]) {
      const err = thrown(() => m.removeAnnotation({ index }));
      assertEqual(err.param, 'index', String(index));
    }
    assertEqual(thrown(() => m.removeAnnotation({ index: -1 })).param, 'index');
    assertEqual(thrown(() => m.removeAnnotation({ index: 2.5 })).param, 'index');
    assertDeepEqual(Object.keys(m.annotations), ['28']);
  });
});

suite('control-chart: Model — Form der eingefrorenen Grenzen', () => {
  test('frozenLimits hat die Schlüssel, die freezeLimitsOf baut, und nimmt das Ergebnis an', () => {
    const m = make({ columnRef: ref('durchmesser'), baselineCount: 20, annotations: { 4: { comment: '', excluded: true } } });
    const f = freezeLimitsOf(m, analyze(inputsOf(m, sourceColumns(SRC))));
    assertDeepEqual(keyPaths(f).sort(), shapePaths(State.schema.fields.frozenLimits).sort());
    setFields(m, { frozenLimits: f });
    assertDeepEqual(plain(m.frozenLimits), plain(f));
    assertDeepEqual(plain(m.frozenLimits.columnRef), ref('durchmesser'));
    assertDeepEqual(plain(m.frozenLimits.excludedIndices), [4]);
  });

  test('ohne Bezug (columnRef null) und mit nicht endlicher Grenze (null) angenommen', () => {
    const m = make({ columnRef: ref('durchmesser') });
    const f = freezeLimitsOf(plain({ ...plain(m.toJSON()), columnRef: null }), analyze(inputsOf(m, sourceColumns(SRC))));
    assertEqual(f.columnRef, null);
    setFields(m, { frozenLimits: { ...f, primary: { ...f.primary, ucl: null } } });
    assertEqual(m.frozenLimits.primary.ucl, null);
    assertEqual(m.frozenLimits.columnRef, null);
  });

  test('X̄-R: Grenzen beider Teilkarten', () => {
    const m = make({ columnRef: ref('laenge') });
    m.setChartType({ chartTypeId: 'xbar-r' });
    setFields(m, { subgroupSize: 5 });
    const f = freezeLimitsOf(m, analyze(inputsOf(m, sourceColumns(SRC))));
    setFields(m, { frozenLimits: f });
    assertEqual(m.frozenLimits.chartTypeId, 'xbar-r');
    assertEqual(m.frozenLimits.subgroupSize, 5);
    assertEqual(m.frozenLimits.baselineEnd, 40);
  });
});

suite('control-chart: Model — Ableitungen', () => {
  test('result: Altprojekte gleich den Literalen der Altform', () => {
    assertDeepEqual(derived(load(LEGACY), ['result'], LEGACY_SRC).result, LEGACY_RESULT);
    assertDeepEqual(derived(load(LEGACY_XBAR), ['result'], LEGACY_SRC).result, LEGACY_XBAR_RESULT);
  });

  test('result: test_data_control.csv (Vorgaben) und CSV-Beispiel gleich den Literalen', async () => {
    assertDeepEqual(derived(make({ columnRef: ref('value') }), ['result']).result, TEST_DATA_CONTROL_RESULT);
    const res = await fetch(new URL('../../../examples/data/capability-bolzendurchmesser.csv', import.meta.url), { cache: 'no-cache' });
    assertTrue(res.ok);
    const values = (await res.text()).trim().split(/\r?\n/).slice(1).map(Number);
    assertDeepEqual(derived(make({ columnRef: ref('c-0') }), ['result'], sheetSource({ 'c-0': values })).result, BOLZEN_CSV_RESULT);
  });

  test('points: eine Zeile je Punkt der ersten Teilkarte (bulk)', () => {
    const d = derived(load(LEGACY), ['result', 'points'], LEGACY_SRC);
    assertEqual(d.points.length, d.result.n);
    assertDeepEqual(Object.keys(d.points[0]).sort(), ['i', 'iCl', 'iLcl', 'iUcl', 'mr', 'mrCl', 'mrLcl', 'mrUcl', 'signal'].sort());
    assertEqual(d.points[0].mr, null);
    assertEqual(d.points[20].signal, true);
    const x = derived(load(LEGACY_XBAR), ['points'], LEGACY_SRC).points;
    assertEqual(x.length, 8);
    assertTrue('xbar' in x[0] && 'r' in x[0]);
    assertDeepEqual([...State.schema.derivedBulk], ['points']);
  });

  test('ohne Bezug, mit gelöschter Spalte, unter zwei Werten und bei Überlauf: result null, points leer, kein Wurf', () => {
    const cases = [new State(), make({ columnRef: ref('weg') }), make({ columnRef: ref('kurz') })];
    for (const m of cases) {
      const d = derived(m, ['result', 'points']);
      assertEqual(d.result, null);
      assertDeepEqual(d.points, []);
    }
    const orig = console.warn;
    console.warn = () => {};
    try {
      const d = derived(make({ columnRef: ref('riesig') }), ['result', 'points']);
      assertEqual(d.result, null, 'errCompute');
      assertDeepEqual(d.points, []);
    } finally { console.warn = orig; }
  });

  test('activeColumnSlots und activeParams: Untergruppe nur bei X̄', () => {
    const m = new State();
    const d = derived(m, ['activeColumnSlots', 'activeParams']);
    assertDeepEqual(d.activeColumnSlots, ['columnRef']);
    assertDeepEqual(d.activeParams, ['chartTypeId', 'baselineCount', 'stagesText', 'usl', 'lsl', 'enabledRules']);
    for (const t of ['xbar-r', 'xbar-s']) {
      m.setChartType({ chartTypeId: t });
      assertDeepEqual(derived(m, ['activeParams']).activeParams,
        ['chartTypeId', 'subgroupSize', 'baselineCount', 'stagesText', 'usl', 'lsl', 'enabledRules'], t);
    }
    for (const k of derived(m, ['activeParams']).activeParams) assertTrue(k in State.schema.fields, k);
  });

  test('alle Ableitungen zusammen rufen die Engine einmal; erneutes Lesen und Ansichtsfelder nicht', () => {
    const m = load(LEGACY);
    const n0 = engineRuns();
    derived(m, undefined, LEGACY_SRC);
    assertEqual(engineRuns() - n0, 1);
    derived(m, undefined, LEGACY_SRC);
    m.charts = { i: { title: 'T' } };
    m.exampleWorksheetId = 'ws-x';
    derived(m, undefined, LEGACY_SRC);
    assertEqual(engineRuns() - n0, 1);
    m.toggleRule({ ruleId: 3, on: true });
    derived(m, undefined, LEGACY_SRC);
    assertEqual(engineRuns() - n0, 2, 'eine Regel: eine Rechnung');
    m.removeAnnotation({ index: 28 });
    derived(m, undefined, LEGACY_SRC);
    assertEqual(engineRuns() - n0, 2, 'Kommentar ohne Ausschluss entfernt: keine Rechnung');
    m.removeAnnotation({ index: 20 });
    derived(m, undefined, LEGACY_SRC);
    assertEqual(engineRuns() - n0, 3, 'Ausschluss entfernt: eine Rechnung');
  });
});
