/**
 * Tests for modules/pairwise-comparison/domain/run.js — Paarfolge (Zahl,
 * jede Paarung genau einmal, Mischen über die Zufallsquelle), Punkte,
 * Rangfolge mit stabilem Gleichstand, Erreichbarkeit der Reiter und der
 * Zyklus einer Matrixzelle samt Gegenzelle.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import {
  MAX_CRITERIA, MIN_CRITERIA, PHASES, makePairs, zeroMatrix, scores, ranked,
  compareReachable, currentPairOf, resultsReachable, phaseReachable, nextCell, mirrorCell,
} from '../../../js/modules/pairwise-comparison/domain/run.js';

/** Zufallsquelle, die der Reihe nach die Werte liefert (danach 0). @param {number[]} values */
const seq = (values) => { let k = 0; return () => values[k++] ?? 0; };

suite('pairwise-comparison run — Konstanten', () => {
  test('15 höchstens, 3 mindestens, drei Reiter', () => {
    assertEqual(MAX_CRITERIA, 15);
    assertEqual(MIN_CRITERIA, 3);
    assertDeepEqual([...PHASES], ['input', 'compare', 'results']);
  });
});

suite('pairwise-comparison run — makePairs', () => {
  test('n·(n−1)/2 Paare, jede Paarung genau einmal, i < j', () => {
    for (const n of [0, 1, 2, 3, 5, 15]) {
      const pairs = makePairs(n, Math.random);
      assertEqual(pairs.length, (n * (n - 1)) / 2, `n=${n}`);
      const keys = new Set(pairs.map(([a, b]) => `${a}:${b}`));
      assertEqual(keys.size, pairs.length, `n=${n} doppelt`);
      assertTrue(pairs.every(([a, b]) => a < b && a >= 0 && b < n), `n=${n} Form`);
    }
  });

  test('Zufall immer nahe 1 lässt die Reihenfolge stehen', () => {
    assertDeepEqual(makePairs(3, () => 0.999), [[0, 1], [0, 2], [1, 2]]);
  });

  test('Zufall 0 rotiert nach Fisher–Yates', () => {
    // [a,b,c]: i=2 tauscht 2↔0 → [c,b,a]; i=1 tauscht 1↔0 → [b,c,a]
    assertDeepEqual(makePairs(3, () => 0), [[0, 2], [1, 2], [0, 1]]);
  });

  test('feste Folge der Zufallsquelle → feste Paarfolge', () => {
    const a = makePairs(4, seq([0.1, 0.7, 0.3, 0.9, 0.5]));
    const b = makePairs(4, seq([0.1, 0.7, 0.3, 0.9, 0.5]));
    assertDeepEqual(a, b);
    assertEqual(a.length, 6);
  });
});

suite('pairwise-comparison run — Punkte und Rangfolge', () => {
  test('zeroMatrix', () => {
    assertDeepEqual(zeroMatrix(0), []);
    assertDeepEqual(zeroMatrix(2), [[0, 0], [0, 0]]);
  });

  test('Zeilensummen ohne Diagonale', () => {
    assertDeepEqual(scores([[9, 1, 0.5], [0, 9, 1], [0.5, 0, 9]]), [1.5, 1, 0.5]);
    assertDeepEqual(scores([]), []);
  });

  test('AHP-Matrix der goldenen Fixture: Summen über die Gewichte', () => {
    const m = [[1, 3, 5, 0.33], [0.33, 1, 3, 0.2], [0.2, 0.33, 1, 0.14], [3, 5, 7, 1]];
    const sc = scores(m);
    assertEqual(sc[0], 3 + 5 + 0.33);
    assertEqual(sc[3], 15);
  });

  test('Rangfolge absteigend, Gleichstand in Eingabereihenfolge (stabil)', () => {
    const r = ranked(['A', 'B', 'C', 'D', 'E'], [3, 4, 1.5, 0, 1.5]);
    assertDeepEqual(r.map((x) => x.name), ['B', 'A', 'C', 'E', 'D']);
    assertDeepEqual(r.map((x) => x.idx), [1, 0, 2, 4, 3]);
    assertDeepEqual(r.map((x) => x.score), [4, 3, 1.5, 1.5, 0]);
  });

  test('Altprojekt: Kosten, Lieferzeit, Prüfaufwand, Service', () => {
    const matrix = [[0, 1, 0.5, 1], [0, 0, 0, 1], [0.5, 1, 0, 0], [0, 0, 1, 0]];
    const sc = scores(matrix);
    assertDeepEqual(sc, [2.5, 1, 1.5, 1]);
    assertDeepEqual(ranked(['Kosten', 'Prüfaufwand; Stufe "B"', 'Lieferzeit', 'Service'], sc).map((x) => x.idx), [0, 2, 1, 3]);
  });
});

