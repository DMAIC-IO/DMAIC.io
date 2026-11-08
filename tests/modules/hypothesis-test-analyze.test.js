import { suite, test, assertEqual, assertClose, assertTrue, assertDeepEqual } from '../test-utils.js';
import { analyze, algoIdOf } from '../../js/modules/hypothesis-test/domain/analyze.js';
import {
  chiSquareVarianceTest, fTest, bonettVarianceTest, bonettRatioTest, leveneTest, bartlettTest, leveneTestK,
} from '../../js/engines/hypothesis-test-engine.js';
import { NORMAL_GROUPS, SKEWED_GROUPS, bookGroups, BONETT_SPLIT_LARGE, BONETT_SPLIT_SMALL } from './hypothesis-test-groups.js';

const A = [10.1, 10.4, 9.8, 10.2, 10.0];
const B = [10.9, 11.2, 10.7, 11.0, 10.8];
const base = { category: 'mean', direction: 'two-sided', alpha: 0.05, powerGoal: 0.8, target: null, targetType: 'variance', equalVariances: false };

/** k-Gruppen-Analyse auf reinen Zahlenreihen, Namen G1, G2, … */
const runK = (groups, { equalVariances = false, alpha = 0.05 } = {}, deps) => analyze({
  ...base, testType: 'k', alpha, equalVariances,
  samples: groups.map((values, i) => ({ name: `G${i + 1}`, values })),
}, deps);

const BOOK = await bookGroups();

const pair = (r, i, j) => r.pairwise.comparisons.find(c => c.i === i && c.j === j);

suite('analyze', () => {
  test('zu wenige Werte → insufficient min3', () => {
    const r = analyze({ ...base, testType: 'two', samples: [{ name: 'A', values: [1, 2] }, { name: 'B', values: B }] });
    assertDeepEqual(r, { status: 'insufficient', reason: 'min3' });
  });

  test('Welch-t wie heute (agent-surface-Referenz)', () => {
    const r = analyze({ ...base, testType: 'two', samples: [{ name: 'A', values: A }, { name: 'B', values: B }] });
    assertEqual(r.status, 'ok');
    assertEqual(r.route.name, 'Welch t-Test');
    assertEqual(r.allNormal, true);
    assertClose(r.main.statistic, -6.2164, 5e-5);
    assertClose(r.main.p, 0.0003, 5e-5);
    assertEqual(r.samples.length, 2);
    assertEqual(r.main.decision, 'reject');
  });

  test('nur Zahlen, Schlüssel und Entscheidungen — kein Anzeigetext', () => {
    const r = analyze({ ...base, testType: 'two', samples: [{ name: 'A', values: A }, { name: 'B', values: B }] });
    const json = JSON.stringify(r);
    for (const bad of ['hyptest__', 'badge', '✓', '✗', '%']) assertTrue(!json.includes(bad), bad);
  });

  test('einseitiger Zielwert fehlt → insufficient target', () => {
    const r = analyze({ ...base, category: 'variance', testType: 'one', target: null, samples: [{ name: 'A', values: A }] });
    assertDeepEqual(r, { status: 'insufficient', reason: 'target' });
  });

  test('gepaart: fehlende Spalte → columns, zu wenige Paare → paired mit Anzahl', () => {
    assertDeepEqual(analyze({ ...base, testType: 'paired', target: 0, samples: [{ name: 'A', values: A }, { name: '', values: null }] }),
      { status: 'insufficient', reason: 'columns' });
    assertDeepEqual(analyze({ ...base, testType: 'paired', target: 0, samples: [{ name: 'A', values: [1, 2, null] }, { name: 'B', values: [3, 4, 5] }] }),
      { status: 'insufficient', reason: 'paired', count: 2 });
  });

  test('gepaart: konstante Differenz → noVariation', () => {
    const r = analyze({ ...base, testType: 'paired', target: 0, samples: [{ name: 'A', values: A }, { name: 'B', values: A.map(v => v + 1) }] });
    assertDeepEqual(r, { status: 'insufficient', reason: 'noVariation' });
  });

  test('gepaart: die Differenzreihe trägt die Spaltennamen, ohne Namen bleibt sie leer', () => {
    const B2 = [10.5, 10.1, 10.3, 9.7, 10.6];
    const named = analyze({ ...base, testType: 'paired', target: 0, samples: [{ name: 'Vorher', values: A }, { name: 'Nachher', values: B2 }] });
    assertEqual(named.samples[0].name, 'Vorher − Nachher');
    const anon = analyze({ ...base, testType: 'paired', target: 0, samples: [{ name: '', values: A }, { name: '', values: B2 }] });
    assertEqual(anon.samples[0].name, '');
  });

  test('Route trägt nur Name und Lab-Kennung', () => {
    const r = analyze({ ...base, testType: 'paired', target: 0, samples: [{ name: 'A', values: A }, { name: 'B', values: [10.5, 10.1, 10.3, 9.7, 10.6] }] });
    assertDeepEqual(Object.keys(r.route).sort(), ['algoId', 'name']);
  });

  test('algoIdOf: bekannte Namen auf Lab-IDs, unbekannte auf null', () => {
    assertEqual(algoIdOf('Welch t-Test'), 'welch-t-test');
    assertEqual(algoIdOf('Tukey HSD'), 'tukey-hsd');
    assertEqual(algoIdOf('gibt es nicht'), null);
  });
});

