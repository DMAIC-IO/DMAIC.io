/**
 * MSA Typ 2: Viewmodel-Bausteine (viewmodel/present.js) ohne DOM.
 *
 * Die Ableitung `analysis` läuft hier über den echten Kern (`computed.js`)
 * mit der Reaktivität aus `@vue/reactivity`; das Arbeitsblatt ist eine
 * reaktive Attrappe für `ctx.data`. Geprüft werden die Ableitung, der
 * Meldungstext, Typ 3 und die Aufteilung in Streifen.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { reactive, effect, stop } from '@vue/reactivity';
import { defineComputedSlots, bindComputed } from '../../../js/core/computed.js';
import { sheetSource } from '../../helpers/sheet-source.js';
import { State } from '../../../js/modules/msa-typ2/domain/model.js';
import {
  readAnalysis, analysisMessage, resultOf, byOperatorChart, interactionChart, runStrips,
  componentsChart, byPartChart, xbarChart, rChart, varCompRows, anovaRows,
} from '../../../js/modules/msa-typ2/viewmodel/present.js';

const ref = (col) => ({ instanceId: 'ws1', sheetId: 's1', columnId: col });

/** Übersetzer, der Schlüssel und Parameter sichtbar zurückgibt. */
const t = (key, params) => (params ? `${key}${JSON.stringify(params)}` : key);

/**
 * Gekreuzte Studie: `parts` Teile × 2 Prüfer × 2 Wiederholungen.
 * @param {number} parts
 */
function study(parts) {
  const p = [], o = [], m = [];
  for (let i = 0; i < parts; i++) {
    for (const [oi, op] of ['A', 'B'].entries()) {
      for (let r = 0; r < 2; r++) {
        p.push(`T${i + 1}`);
        o.push(op);
        m.push(10 + i * 0.5 + oi * 0.03 + (r ? 0.02 : -0.01) + ((i * 7 + r * 3 + oi) % 5) * 0.004);
      }
    }
  }
  return { part: p, op: o, meas: m };
}

/**
 * Viewmodel-Attrappe: reaktives Model und Arbeitsblatt, `analysis` als
 * computed über `readAnalysis` wie im view-Block.
 * @param {{ parts?: number, engine?: object }} [opts]
 */
function host({ parts = 4, engine } = {}) {
  const sheet = reactive(study(parts));
  const data = sheetSource(sheet);
  const comp = { model: new State() };
  defineComputedSlots(comp, ['analysis']);
  const vm = reactive(comp);
  vm.model.part = ref('part');
  vm.model.operator = ref('op');
  vm.model.measurement = ref('meas');
  // Ein schlichter Läufer ohne Alpines Effect-Optionen: der Kern rechnet dann
  // bei jeder Änderung sofort neu, statt beim nächsten Lesen.
  const shim = {
    effect: (fn) => { const runner = effect(fn); return Object.assign(() => runner(), { runner }); },
    release: (h) => stop(h.runner),
  };
  const release = bindComputed(shim, vm, {
    analysis() { return readAnalysis(this.model, data, engine); },
  });
  return { vm, sheet, release };
}

suite('MSA Typ 2 Viewmodel — analysis', () => {
  test('ohne Messwertspalte: analysis null, keine Meldung', () => {
    const h = host();
    h.vm.model.measurement = null;
    assertEqual(h.vm.analysis, null);
    assertEqual(analysisMessage(h.vm.analysis, t), '');
    assertEqual(resultOf(h.vm.analysis), null);
    h.release();
  });

  test('mit Prüferspalte: Typ 2, by-operator und Wechselwirkung gesetzt', () => {
    const h = host();
    const r = resultOf(h.vm.analysis);
    assertEqual(r.mode, 'typ2');
    assertTrue(byOperatorChart(r, t) !== null);
    assertTrue(interactionChart(r, t) !== null);
    assertEqual(analysisMessage(h.vm.analysis, t), '');
    h.release();
  });

  test('Prüferspalte leeren: Typ 3 ohne by-operator, Wechselwirkung und Legende', () => {
    const h = host();
    h.vm.model.operator = null;
    const r = resultOf(h.vm.analysis);
    assertEqual(r.mode, 'typ3');
    assertEqual(byOperatorChart(r, t), null);
    assertEqual(interactionChart(r, t), null);
    // Typ 3 hat keine Prüferserien: wie die Altform kein Streifen, also auch keine Legende.
    assertEqual(runStrips(r, t).length, 0);
    h.release();
  });

  test('Änderung im Arbeitsblatt rechnet neu', () => {
    const h = host();
    const before = resultOf(h.vm.analysis);
    assertEqual(before.p, 4);
    const next = study(5);
    h.sheet.part = next.part;
    h.sheet.op = next.op;
    h.sheet.meas = next.meas;
    const after = resultOf(h.vm.analysis);
    assertTrue(after !== before);
    assertEqual(after.p, 5);
    h.release();
  });

  test('ungültige Daten: Meldung aus dem Schlüssel der Prüfung', () => {
    const h = host();
    h.sheet.op = h.sheet.op.map(() => 'A');
    assertDeepEqual(Object.keys(h.vm.analysis), ['invalid']);
    assertEqual(resultOf(h.vm.analysis), null);
    assertEqual(analysisMessage(h.vm.analysis, t), 'modules.msa-typ2.errTooFewOperators{"n":1}');
    h.release();
  });

  test('analyze wirft: errCompute mit der Meldung', () => {
    const engine = { validate: () => ({ valid: true }), analyze: () => { throw new Error('kaputt'); } };
    const h = host({ engine });
    assertEqual(resultOf(h.vm.analysis), null);
    assertEqual(analysisMessage(h.vm.analysis, t), t('errCompute', { msg: 'kaputt' }));
    h.release();
  });
});

