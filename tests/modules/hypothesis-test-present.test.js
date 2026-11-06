import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { analyze } from '../../js/modules/hypothesis-test/domain/analyze.js';
import { presentResult, insufficientText, residualCharts } from '../../js/modules/hypothesis-test/viewmodel/present.js';
import { NORMAL_GROUPS, SKEWED_GROUPS, bookGroups, loadT } from './hypothesis-test-groups.js';

const t = await loadT();
const BOOK = await bookGroups();

const A = [10.1, 10.4, 9.8, 10.2, 10.0];
const B = [10.9, 11.2, 10.7, 11.0, 10.8];
const base = { category: 'mean', direction: 'two-sided', alpha: 0.05, powerGoal: 0.8, target: null, targetType: 'variance', equalVariances: false };

/** Analyse und Anzeige in einem Zug; `model` trägt die Felder, die present.js liest. */
function show(input) {
  const a = analyze({ ...base, ...input });
  return presentResult(a, t, { category: input.category ?? base.category, testType: input.testType, direction: input.direction ?? base.direction, targetType: base.targetType });
}
const runK = (groups, { equalVariances = false, alpha = 0.05 } = {}) => show({
  testType: 'k', alpha, equalVariances, samples: groups.map((values, i) => ({ name: `G${i + 1}`, values })),
});
const metric = (list, label) => list.find(m => m.label === label)?.value;

suite('presentResult — Zwei Stichproben', () => {
  test('Welch-t als Anzeigemodell wie bisher', () => {
    const r = show({ testType: 'two', samples: [{ name: 'A', values: A }, { name: 'B', values: B }] });
    assertEqual(r.route.name, 'Welch t-Test');
    assertEqual(r.route.algoId, 'welch-t-test');
    assertEqual(r.allNormal, true);
    assertEqual(r.normCards.length, 2);
    assertEqual(r.normCards[0].label, 'S1');
    assertEqual(r.normCards[0].badgeClass, 'hyptest__badge--pass');
    assertEqual(metric(r.main.metrics, t('statistic')), '-6.2164');
    assertEqual(metric(r.main.metrics, t('common.sym.p')), '0.0003');
    assertEqual(r.main.h0, 'μ₁ = μ₂');
    assertEqual(r.main.h0Class, 'hyptest__h-box--rejected');
    assertEqual(r.numeric.decision, 'reject');
    assertEqual(r.varEquality.metrics, null);
    assertEqual(r.power.goalPct, '80');
    assertTrue(r.power.metrics[0].value.endsWith('%'), r.power.metrics[0].value);
  });

  test('gepaart: Normalitätskarte der Differenzen und Paarinfo', () => {
    const r = show({ testType: 'paired', target: 0, samples: [{ name: 'A', values: A }, { name: 'B', values: B }] });
    assertEqual(r.normCards.length, 1);
    assertEqual(r.normCards[0].label, t('differences'));
    assertEqual(r.pairInfo.n, 5);
    assertEqual(r.pairInfo.dropped, 0);
    assertEqual(r.main.h0, 'μ_d = 0.0000');
  });
});