suite('analyze — k-Gruppen-Mittelwertwege', () => {
  test('Standard (gleiche Varianzen nicht angenommen): Welch-ANOVA mit Games-Howell', () => {
    const r = runK(NORMAL_GROUPS);
    assertEqual(r.route.name, 'Welch ANOVA');
    assertEqual(r.route.algoId, 'welch-anova');
    assertEqual(r.anova.rows, null, 'Welch hat keine SS-Tabelle');
    assertEqual(r.pairwise.methodName, 'Games-Howell');
    assertEqual(r.pairwise.algoId, 'games-howell');
    assertEqual(r.pairwise.simultaneous, true);
  });

  test('Welch: df1 ganzzahlig, df2 gebrochen', () => {
    const r = runK(NORMAL_GROUPS);
    assertEqual(r.main.extra.df1, 2);
    assertClose(r.main.df2, 11.53, 5e-3);
  });

  test('gleiche Varianzen angenommen: Fisher-ANOVA mit SS-Tabelle und Tukey HSD', () => {
    const r = runK(NORMAL_GROUPS, { equalVariances: true });
    assertEqual(r.route.name, 'One-Way ANOVA');
    assertEqual(r.anova.rows.map(x => x.source).join(','), 'factor,error,total');
    assertEqual(r.anova.rows[2].ms, null);
    assertEqual(r.pairwise.methodName, 'Tukey HSD');
    assertEqual(r.pairwise.algoId, 'tukey-hsd');
  });

  test('parametrische Paarvergleiche aus Games-Howell pAdj und simultanem KI', () => {
    const r = runK(NORMAL_GROUPS);
    // G1 gegen G2: p_adj ≈ 0.0585; G1 gegen G3: μ1 − μ3 = −5, p_adj ≈ 2.5e-7
    assertClose(pair(r, 0, 1).pAdj, 0.0585, 5e-5);
    assertTrue(pair(r, 0, 2).pAdj < 5e-5, String(pair(r, 0, 2).pAdj));
    assertTrue(pair(r, 0, 2).ci[0] < 0, String(pair(r, 0, 2).ci));
  });

  test('Modellzusammenfassung des Buchfalls (Abb. 4.7): S, R², R²adj, R²pred', () => {
    // α = 0.01: bei 0.05 lehnt Anderson-Darling Gruppe 1 ab (p ≈ 0.0145) und
    // es gälte der Rangweg. α geht weder in S noch in die R²-Werte ein.
    const r = runK(BOOK, { equalVariances: true, alpha: 0.01 });
    assertEqual(r.route.name, 'One-Way ANOVA');
    assertClose(r.anova.summary.s, 2.0345, 5e-5);
    assertClose(r.anova.summary.r2, 0.0121, 5e-5);
    assertTrue(r.anova.summary.r2adj <= 0, String(r.anova.summary.r2adj));
    assertTrue(r.anova.summary.r2pred == null || r.anova.summary.r2pred <= 0, String(r.anova.summary.r2pred));
  });

  test('Welch-Weg trägt dieselbe Modellzusammenfassung (gepooltes S)', () => {
    const r = runK(BOOK, { alpha: 0.01 });
    assertEqual(r.route.name, 'Welch ANOVA');
    assertClose(r.anova.summary.s, 2.0345, 5e-5);
  });

  test('Gruppentabelle trägt das Intervall des Wegs', () => {
    const r = runK(NORMAL_GROUPS, { alpha: 0.1 });
    const ci = r.anova.groups[0].ci;
    assertTrue(Array.isArray(ci) && ci.length === 2 && ci[0] < ci[1], String(ci));
    assertEqual(r.anova.groups[0].name, 'G1');
  });

  test('Residuen bei Welch und Fisher, null auf dem Rangweg', () => {
    const w = runK(NORMAL_GROUPS);
    assertEqual(w.residualPlot.residuals.length, 24);
    assertEqual(w.residualPlot.fitted.length, 24);
    assertTrue(runK(NORMAL_GROUPS, { equalVariances: true }).residualPlot !== null);
    assertEqual(runK(SKEWED_GROUPS).residualPlot, null);
  });

  test('Welch mit einer Gruppe ohne Streuung ist nicht berechenbar', () => {
    const r = runK([NORMAL_GROUPS[0], NORMAL_GROUPS[1], [5, 5, 5, 5, 5]]);
    assertDeepEqual(r, { status: 'insufficient', reason: 'notComputable' });
  });

  test('nicht normale kleine Gruppen: Kruskal-Wallis mit Bonferroni-Mann-Whitney', () => {
    const r = runK(SKEWED_GROUPS, { equalVariances: true });
    assertEqual(r.route.name, 'Kruskal-Wallis Test');
    assertEqual(r.pairwise.methodName, 'Mann-Whitney U Test');
    assertEqual(r.pairwise.simultaneous, false);
    assertEqual(r.pairwise.m, 3);
    assertEqual(r.anova.summary, null);
  });

  test('der Weg meldet die Annahme gleicher Varianzen, Levene bleibt Information', () => {
    for (const eq of [false, true]) {
      const ve = runK(NORMAL_GROUPS, { equalVariances: eq }).varEquality;
      assertEqual(ve.trailLabelKey, 'varEqualLabel');
      assertEqual(ve.trailYes, eq);
      assertEqual(ve.test.name, 'Levene Test (Brown-Forsythe)');
    }
  });

  test('ein scheiternder Paarvergleich blendet den Abschnitt aus und lässt den Omnibus stehen', () => {
    const r = runK(NORMAL_GROUPS, {}, { simultaneousPairwise: () => { throw new Error('post-hoc failed'); } });
    assertEqual(r.status, 'ok');
    assertEqual(r.pairwise, null);
    assertEqual(r.route.name, 'Welch ANOVA');
  });

  test('k = 2: keine Paarvergleiche', () => {
    const r = runK(NORMAL_GROUPS.slice(0, 2));
    assertEqual(r.route.name, 'Welch ANOVA');
    assertEqual(r.pairwise, null);
  });

  test('zu wenige Gruppen → columns, zu kleine Gruppe → min3', () => {
    assertDeepEqual(runK([NORMAL_GROUPS[0]]), { status: 'insufficient', reason: 'columns' });
    assertDeepEqual(runK([NORMAL_GROUPS[0], [1, 2]]), { status: 'insufficient', reason: 'min3' });
  });
});

