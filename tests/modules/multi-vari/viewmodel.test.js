/**
 * Multi-Vari: Viewmodel-Bausteine (viewmodel/present.js) ohne DOM.
 *
 * Der Lauf `analysis` läuft hier über den echten Task-Host
 * (`createAsyncTasks`) mit der Reaktivität aus `@vue/reactivity`; das
 * Arbeitsblatt ist eine reaktive Attrappe für `ctx.data`. Geprüft werden
 * Entprellung, Abhängigkeiten (Anzeigeschalter rechnen nicht neu), die
 * Streifen-Konfiguration und der Fehlertext.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { reactive, effect, stop } from '@vue/reactivity';
import { asyncTask, createAsyncTasks, defineAsyncTaskSlots } from '../../../js/core/async-task.js';
import { State } from '../../../js/modules/multi-vari/domain/model.js';
import {
  analysisRun, buildStrips, errorTextOf, readInputs, warningText, RERUN_DELAY,
} from '../../../js/modules/multi-vari/viewmodel/present.js';

const ref = (col) => ({ instanceId: 'ws1', sheetId: 's1', columnId: col });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Übersetzer, der Schlüssel und Parameter sichtbar zurückgibt. */
const t = (key, params) => (params ? `${key}${JSON.stringify(params)}` : key);

/**
 * Viewmodel-Attrappe: reaktives Model, Arbeitsblatt hinter `column(ref)`,
 * Task-Host mit dem Lauf aus present.js und einem Spion statt `analyze`.
 */
function host() {
  const sheet = reactive({
    m1: [1, 2, 3, 4], m2: [5, 6, 7, 8], a: ['x', 'x', 'y', 'y'], b: ['p', 'q', 'p', 'q'],
  });
  const calls = [];
  const spy = (input) => { calls.push(input); return { result: { n: input.measurement.values.length }, error: null }; };
  let columnReads = 0;
  const comp = {
    model: new State(),
    column(r) {
      columnReads += 1;
      return { values: sheet[r.columnId] ? [...sheet[r.columnId]] : null, name: r.columnId };
    },
  };
  defineAsyncTaskSlots(comp, ['analysis']);
  const vm = reactive(comp);
  vm.model.measurement = ref('m1');
  vm.model.setFactorColumn({ id: 'f1', ref: ref('a') });
  vm.model.setFactorColumn({ id: 'f2', ref: ref('b') });
  const tasks = createAsyncTasks({
    defs: { analysis: asyncTask({ auto: true, run: analysisRun(spy) }) },
    vm,
    reactivity: { effect: (fn) => effect(fn), release: (h) => stop(h) },
    checkArgs: () => ({}),
  });
  return { vm, sheet, calls, tasks, reads: () => columnReads };
}

suite('Multi-Vari Viewmodel — Lauf analysis', () => {
  test('zwei Änderungen eines Bezugs innerhalb von 120 ms ergeben genau einen Aufruf von analyze', async () => {
    const h = host();
    await h.tasks.settle(1000);
    const before = h.calls.length;
    h.vm.model.measurement = ref('m2');
    await wait(40);
    h.vm.model.measurement = ref('m1');
    await h.tasks.settle(1000);
    assertEqual(h.calls.length - before, 1);
    assertDeepEqual(h.calls.at(-1).measurement.values, [1, 2, 3, 4]);
    assertEqual(h.vm.analysis.result.n, 4);
    h.tasks.release();
  });

  test('eine Änderung im Arbeitsblatt startet den Lauf neu', async () => {
    const h = host();
    await h.tasks.settle(1000);
    const before = h.calls.length;
    h.sheet.m1 = [9, 9, 9, 9, 9];
    await h.tasks.settle(1000);
    assertEqual(h.calls.length - before, 1);
    assertDeepEqual(h.calls.at(-1).measurement.values, [9, 9, 9, 9, 9]);
    h.tasks.release();
  });

  test('das Umschalten von showPoints startet analysis nicht neu', async () => {
    const h = host();
    await h.tasks.settle(1000);
    const calls = h.calls.length;
    const reads = h.reads();
    h.vm.model.showPoints = false;
    h.vm.model.connectMeans = false;
    h.vm.model.showGroupMean = false;
    h.vm.model.showRefLine = false;
    await wait(RERUN_DELAY + 30);
    assertEqual(h.vm._asyncTasks.analysis.running, false);
    assertEqual(h.reads(), reads);
    assertEqual(h.calls.length, calls);
    h.tasks.release();
  });

  test('der Snapshot nimmt nur belegte Faktorzeilen, ohne Messwert kein Messwert', () => {
    const m = new State();
    m.setFactorColumn({ id: 'f2', ref: ref('b') });
    const input = readInputs(m, (r) => ({ values: [r.columnId], name: r.columnId }));
    assertEqual(input.measurement, null);
    assertDeepEqual(input.factors, [{ values: ['b'], name: 'b' }]);
    assertEqual(input.modelForm, 'nested');
    assertEqual(input.estimator, 'anova');
  });
});