suite('presentResult — k-Gruppen-Anzeige', () => {
  test('Welch-Karte zeigt df als df1 / df2 mit df2 auf zwei Stellen', () => {
    assertEqual(metric(runK(NORMAL_GROUPS).main.metrics, 'df'), '2 / 11.53');
  });

  test('Fisher: SS-Tabelle mit drei Zeilen, Tukey verlinkt', () => {
    const r = runK(NORMAL_GROUPS, { equalVariances: true });
    assertEqual(r.main.anovaRows.length, 3);
    assertEqual(r.main.anovaRows[2].ms, '—');
    assertEqual(r.main.anovaRows[2].bold, true);
    assertEqual(r.pairwise.methodAlgoId, 'tukey-hsd');
  });

  test('parametrischer Paarhinweis nennt simultane KI und die Familienkonfidenz', () => {
    const hint = runK(NORMAL_GROUPS).pairwise.hint;
    assertTrue(hint.includes(t('pairwiseSimultaneousHint', { level: 95 })), hint);
    assertTrue(!hint.includes('Bonferroni'), hint);
  });

  test('parametrische Paarzellen aus Games-Howell pAdj und dem simultanen KI', () => {
    const row = runK(NORMAL_GROUPS).pairwise.rows[0];
    assertEqual(row.cells[1].text, '0.0585');
    assertEqual(row.cells[2].text, '0.0000');
    assertTrue(row.cells[2].ci.startsWith('[-'), row.cells[2].ci);
    assertEqual(row.head, 'G1');
  });

  test('Modellzusammenfassung des Buchfalls: S, R², R²adj, R²pred bei 0 % abgeschnitten', () => {
    const main = runK(BOOK, { equalVariances: true, alpha: 0.01 }).main;
    assertEqual(metric(main.modelSummary, 'S'), '2.0345');
    assertEqual(metric(main.modelSummary, 'R²'), '1.21 %');
    assertEqual(metric(main.modelSummary, t('labelR2adj')), '0.00 %');
    assertEqual(metric(main.modelSummary, t('labelR2pred')), '0.00 %');
  });

  test('Gruppentabelle trägt das Intervall des Wegs und einen Kopf aus α', () => {
    const main = runK(NORMAL_GROUPS, { alpha: 0.1 }).main;
    assertEqual(main.ciHeader, t('groupCi', { level: 90 }));
    assertEqual(main.showCi, true);
    assertTrue(/^\[\d+\.\d{4}, \d+\.\d{4}\]$/.test(main.groupRows[0].ci), main.groupRows[0].ci);
  });

  test('Rangweg: Bonferroni-Hinweis, keine Modellzusammenfassung', () => {
    const r = runK(SKEWED_GROUPS, { equalVariances: true });
    assertTrue(r.pairwise.hint.includes(t('pairwiseHint', { m: 3 })), r.pairwise.hint);
    assertEqual(r.main.modelSummary, null);
  });

  test('Levene-Kennzahlen bleiben im Varianzblock', () => {
    const ve = runK(NORMAL_GROUPS).varEquality;
    assertTrue(Array.isArray(ve.metrics) && ve.metrics.length > 0, 'Levene metrics kept');
  });
});

suite('insufficientText', () => {
  test('Gründe ohne Text bleiben leer, die anderen wie bisher', () => {
    for (const reason of ['min3', 'target', 'columns']) assertEqual(insufficientText({ status: 'insufficient', reason }, t), '');
    assertEqual(insufficientText({ status: 'insufficient', reason: 'notComputable' }, t), t('testNotComputable'));
    assertEqual(insufficientText({ status: 'insufficient', reason: 'noVariation' }, t), t('pairedNoVariation'));
    assertEqual(insufficientText({ status: 'insufficient', reason: 'paired', count: 2 }, t), t('pairedTooFew', { count: 2, n: 2 }));
  });
});

suite('residualCharts', () => {
  const analyzeK = (groups, equalVariances) => analyze({
    ...base, testType: 'k', equalVariances, samples: groups.map((values, i) => ({ name: `G${i + 1}`, values })),
  });

  for (const [label, eq] of [['Welch', false], ['Fisher', true]]) {
    test(`${label}-Weg liefert die vier Diagramme`, () => {
      const result = analyzeK(NORMAL_GROUPS, eq);
      const c = residualCharts(result, t);
      assertEqual([c.fitted, c.prob, c.hist, c.order].map(x => x.type).join(','), 'scatter,probability-plot,histogram,scatter');
      assertEqual(c.fitted.config.editKey, 'hyptest:chart-resid-fits');
      assertEqual(c.prob.config.editKey, 'hyptest:chart-resid-normal');
      assertEqual(c.hist.config.editKey, 'hyptest:chart-resid-hist');
      assertEqual(c.order.config.editKey, 'hyptest:chart-resid-order');
      assertTrue(c.hist.config.showNormalCurve, 'Histogramm mit Normalkurve');
      assertEqual(c.fitted.config.series[0].x.length, 24);
    });
  }

  test('derselbe Befund und dieselbe Übersetzung geben dasselbe Objekt zurück', () => {
    const result = analyzeK(NORMAL_GROUPS, false);
    assertTrue(residualCharts(result, t) === residualCharts(result, t), 'Zwischenspeicher');
  });

  test('Rangweg und fehlender Befund: keine Diagramme', () => {
    assertEqual(residualCharts(analyzeK(SKEWED_GROUPS, true), t), null);
    assertEqual(residualCharts(null, t), null);
  });
});
