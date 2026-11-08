import { suite, test, assertEqual, assertDeepEqual, assertClose, assertTrue, assertThrows } from '../test-utils.js';
import { fTest, leveneTest, mannWhitneyU } from '../../js/engines/hypothesis-test-engine.js';
import { simultaneousPairwise, bonferroniPairwise, compactLetterDisplay } from '../../js/modules/hypothesis-test/domain/posthoc.js';

async function loadFixture(path) {
  const resp = await fetch(new URL(path, import.meta.url));
  return resp.json();
}

const tukey = await loadFixture('../fixtures/hypothesis/tukey-hsd.fixtures.json');
const gh = await loadFixture('../fixtures/hypothesis/games-howell.fixtures.json');

suite('posthoc', () => {
  test('Buchstaben: keine Unterschiede → alle a', () => {
    const cmp = [{ i: 0, j: 1, equal: true }, { i: 0, j: 2, equal: true }, { i: 1, j: 2, equal: true }];
    assertDeepEqual(compactLetterDisplay(3, cmp), ['a', 'a', 'a']);
  });
  test('Buchstaben: 0 ≠ 2', () => {
    const cmp = [{ i: 0, j: 1, equal: true }, { i: 0, j: 2, equal: false }, { i: 1, j: 2, equal: true }];
    assertDeepEqual(compactLetterDisplay(3, cmp), ['a', 'ab', 'b']);
  });
  test('Tukey über die Fixture', () => {
    const c = tukey.test_cases[0];
    const r = simultaneousPairwise(c.inputs.groups, c.inputs.alpha ?? 0.05, 'fisher');
    assertEqual(r.simultaneous, true);
    assertEqual(r.m, r.comparisons.length);
    assertClose(r.comparisons[0].pAdj, c.expected.comparisons[0].pAdj, 1e-6);
  });
  test('Bonferroni Rangweg hat Hodges-Lehmann-Intervalle', () => {
    const g = [[1, 2, 3, 4], [2, 3, 4, 5], [6, 7, 8, 9]];
    const r = bonferroniPairwise(g, 0.05, false, false);
    assertEqual(r.m, 3);
    assertEqual(r.isRank, true);
    assertEqual(r.comparisons.every((x) => Array.isArray(x.ci)), true);
  });
});

/** Jedes Paar, das einen Buchstaben teilt, ist gleichwertig — und umgekehrt. */
function assertLettersMatch(r) {
  for (const c of r.comparisons) {
    const shared = [...r.letters[c.i]].some((l) => r.letters[c.j].includes(l));
    assertEqual(shared, c.equal, `Paar ${c.i}-${c.j}: Buchstaben ${r.letters[c.i]}/${r.letters[c.j]}, equal=${c.equal}`);
  }
}

for (const [label, fixture, meanTest, name] of [['Tukey HSD', tukey, 'fisher', 'Tukey HSD'], ['Games-Howell', gh, 'welch', 'Games-Howell']]) {
  suite(`posthoc — ${label} über alle Fixturen`, () => {
    for (const c of fixture.test_cases.filter((x) => !x.expected_error)) {
      test(`${c.id}: jedes pAdj, Intervall, Gleichwertigkeit und Buchstaben`, () => {
        const alpha = c.inputs.alpha ?? 0.05;
        const r = simultaneousPairwise(c.inputs.groups, alpha, meanTest);
        assertEqual(r.methodName, name);
        assertEqual(r.simultaneous, true);
        assertEqual(r.isRank, false);
        const k = c.inputs.groups.length;
        assertEqual(r.m, k * (k - 1) / 2);
        assertEqual(r.comparisons.length, c.expected.comparisons.length);
        assertEqual(r.letters.length, k);
        c.expected.comparisons.forEach((exp, idx) => {
          const got = r.comparisons[idx];
          assertDeepEqual([got.i, got.j], [exp.i, exp.j]);
          assertEqual(got.p, null);
          assertClose(got.pAdj, exp.pAdj, Math.max(1e-6 * exp.pAdj, 1e-10));
          assertClose(got.ci[0], exp.ci[0], 1e-6 * Math.max(1, Math.abs(exp.ci[0])));
          assertClose(got.ci[1], exp.ci[1], 1e-6 * Math.max(1, Math.abs(exp.ci[1])));
          assertEqual(got.equal, exp.pAdj >= alpha);
        });
        assertLettersMatch(r);
      });
    }

    test('klar getrennte Gruppen bekommen eigene Buchstaben, Nullfall teilt einen', () => {
      const sep = fixture.test_cases.find((c) => c.id === 'separated');
      assertDeepEqual(simultaneousPairwise(sep.inputs.groups, 0.05, meanTest).letters, ['a', 'b', 'c']);
      const nul = fixture.test_cases.find((c) => c.id === 'null_case');
      assertDeepEqual(simultaneousPairwise(nul.inputs.groups, 0.05, meanTest).letters, ['a', 'a', 'a']);
    });
  });
}