suite('pairwise-comparison run — Erreichbarkeit', () => {
  const pairs = [[0, 1], [0, 2], [1, 2]];
  test('ohne Paare weder Vergleich noch Ergebnis', () => {
    const m = { pairs: [], currentPair: 0 };
    assertEqual(compareReachable(m), false);
    assertEqual(resultsReachable(m), false);
    assertEqual(phaseReachable('input', m), true);
    assertEqual(phaseReachable('compare', m), false);
    assertEqual(phaseReachable('results', m), false);
  });

  test('laufender Vergleich', () => {
    const m = { pairs, currentPair: 2 };
    assertEqual(compareReachable(m), true);
    assertEqual(resultsReachable(m), false);
    assertEqual(phaseReachable('compare', m), true);
  });

  test('abgeschlossen, auch über die Länge hinaus', () => {
    for (const currentPair of [3, 7]) {
      const m = { pairs, currentPair };
      assertEqual(compareReachable(m), false);
      assertEqual(resultsReachable(m), true);
      assertEqual(phaseReachable('results', m), true);
    }
  });

  test('negativer Fortschritt: weder Vergleich noch Ergebnis', () => {
    const m = { pairs, currentPair: -1 };
    assertEqual(compareReachable(m), false);
    assertEqual(resultsReachable(m), false);
  });

  test('fremder Reiter ist nie erreichbar', () => {
    assertEqual(phaseReachable('other', { pairs, currentPair: 0 }), false);
  });
});

suite('pairwise-comparison run — anstehendes Paar', () => {
  const matrix = zeroMatrix(3);
  test('zwei verschiedene gültige Zeilennummern', () => {
    assertDeepEqual(currentPairOf({ matrix, pairs: [[0, 1], [2, 1]], currentPair: 1 }), [2, 1]);
  });
  test('sonst null: kein Paar, falsche Länge, außerhalb der Matrix, doppelt, ohne Matrix', () => {
    for (const [pairs, mx] of [[[], matrix], [[[0]], matrix], [[[0, 1, 2]], matrix], [[[0, 3]], matrix], [[[-1, 0]], matrix], [[[1, 1]], matrix], [[[0, 1]], []]]) {
      assertEqual(currentPairOf({ matrix: mx, pairs, currentPair: 0 }), null, JSON.stringify(pairs));
    }
  });
});

suite('pairwise-comparison run — Zellzyklus', () => {
  test('0 → 0.5 → 1 → 0, jeder andere Wert → 0 (auch ein AHP-Wert)', () => {
    assertEqual(nextCell(0), 0.5);
    assertEqual(nextCell(0.5), 1);
    assertEqual(nextCell(1), 0);
    for (const v of [3, 0.33, 7, -1, undefined, '0']) assertEqual(nextCell(v), 0, String(v));
  });

  test('Gegenzelle: 0.5 bleibt, sonst 1 − v', () => {
    assertEqual(mirrorCell(0.5), 0.5);
    assertEqual(mirrorCell(1), 0);
    assertEqual(mirrorCell(0), 1);
  });
});
