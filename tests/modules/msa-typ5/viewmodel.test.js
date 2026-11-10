/**
 * MSA Typ 5: Viewmodel-Bausteine (viewmodel/present.js) ohne DOM.
 *
 * `levels` und `analysis` laufen über den echten Kern (`computed.js`) mit der
 * Reaktivität aus `@vue/reactivity`; das Arbeitsblatt ist eine reaktive
 * Attrappe für `ctx.data`, gefüllt aus den Beispielblättern.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { reactive, effect, stop } from '@vue/reactivity';
import { defineComputedSlots, bindComputed } from '../../../js/core/computed.js';
import { refToKey } from '../../../js/core/worksheet-columns.js';
import { State } from '../../../js/modules/msa-typ5/domain/model.js';
import { fromExample } from '../../../js/modules/msa-typ5/io/example.js';
import {
  readLevels, readAnalysis, ratingRowsOf, resultOf, analysisMessage,
  kappaChart, effectivenessChart, sdtChart, runStrips, heatmaps, swapPositive,
} from '../../../js/modules/msa-typ5/viewmodel/present.js';

/** Übersetzer, der Schlüssel und Parameter sichtbar zurückgibt. */
const t = (key, params) => (params ? `${key}${JSON.stringify(params)}` : key);

/** @param {string} path relativ zu app/dev/examples @returns {Promise<any>} */
async function json(path) {
  const res = await fetch(new URL(`../../../examples/${path}`, import.meta.url));
  assertTrue(res.ok, path);
  return res.json();
}

/**
 * Viewmodel-Attrappe aus einem Beispiel: reaktives Model und Arbeitsblatt,
 * `levels` und `analysis` als computed wie im view-Block.
 * @param {string} name Beispiel-Id
 * @param {{ engine?: object, model?: object }} [opts]
 */
async function host(name, { engine, model } = {}) {
  const project = await json(`projects/${name}.json`);
  const sheetFile = await json(`worksheets/${name}.json`);
  const ws = sheetFile.sheets[0];
  const sheet = reactive(Object.fromEntries(ws.state.columns.map((c) => [c.id, c.values])));
  const names = Object.fromEntries(ws.state.columns.map((c) => [c.id, c.name]));
  const data = {
    values: (r) => (r && sheet[r.columnId] ? [...sheet[r.columnId]] : null),
    name: (r) => (r && sheet[r.columnId] ? names[r.columnId] : null),
    columns: () => Object.keys(sheet).map((id) => ({
      key: refToKey({ instanceId: '__source__', sheetId: ws.id, columnId: id }), name: names[id],
    })),
  };
  const comp = { model: model ?? State.fromJSON(fromExample(project)) };
  defineComputedSlots(comp, ['levels', 'analysis']);
  const vm = reactive(comp);
  const shim = {
    effect: (fn) => { const runner = effect(fn); return Object.assign(() => runner(), { runner }); },
    release: (h) => stop(h.runner),
  };
  const release = bindComputed(shim, vm, {
    levels() { return readLevels(this.model, data); },
    analysis() { return readAnalysis(this.model, data, engine); },
  });
  const ref = (col) => ({ instanceId: '__source__', sheetId: ws.id, columnId: col });
  return { vm, sheet, data, release, ref };
}

