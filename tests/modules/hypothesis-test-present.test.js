import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { analyze } from '../../js/modules/hypothesis-test/domain/analyze.js';
import { presentResult, insufficientText, residualCharts, previewHypotheses } from '../../js/modules/hypothesis-test/viewmodel/present.js';
import { NORMAL_GROUPS, SKEWED_GROUPS, bookGroups, loadT, loadRealT, BONETT_SPLIT_LARGE, BONETT_SPLIT_SMALL } from './hypothesis-test-groups.js';
import { fmt } from '../../js/modules/hypothesis-test/viewmodel/present.js';

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
      assertEqual(Object.keys(c).join(','), 'fitted,prob,hist,order');
      for (const x of Object.values(c)) { assertEqual(x.type, undefined); assertEqual(x.editKey, undefined); }
      assertTrue(c.hist.showNormalCurve, 'Histogramm mit Normalkurve');
      assertEqual(c.fitted.series[0].x.length, 24);
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

suite('present — previewHypotheses', () => {
  const pv = (category, testType, direction) => previewHypotheses({ category, testType, direction }, t);
  test('Richtung bestimmt die Zeichen: zweiseitig, größer, kleiner', () => {
    assertEqual(pv('mean', 'one', 'two-sided').h0, 'H₀: μ = μ₀');
    assertEqual(pv('mean', 'one', 'two-sided').h1, 'H₁: μ ≠ μ₀');
    assertEqual(pv('mean', 'two', 'greater').h0, 'H₀: μ₁ ≤ μ₂');
    assertEqual(pv('mean', 'two', 'greater').h1, 'H₁: μ₁ > μ₂');
    assertEqual(pv('mean', 'paired', 'less').h0, 'H₀: μ_d ≥ μ_d₀');
    assertEqual(pv('mean', 'paired', 'less').h1, 'H₁: μ_d < μ_d₀');
    assertEqual(pv('variance', 'one', 'greater').h0, 'H₀: σ² ≤ σ²₀');
    assertEqual(pv('variance', 'two', 'less').h1, 'H₁: σ²₁ < σ²₂');
    assertEqual(pv('variance', 'two', 'two-sided').h0, 'H₀: σ²₁ = σ²₂');
  });
});

// ── Hinweise zum Intervall (ciNote) und Verschiebungsschätzer im Hauptergebnis ──

const tr = await loadRealT();
/** Wie `show`, aber mit den echten Modultexten. */
function showR(input) {
  const a = analyze({ ...base, ...input });
  return presentResult(a, tr, { category: input.category ?? base.category, testType: input.testType, direction: input.direction ?? base.direction, targetType: base.targetType });
}


/** Rechtsschiefe Reihen mit n = 8: der Rangweg (Mann-Whitney) mit exaktem Hodges-Lehmann-Intervall. */
const HEAVY_X = [1, 1.01, 1.02, 1.03, 1.04, 1.05, 100, 10000];
const HEAVY_Y = [1.005, 1.015, 1.025, 1.035, 1.045, 1.055, 150, 12000];