// ── Varianzwege ──────────────────────────────────────────────

const VAR = { ...base, category: 'variance' };
const SKEW = [1, 1.1, 1.2, 1.3, 1.4, 1.5, 9, 10];
const SKEW2 = [1.05, 1.3, 1.1, 1.6, 1.2, 1.4, 3, 20];
const smp = (...cols) => cols.map((values, i) => ({ name: `S${i + 1}`, values }));

/** Alle Zahlen in einem Ergebnis sind endlich (kein NaN, kein ±Infinity). */
function assertAllFinite(value, path = 'result') {
  if (typeof value === 'number') assertTrue(Number.isFinite(value), `${path} = ${value}`);
  else if (Array.isArray(value)) value.forEach((v, i) => assertAllFinite(v, `${path}[${i}]`));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) assertAllFinite(v, `${path}.${k}`);
}

suite('analyze — Varianzwege', () => {
  test('eine Stichprobe, normal: Chi-Quadrat gegen die Sollvarianz, Teststärke exakt', () => {
    const r = analyze({ ...VAR, testType: 'one', target: 0.1, samples: smp(A) });
    const e = chiSquareVarianceTest(A, 0.1, 'two-sided', 0.05);
    assertEqual(r.route.name, 'Chi-Square Variance Test');
    assertEqual(r.route.algoId, 'chi-square-variance');
    assertClose(r.main.statistic, e.statistic, 1e-12);
    assertClose(r.main.p, e.pValue, 1e-12);
    assertEqual(r.main.df, 4);
    assertEqual(r.numeric.powerApprox, false);
    assertEqual(r.power.effectKind, 'varianceRatio');
    assertEqual(r.power.approx, false);
    assertEqual(r.secondary, null);
    assertEqual(r.varEquality, null);
  });

  test('eine Stichprobe, nicht normal: Bonett mit Näherung bei der Teststärke', () => {
    const r = analyze({ ...VAR, testType: 'one', target: 0.1, samples: smp(SKEW) });
    const e = bonettVarianceTest(SKEW, 0.1, 'two-sided', 0.05);
    assertEqual(r.allNormal, false);
    assertEqual(r.route.name, 'Bonett Variance Test');
    assertClose(r.main.p, e.pValue, 1e-12);
    assertTrue(Array.isArray(r.numeric.ci), 'Intervall');
    assertEqual(r.numeric.powerApprox, true);
    assertEqual(r.power.approx, true);
  });

  test('zwei Stichproben, normal: F-Test mit Verhältnis, df1 und df2', () => {
    const r = analyze({ ...VAR, testType: 'two', samples: smp(A, B) });
    const e = fTest(A, B, 'two-sided', 0.05);
    assertEqual(r.route.name, 'F-Test');
    assertClose(r.main.statistic, e.statistic, 1e-12);
    assertClose(r.main.p, e.pValue, 1e-12);
    assertEqual(r.main.extra.df1, 4);
    assertEqual(r.main.df2, 4);
    assertClose(r.main.extra.ratio, e.ratio, 1e-12);
    assertEqual(r.secondary, null);
    assertEqual(r.power.approx, false);
  });

  test('zwei Stichproben, nicht normal: Bonett-Verhältnis, Levene daneben, Teststärke genähert', () => {
    const r = analyze({ ...VAR, testType: 'two', samples: smp(SKEW, SKEW2) });
    const e = bonettRatioTest(SKEW, SKEW2, 'two-sided', 0.05);
    assertEqual(r.route.name, 'Bonett Ratio Test');
    assertClose(r.main.p, e.pValue, 1e-12);
    assertEqual(r.secondary.test.name, 'Levene Test (Brown-Forsythe)');
    assertClose(r.secondary.test.p, leveneTest(SKEW, SKEW2, 0.05).pValue, 1e-12);
    assertEqual(r.secondary.noteKey, 'secondaryNoteLevene');
    assertEqual(r.secondary.twoSidedSuffix, false);
    assertEqual(r.power.approx, true);
  });

  test('Bonett einseitig: Levene bleibt zweiseitig und sagt das über twoSidedSuffix', () => {
    const r = analyze({ ...VAR, direction: 'greater', testType: 'two', samples: smp(SKEW, SKEW2) });
    assertEqual(r.secondary.twoSidedSuffix, true);
  });

  test('Ablehnung folgt dem p-Wert: deutlich verschiedene Varianzen verwerfen H₀, gleiche nicht', () => {
    const wide = A.map((x) => 10 + (x - 10) * 5);
    assertEqual(analyze({ ...VAR, testType: 'two', samples: smp(A, wide) }).main.decision, 'reject');
    assertEqual(analyze({ ...VAR, testType: 'two', samples: smp(A, A.map((x) => x + 3)) }).main.decision, 'keep');
  });

  test('k Gruppen, normal: Bartlett, Paarvergleiche mit F-Test und Bonferroni', () => {
    const r = analyze({ ...VAR, testType: 'k', samples: smp(...NORMAL_GROUPS) });
    const e = bartlettTest(NORMAL_GROUPS, 0.05);
    assertEqual(r.route.name, "Bartlett's Test");
    assertClose(r.main.p, e.pValue, 1e-12);
    assertEqual(r.pairwise.methodName, 'F-Test');
    assertEqual(r.pairwise.m, 3);
    assertEqual(r.power, null);
    assertEqual(r.anova.rows, null);
  });

  test('k Gruppen, nicht normal: Levene (Brown-Forsythe) mit Levene-Paarvergleichen', () => {
    const r = analyze({ ...VAR, testType: 'k', samples: smp(...SKEWED_GROUPS) });
    const e = leveneTestK(SKEWED_GROUPS, 0.05);
    assertEqual(r.route.name, 'Levene Test (Brown-Forsythe)');
    assertClose(r.main.p, e.pValue, 1e-12);
    assertEqual(r.pairwise.methodName, 'Levene Test (Brown-Forsythe)');
    assertEqual(r.pairwise.isRank, false);
    assertEqual(r.pairwise.comparisons.every((c) => c.ci === null), true);
  });

  test('Bonett mit zerfallendem Konfidenzgebiet: ciUndefined, Hinweiscode, p-Wert gültig', () => {
    const r = analyze({ ...VAR, testType: 'two', samples: smp(BONETT_SPLIT_LARGE, BONETT_SPLIT_SMALL) });
    assertEqual(r.route.name, 'Bonett Ratio Test');
    assertEqual(r.main.ciUndefined, true);
    assertDeepEqual(r.notes.map((n) => n.code), ['ciRatioUndefinedNote']);
    assertTrue(r.main.p > 0 && r.main.p < 1, 'p-Wert bleibt gültig');
  });
});