suite('MSA Typ 5 Viewmodel — levels und analysis', () => {
  test('ohne Bewertungsspalte: keine Stufen, keine Analyse', async () => {
    const h = await host('msa-typ5-binary-good');
    h.vm.model.rating = null;
    assertDeepEqual(h.vm.levels.all, []);
    assertEqual(h.vm.analysis, null);
    h.release();
  });

  test('nur Bewertungsspalte: Stufen ja, Analyse nein', async () => {
    const h = await host('msa-typ5-binary-good', { model: new State() });
    h.vm.model.rating = h.ref('c-rating');
    assertDeepEqual(h.vm.levels.all, ['nok', 'ok']);
    assertEqual(h.vm.analysis, null);
    h.release();
  });

  test('binär gut: Fehlerbalken, Heatmaps mit alten Schlüsseln, Streifen', async () => {
    const h = await host('msa-typ5-binary-good');
    const r = resultOf(h.vm.analysis);
    assertTrue(r !== null && Boolean(r.verdict));
    const kc = kappaChart(r, t, 'de');
    assertEqual(kc.series[0].errorBars.yMode, 'relative');
    assertEqual(kc.xTickLabels.length, kc.series[0].x.length);
    const refCount = Object.values(r.perAppraiser).filter((v) => v.confusionMatrix).length;
    const pairCount = Object.keys(r.betweenAppraisers.pairwiseCohenKappa).length;
    const hm = heatmaps(r, t);
    assertEqual(hm.length, refCount + pairCount);
    assertEqual(hm[0].legacyEditKey, 'heatmap');
    assertEqual(hm[1].legacyEditKey, 'heatmap#2');
    assertTrue(effectivenessChart(r, t) !== null);
    assertEqual(sdtChart(r, t).xLabel, 'charts.sdtCriterion');
    const strips = runStrips(r, ratingRowsOf(h.vm.model, h.data), h.vm.model.type, h.vm.levels, t);
    assertDeepEqual(strips.map((s) => s.legacyEditKey), ['gage-run-chart', 'gage-run-chart#2', 'gage-run-chart#3']);
    h.release();
  });

  test('breit: trials passt nicht → Meldung, kein Diagramm; passend → Ergebnis', async () => {
    const h = await host('msa-typ5-binary-wide');
    assertTrue(resultOf(h.vm.analysis) !== null);
    h.vm.model.trials = 2;
    assertDeepEqual(h.vm.analysis, { invalid: { key: 'errWideColumnsNotDivisible', vars: { columns: 9, trials: 2 } } });
    assertEqual(analysisMessage(h.vm.analysis, h.vm.model, t), t('errWideColumnsNotDivisible', { columns: 9, trials: 2 }));
    assertEqual(kappaChart(resultOf(h.vm.analysis), t, 'de'), null);
    h.vm.model.trials = 3;
    const r = resultOf(h.vm.analysis);
    assertTrue(r !== null && Boolean(r.verdict));
    assertEqual(analysisMessage(h.vm.analysis, h.vm.model, t), '');
    h.release();
  });

  test('Bewertungsspalte im Blatt gelöscht: keine Analyse, keine Stufen, keine Ausnahme', async () => {
    const h = await host('msa-typ5-binary-good');
    assertTrue(resultOf(h.vm.analysis) !== null);
    delete h.sheet['c-rating'];
    assertEqual(h.vm.analysis, null);
    assertDeepEqual(h.vm.levels.all, []);
    h.release();
  });

  test('nur eine Stufe: kein Messverlauf, swapPositive abgelehnt', async () => {
    const h = await host('msa-typ5-binary-good');
    h.sheet['c-rating'] = h.sheet['c-rating'].map(() => 'ok');
    assertEqual(h.vm.levels.negative, null);
    const r = resultOf(h.vm.analysis);
    assertDeepEqual(runStrips(r, ratingRowsOf(h.vm.model, h.data), h.vm.model.type, h.vm.levels, t), []);
    let err = null;
    try { swapPositive(h.vm); } catch (e) { err = e; }
    assertTrue(err !== null);
    assertEqual(err.param, 'positiveLevel');
    assertEqual(h.vm.model.positiveLevel, 'ok');
    h.release();
  });

  test('swapPositive bei zwei Stufen: positive = vorherige negative', async () => {
    const h = await host('msa-typ5-binary-good');
    const before = h.vm.levels.negative;
    assertEqual(before, 'nok');
    swapPositive(h.vm);
    assertEqual(h.vm.model.positiveLevel, before);
    assertEqual(h.vm.levels.positive, 'nok');
    h.release();
  });

  test('analyze wirft: errCompute', async () => {
    const engine = { analyze: () => { throw new Error('kaputt'); } };
    const h = await host('msa-typ5-binary-good', { engine });
    assertEqual(resultOf(h.vm.analysis), null);
    assertEqual(analysisMessage(h.vm.analysis, h.vm.model, t), t('errCompute', { msg: 'kaputt' }));
    h.release();
  });

  test('nominal: keine Kodierung, kein Messverlauf', async () => {
    const h = await host('msa-typ5-nominal-3classes');
    const r = resultOf(h.vm.analysis);
    assertTrue(r !== null);
    assertDeepEqual(runStrips(r, ratingRowsOf(h.vm.model, h.data), h.vm.model.type, h.vm.levels, t), []);
    h.release();
  });
});