/** Ergebnis mit `count` Streifen. */
function resultWith(count, extra = {}) {
  return {
    strips: Array.from({ length: count }, (_, idx) => ({ idx, rowLevel: `R${idx}`, panels: [] })),
    seriesLevels: ['s1'], factorNames: ['Achse', 'Serie'], grandMean: 5, n: 8, droppedRows: 0,
    warnings: [], yMin: 1, yMax: 9, balanced: true, panelCount: count, limits: [], renderable: true, vc: null,
    ...extra,
  };
}

const display = (over = {}) => ({
  showPoints: true, connectMeans: true, showGroupMean: true, showRefLine: true,
  yLabel: 'Messwert', refLabel: 'Gesamtmittel', ...over,
});

suite('Multi-Vari Viewmodel — Streifen', () => {
  test('ohne Ergebnis und bei renderable === false keine Streifen', () => {
    assertDeepEqual(buildStrips(null, display()), []);
    assertDeepEqual(buildStrips(resultWith(2, { renderable: false }), display()), []);
  });

  test('legacyEditKey: multi-vari, multi-vari#2, multi-vari#3', () => {
    const keys = buildStrips(resultWith(3), display()).map((s) => s.legacyEditKey);
    assertDeepEqual(keys, ['multi-vari', 'multi-vari#2', 'multi-vari#3']);
  });

  test('X-Beschriftung nur am letzten Streifen', () => {
    const strips = buildStrips(resultWith(3), display());
    assertDeepEqual(strips.map((s) => s.config.xLabel), ['', '', 'Achse']);
    assertDeepEqual(strips.map((s) => s.config.showXLabel), [false, false, true]);
  });

  test('gemeinsame y-Domäne, Referenzlinie und Schalter', () => {
    const [s] = buildStrips(resultWith(1), display({ showPoints: false }));
    assertEqual(s.config.sharedYMin, 1);
    assertEqual(s.config.sharedYMax, 9);
    assertEqual(s.config.refValue, 5);
    assertEqual(s.config.refLabel, 'Gesamtmittel');
    assertEqual(s.config.yLabel, 'Messwert');
    assertEqual(s.config.rowLabel, 'R0');
    assertEqual(s.config.showPoints, false);
    assertEqual(s.config.showLegend, true);
    assertTrue(typeof s.key === 'string');
  });

  test('mit showRefLine: false ist refValue null', () => {
    const strips = buildStrips(resultWith(2), display({ showRefLine: false }));
    assertDeepEqual(strips.map((s) => s.config.refValue), [null, null]);
  });
});

suite('Multi-Vari Viewmodel — Fehlertext', () => {
  test('ohne Messwert leer, sonst Schlüssel bzw. Engine-Text wie in der Altform', () => {
    assertEqual(errorTextOf(null, null, t), '');
    assertEqual(errorTextOf({ result: null, error: null, message: null }, null, t), '');
    assertEqual(errorTextOf({ result: null, error: 'errNeedFactors', message: null }, null, t), 'errNeedFactors');
    assertEqual(errorTextOf({ result: null, error: 'errNoData', message: null }, null, t), 'errNoData');
    // Gruppierung wirft: die Meldung der Engine steht allein da.
    assertEqual(errorTextOf({ result: null, error: 'errCompute', message: 'kaputt' }, null, t), 'kaputt');
    // Zerlegung scheitert, das Ergebnis bleibt: errCompute mit der Meldung.
    assertEqual(errorTextOf({ result: resultWith(1), error: 'errCompute', message: 'singulär' }, null, t), 'errCompute{"msg":"singulär"}');
    // Der Lauf selbst wirft.
    assertEqual(errorTextOf(null, 'Absturz', t), 'errCompute{"msg":"Absturz"}');
  });
});

suite('Multi-Vari Viewmodel — Warnungstext', () => {
  test('Größengrenze nennt Spalte, Anzahl und Maximum', () => {
    const result = { limits: [{ code: 'tooManyAxisLevels', column: 'Nest', count: 40, max: 30 }] };
    assertEqual(warningText(result, 'tooManyAxisLevels', t), 'warn_tooManyAxisLevels{"col":"Nest","count":40,"max":30}');
  });
  test('Warnung ohne Grenze und verworfene Zeilen', () => {
    assertEqual(warningText({ limits: [] }, 'unbalanced', t), 'warn_unbalanced');
    assertEqual(warningText({ droppedRows: 3 }, 'droppedRows', t), 'warnDroppedRows{"count":3}');
  });
});