suite('analyze — Streuung null (kein NaN, ein Hinweis)', () => {
  const FLAT = [5, 5, 5, 5];
  const cases = [
    ['Mittelwert, eine Stichprobe', { testType: 'one', target: 4, samples: smp(FLAT) }],
    ['Mittelwert, zwei Stichproben (beide konstant)', { testType: 'two', samples: smp(FLAT, [6, 6, 6, 6]) }],
    ['Mittelwert, zwei Stichproben (eine konstant)', { testType: 'two', samples: smp(A, FLAT) }],
    ['Varianz, eine Stichprobe', { category: 'variance', testType: 'one', target: 1, samples: smp(FLAT) }],
    ['Varianz, zwei Stichproben', { category: 'variance', testType: 'two', samples: smp(FLAT, A) }],
  ];
  for (const [label, input] of cases) {
    test(`${label}: nicht berechenbar, keine Teststärke mit NaN`, () => {
      const r = analyze({ ...base, ...input });
      assertDeepEqual(r, { status: 'insufficient', reason: 'notComputable' });
    });
  }

  test('gepaart mit gleicher Spalte: noVariation statt NaN-Teststärke', () => {
    assertDeepEqual(analyze({ ...base, testType: 'paired', target: 0, samples: smp(A, A) }), { status: 'insufficient', reason: 'noVariation' });
  });

  test('gültige Fälle liefern nur endliche Zahlen, auch bei sehr kleinem Effekt', () => {
    assertAllFinite(analyze({ ...base, testType: 'two', samples: smp(A, A.map((x, i) => x + (i % 2 ? 1e-9 : -1e-9))) }).power);
    assertAllFinite(analyze({ ...base, testType: 'two', samples: smp(A, B) }).power);
    assertAllFinite(analyze({ ...VAR, testType: 'two', samples: smp(A, B) }).power);
  });
});