suite('MSA Typ 2 Viewmodel — Streifen', () => {
  test('12 Teile: zwei Streifen, alte Editor-Schlüssel, X-Beschriftung nur am letzten', () => {
    const h = host({ parts: 12 });
    const strips = runStrips(resultOf(h.vm.analysis), t);
    assertEqual(strips.length, 2);
    assertDeepEqual(strips.map((s) => s.legacyEditKey), ['gage-run-chart', 'gage-run-chart#2']);
    assertDeepEqual(strips.map((s) => s.config.xLabel), ['', 'parts']);
    assertDeepEqual(strips.map((s) => s.config.showXLabel), [false, true]);
    assertDeepEqual(strips.map((s) => s.config.panels.length), [10, 2]);
    assertDeepEqual(strips.map((s) => s.config.showLegend), [true, true]);
    assertEqual(strips[0].config.sharedYMin, strips[1].config.sharedYMin);
    assertEqual(strips[0].config.sharedYMax, strips[1].config.sharedYMax);
    assertDeepEqual(strips[0].config.operators, ['A', 'B']);
    assertEqual(new Set(strips.map((s) => s.key)).size, 2);
    h.release();
  });

  test('auf 8 Teile gekürzt: ein Streifen mit dem ersten Schlüssel', () => {
    const h = host({ parts: 12 });
    const next = study(8);
    h.sheet.part = next.part;
    h.sheet.op = next.op;
    h.sheet.meas = next.meas;
    const strips = runStrips(resultOf(h.vm.analysis), t);
    assertEqual(strips.length, 1);
    assertEqual(strips[0].legacyEditKey, 'gage-run-chart');
    assertEqual(strips[0].config.xLabel, 'parts');
    h.release();
  });

  test('Mittelwerte und Referenzwert aus den Zellen; ohne Ergebnis keine Streifen', () => {
    const r = {
      partLabels: ['T1'], operatorLabels: ['A', 'B'],
      cellData: { T1: { A: [1, 2], B: [3, 4] } },
    };
    const [s] = runStrips(r, t);
    assertDeepEqual(s.config.panels[0].series.map((x) => x.mean), [1.5, 3.5]);
    assertEqual(s.config.refValue, 2.5);
    assertDeepEqual(runStrips(null, t), []);
  });

  test('NaN in Diagrammwerten wird null bzw. 0 (Widget-Eingaben kennen kein NaN)', () => {
    const entry = { variance: 0, sigma: 0, studyVar: 0, pctContribution: NaN, pctStudyVar: NaN, pctTolerance: null, pctProcess: null };
    const r = {
      mode: 'typ2', o: 2, partLabels: ['T1'], operatorLabels: ['A', 'B'], grandMean: 1,
      cellData: { T1: { A: [1, 1], B: [1, 1] } }, cellMeans: { T1: { A: NaN, B: 1 } },
      cellRanges: { T1: { A: NaN, B: 0 } }, partMeans: { T1: NaN },
      varComp: { grr: entry, repeatability: entry, reproducibility: entry, part: entry },
      controlChart: { xbarUCL: 1, xbarCL: 1, xbarLCL: 1, rUCL: 0, rCL: 0, rLCL: 0 },
    };
    assertDeepEqual(componentsChart(r, t).groups[0].values, [0, 0, 0, 0]);
    assertDeepEqual(interactionChart(r, t).series[0].y, [null]);
    assertEqual(byPartChart(r, t).series.at(-1).y[0], null);
    assertDeepEqual(xbarChart(r).series[0].y, [null, 1]);
    assertDeepEqual(rChart(r).series[0].y, [null, 0]);
  });

  test('Varianztabelle: Unterzeilen mit geschützten Leerzeichen eingerückt (normale fielen im HTML weg)', () => {
    const h = host();
    const rows = varCompRows(resultOf(h.vm.analysis), t);
    const label = (key) => rows.find((r) => r.key === key).label;
    assertEqual(label('grr'), 'gageRR');
    assertEqual(label('repeatability'), '\u00a0\u00a0repeatability');
    assertEqual(label('reproducibility'), '\u00a0\u00a0reproducibility');
    assertEqual(label('operator'), '\u00a0\u00a0\u00a0\u00a0sourceOperator');
    assertEqual(label('interact'), '\u00a0\u00a0\u00a0\u00a0sourceInteract');
    assertEqual(label('part'), 'partToPartVar');
    h.release();
  });

  test('Varianztabelle und ANOVA: Zahlen nach Sprache', () => {
    const h = host();
    const r = resultOf(h.vm.analysis);
    const grrEn = varCompRows(r, t, 'en').find((x) => x.key === 'grr');
    const grrDe = varCompRows(r, t, 'de').find((x) => x.key === 'grr');
    assertTrue(/^\d+\.\d{4}$/.test(grrEn.pctStudyVar), grrEn.pctStudyVar);
    assertTrue(/^\d+,\d{4}$/.test(grrDe.pctStudyVar), grrDe.pctStudyVar);
    const anDe = anovaRows(r, t, 'de')[0];
    assertTrue(anDe.ms.includes(',') && !anDe.ms.includes('.'), anDe.ms);
    h.release();
  });
});
