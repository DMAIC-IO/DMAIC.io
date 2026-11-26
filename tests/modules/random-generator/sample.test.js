/**
 * Tests for modules/random-generator/domain/sample.js — die erzeugten Werte
 * gleichen der Altform je Verteilung bei festem Startwert (Engine
 * `generateSamples` mit den aufgelösten Parametern, attributiv nach Gewicht),
 * ein leerer Startwert gilt als 42, der Merker zieht einen Stand nur einmal,
 * und die Zusammenfassung gleicht `read().generated` der Altform.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { DISTRIBUTIONS, generateSamples, resolveParams, mulberry32 } from '../../../js/engines/random-variates-engine.js';
import { descriptiveStats } from '../../../js/engines/normality-test-engine.js';
import {
  samplesOf, summaryOf, effectiveSeed, generateAttributive, attrProbabilities, frequency, frequencyShares, DEFAULT_SEED,
} from '../../../js/modules/random-generator/domain/sample.js';
import { State } from '../../../js/modules/random-generator/domain/model.js';

/** Ein Stand wie das Model ihn hält. @param {object} over */
function stateWith(over) {
  const m = new State();
  return { ...JSON.parse(JSON.stringify(m.toJSON())), ...over };
}

/** Altform: `generateAttributive` aus random-generator-model.js, wörtlich. */
function legacyAttributive(attributes, count, seed) {
  const valid = attributes.filter((a) => a.name && a.weight > 0);
  if (!valid.length) return [];
  const total = valid.reduce((s, a) => s + a.weight, 0);
  let running = 0;
  const cum = valid.map((a) => { running += a.weight / total; return { name: a.name, threshold: running }; });
  const rng = mulberry32(seed);
  const out = new Array(count);
  for (let i = 0; i < count; i++) {
    const r = rng();
    for (const c of cum) if (r <= c.threshold) { out[i] = c.name; break; }
  }
  return out;
}

suite('random-generator Werte — gleich der Altform', () => {
  test('jede stetige und diskrete Verteilung mit Vorgaben, Umfang 50, Startwert 7', () => {
    for (const key of Object.keys(DISTRIBUTIONS)) {
      const m = stateWith({ currentDist: key, count: 50, seed: 7 });
      const expected = generateSamples(key, resolveParams(key, {}), 50, 7);
      assertDeepEqual(samplesOf(m).values, expected, key);
    }
  });

  test('gesetzte Parameter wirken wie in der Altform (normal 5/2, Startwert 0)', () => {
    const params = { ...stateWith({}).params, normal: { mu: 5, sigma: 2, epsilon: 0, delta: 1 } };
    const m = stateWith({ currentDist: 'normal', params, count: 30, seed: 0 });
    assertDeepEqual(samplesOf(m).values, generateSamples('normal', resolveParams('normal', { mu: 5, sigma: 2 }), 30, 0));
  });

  test('attributiv: gleich der Altform, auch mit Gewicht 0 und leerem Namen', () => {
    const attributes = [
      { id: 'k1', name: 'Gut', weight: 6 }, { id: 'a2', name: 'Nacharbeit', weight: 3 },
      { id: 'k3', name: 'Ausschuss', weight: 0 }, { id: 'k4', name: '', weight: 2 },
    ];
    const m = stateWith({ currentDist: 'attributive', attributes, attrCount: 300, attrSeed: 0 });
    const values = samplesOf(m).values;
    assertDeepEqual(values, legacyAttributive(attributes, 300, 0));
    assertDeepEqual(frequency(values), [['Gut', 213], ['Nacharbeit', 87]]);
    assertDeepEqual(generateAttributive(attributes, 300, 0), values);
  });

  test('ohne Verteilung oder ohne gültige Kategorie keine Werte', () => {
    assertDeepEqual(samplesOf(stateWith({ currentDist: null })), { values: [], error: null });
    const m = stateWith({ currentDist: 'attributive', attributes: [{ id: 'x', name: '', weight: 1 }] });
    assertDeepEqual(samplesOf(m).values, []);
  });
});

suite('random-generator Werte — Startwert und Merker', () => {
  test('leerer Startwert gilt als 42, 0 bleibt 0', () => {
    assertEqual(DEFAULT_SEED, 42);
    assertEqual(effectiveSeed(null), 42);
    assertEqual(effectiveSeed(undefined), 42);
    assertEqual(effectiveSeed(0), 0);
    assertEqual(effectiveSeed(-3), -3);
    const empty = samplesOf(stateWith({ currentDist: 'uniform', seed: null, count: 10 })).values;
    const fortyTwo = samplesOf(stateWith({ currentDist: 'uniform', seed: 42, count: 10 })).values;
    assertDeepEqual(empty, fortyTwo);
    const attrEmpty = samplesOf(stateWith({ currentDist: 'attributive', attrSeed: null })).values;
    assertDeepEqual(attrEmpty, generateAttributive(new State().attributes, 50, 42));
  });

  test('derselbe Stand liefert dasselbe Ergebnis-Objekt, ein anderer ein neues', () => {
    const a = samplesOf(stateWith({ currentDist: 'poisson', count: 20 }));
    const b = samplesOf(stateWith({ currentDist: 'poisson', count: 20 }));
    assertTrue(a === b, 'Merker trifft');
    const c = samplesOf(stateWith({ currentDist: 'poisson', count: 21 }));
    assertTrue(c !== a);
    assertEqual(c.values.length, 21);
  });

  test('Parameter anderer Verteilungen ändern die Werte nicht', () => {
    const base = stateWith({ currentDist: 'normal', count: 15 });
    const other = { ...base, params: { ...base.params, uniform: { a: 2, b: 9 } } };
    assertDeepEqual(samplesOf(other).values, samplesOf(base).values);
  });
});

suite('random-generator Werte — Zusammenfassung', () => {
  test('stetig: Kennzahlen wie descriptiveStats', () => {
    const values = generateSamples('normal', resolveParams('normal', { mu: 5, sigma: 2 }), 200, 7);
    const ds = descriptiveStats(values);
    assertDeepEqual(summaryOf(values, false), {
      n: 200, mean: ds.mean, sd: ds.stdDev, median: ds.median,
      min: ds.min, max: ds.max, skewness: ds.skewness, kurtosis: ds.kurtosis,
    });
    assertEqual(summaryOf(values, false).mean.toFixed(4), '4.9574');
  });

  test('attributiv: n und Häufigkeiten mit Anteil, ohne Werte null', () => {
    assertDeepEqual(summaryOf(['B', 'A', 'B'], true), {
      n: 3, frequency: [{ name: 'B', count: 2, share: 2 / 3 }, { name: 'A', count: 1, share: 1 / 3 }],
    });
    assertEqual(summaryOf([], true), null);
    assertEqual(summaryOf([], false), null);
    assertDeepEqual(frequencyShares(['x']), [{ name: 'x', count: 1, share: 1 }]);
  });

  test('Anteile nach Gewicht in Prozent, negative zählen 0', () => {
    assertDeepEqual(attrProbabilities([{ weight: 6 }, { weight: 3 }, { weight: -1 }, { weight: 2 }])
      .map((p) => p.toFixed(1)), ['54.5', '27.3', '0.0', '18.2']);
    assertDeepEqual(attrProbabilities([{ weight: 0 }]), [0]);
  });
});