suite('present — ciNote je Code', () => {
  const C = [10.3, 10.0, 10.5, 9.9, 10.2];
  const two = (x, y, extra = {}) => showR({ testType: 'two', samples: [{ name: 'A', values: x }, { name: 'B', values: y }], ...extra });

  test('ciDiffNote: nicht abgelehnter Zwei-Stichproben-Test nennt das Intervall der Differenz', () => {
    const r = two(A, C);
    assertEqual(r.numeric.decision, 'keep');
    const [lo, hi] = r.numeric.ci;
    assertEqual(r.main.ciNote, tr('ciDiffNote', { lo: fmt(lo), hi: fmt(hi) }));
    assertTrue(r.main.ciNote.includes('No significant difference'), r.main.ciNote);
    assertTrue(lo < 0 && hi > 0, 'das Intervall enthält 0');
  });

  test('ciDiffNote entfällt bei Ablehnung', () => {
    assertEqual(two(A, B).main.ciNote, '');
  });

  test('ciDiffNote entfällt, wenn das einseitig nicht abgelehnte Intervall den Zielwert 0 nicht enthält', () => {
    const r = two(A, B, { direction: 'greater' });
    assertEqual(r.numeric.decision, 'keep');
    assertTrue(r.numeric.ci[1] < 0, 'Intervall liegt links von 0');
    assertEqual(r.main.ciNote, '');
  });

  test('ciPairedDiffNote: gepaart, nicht abgelehnt, Intervall enthält das Ziel', () => {
    const r = showR({ testType: 'paired', target: 0, samples: [{ name: 'A', values: A }, { name: 'C', values: C }] });
    assertEqual(r.numeric.decision, 'keep');
    const [lo, hi] = r.numeric.ci;
    assertEqual(r.main.ciNote, tr('ciPairedDiffNote', { lo: fmt(lo), hi: fmt(hi) }));
  });

  test('ciShiftNote: Rangweg ohne Ablehnung nennt das Verschiebungsintervall', () => {
    const r = two(HEAVY_X, HEAVY_Y);
    assertEqual(r.route.name, 'Mann-Whitney U Test');
    assertEqual(r.numeric.decision, 'keep');
    const [lo, hi] = r.numeric.ci;
    assertTrue(r.main.ciNote.startsWith(tr('ciShiftNote', { lo: fmt(lo), hi: fmt(hi) })), r.main.ciNote);
  });

  test('ciShiftTooSmall: erreichte Konfidenz unter 1 − α, Zahlen in Prozent', () => {
    const r = two(HEAVY_X, HEAVY_Y, { alpha: 0.0001 });
    const small = r.numeric.notes.find((n) => n.code === 'ciShiftTooSmall');
    assertTrue(small !== undefined, 'Code ciShiftTooSmall');
    assertTrue(small.values.achieved > 0 && small.values.achieved < small.values.level, 'erreicht < gefordert');
    assertTrue(r.main.ciNote.includes('Samples too small for'), r.main.ciNote);
    assertTrue(r.main.ciNote.includes(tr('ciShiftNote', { lo: fmt(r.numeric.ci[0]), hi: fmt(r.numeric.ci[1]) })), 'beide Hinweise, durch Leerzeichen getrennt');
  });

  test('Rangweg mit Ablehnung und ausreichender Konfidenz: kein Hinweis', () => {
    const r = two(HEAVY_X, [3, 3.5, 4, 12, 13, 14, 15, 16].map((v) => v + 20000));
    assertEqual(r.numeric.decision, 'reject');
    assertEqual(r.main.ciNote, '');
  });

  test('ciRatioUndefinedNote: Bonett-Konfidenzgebiet zerfällt, KI-Wert „–“', () => {
    const r = showR({ category: 'variance', testType: 'two', samples: [{ name: 'A', values: BONETT_SPLIT_LARGE }, { name: 'B', values: BONETT_SPLIT_SMALL }] });
    assertEqual(r.route.name, 'Bonett Ratio Test');
    assertEqual(r.main.ciNote, tr('ciRatioUndefinedNote'));
    const ciMetric = r.main.metrics.find((m) => m.label.startsWith('95%') && m.value === '–');
    assertTrue(ciMetric !== undefined, 'Intervall zeigt „–“');
  });
});

suite('present — Hodges-Lehmann im Hauptergebnis', () => {
  test('Mann-Whitney: Schätzer und Verschiebungsintervall mit erreichtem Niveau, Methode im Tooltip', () => {
    const r = showR({ testType: 'two', samples: [{ name: 'A', values: SKEWED_GROUPS[0] }, { name: 'B', values: SKEWED_GROUPS[1] }] });
    assertEqual(r.route.name, 'Mann-Whitney U Test');
    const hl = r.numeric.ci;
    assertEqual(metric(r.main.metrics, tr('hlEstimateLabel')) !== undefined, true);
    assertTrue(Math.abs(Number(metric(r.main.metrics, tr('hlEstimateLabel'))) - (-1)) < 0.5, metric(r.main.metrics, tr('hlEstimateLabel')));
    const shift = r.main.metrics.find((m) => m.label.includes('η₁−η₂') && m.label.includes('CI'));
    assertEqual(shift.value, `[${fmt(hl[0])}, ${fmt(hl[1])}]`);
    assertTrue(shift.label.startsWith('95'), shift.label);
    assertTrue(shift.title.includes(tr('pMethodExact')), shift.title);
  });

  test('Parametrische Wege haben keine HL-Zeile', () => {
    const r = showR({ testType: 'two', samples: [{ name: 'A', values: A }, { name: 'B', values: B }] });
    assertEqual(metric(r.main.metrics, tr('hlEstimateLabel')), undefined);
  });
});