suite('posthoc — Games-Howell-Zweig unterscheidet sich von Tukey', () => {
  test('ungleiche Varianzen: Welch-Freiheitsgrade und andere pAdj als Tukey', () => {
    const groups = tukey.test_cases.find((c) => c.id === 'unequal_var').inputs.groups;
    const t = simultaneousPairwise(groups, 0.05, 'fisher');
    const g = simultaneousPairwise(groups, 0.05, 'welch');
    assertEqual(t.methodName, 'Tukey HSD');
    assertEqual(g.methodName, 'Games-Howell');
    assertTrue(t.comparisons.some((c, i) => Math.abs(c.pAdj - g.comparisons[i].pAdj) > 1e-3), 'pAdj verschieden');
  });

  test('Gruppe ohne Streuung: Games-Howell wirft, damit analyze den Abschnitt ausblendet', () => {
    const groups = [[1, 2, 3, 4], [2, 3, 4, 5], [5, 5, 5, 5]];
    assertThrows(() => simultaneousPairwise(groups, 0.05, 'welch'), /zero variance/);
  });
});

suite('posthoc — Bonferroni-Pfade', () => {
  const G = [[10.1, 10.4, 9.8, 10.2, 10.0], [10.9, 11.2, 10.7, 11.0, 10.8], [10.0, 10.5, 9.9, 10.3, 10.1]];

  test('Rangweg: pAdj = min(1, p · m) aus Mann-Whitney, Gleichwertigkeit gegen α', () => {
    const r = bonferroniPairwise(G, 0.05, false, false);
    assertEqual(r.methodName, 'Mann-Whitney U Test');
    assertEqual(r.simultaneous, false);
    assertEqual(r.m, 3);
    for (const c of r.comparisons) {
      const p = mannWhitneyU(G[c.i], G[c.j], 'two-sided', 0.05).pValue;
      assertClose(c.p, p, 1e-12);
      assertClose(c.pAdj, Math.min(1, p * 3), 1e-12);
      assertEqual(c.equal, c.pAdj >= 0.05);
      assertTrue(c.ci[0] <= c.ci[1], 'Intervall geordnet');
    }
    assertLettersMatch(r);
  });

  test('Varianzfrage, normal: F-Test je Paar, kein Intervall, kein Rangweg', () => {
    const r = bonferroniPairwise(G, 0.05, true, true);
    assertEqual(r.methodName, 'F-Test');
    assertEqual(r.isRank, false);
    for (const c of r.comparisons) {
      const p = fTest(G[c.i], G[c.j], 'two-sided', 0.05).pValue;
      assertClose(c.pAdj, Math.min(1, p * 3), 1e-12);
      assertEqual(c.ci, null);
    }
    assertLettersMatch(r);
  });

  test('Varianzfrage, nicht normal: Levene (Brown-Forsythe) je Paar', () => {
    const r = bonferroniPairwise(G, 0.05, true, false);
    assertEqual(r.methodName, 'Levene Test (Brown-Forsythe)');
    for (const c of r.comparisons) {
      const p = leveneTest(G[c.i], G[c.j], 0.05).pValue;
      assertClose(c.pAdj, Math.min(1, p * 3), 1e-12);
    }
  });

  test('pAdj wird bei 1 gekappt', () => {
    const same = [[1, 2, 3, 4], [1, 2, 3, 4.01], [1, 2, 3, 3.99]];
    const r = bonferroniPairwise(same, 0.05, true, true);
    assertTrue(r.comparisons.every((c) => c.pAdj <= 1), 'alle ≤ 1');
    assertDeepEqual(r.letters, ['a', 'a', 'a']);
  });
});
