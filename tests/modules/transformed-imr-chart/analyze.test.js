/**
 * Transformierte I-MR-Karte: die Rechnung (domain/analyze.js) gegen die
 * Altrechnung. Die Literale haben die Form von `read().result` des Altmoduls
 * (`_agentResult`) für die Altprojekt-Fixture (λ = 0,25, manuell; KPIs und
 * Grenzentabelle stimmen mit den Literalen des E2E „Legacy project“ aus
 * Task 0 überein) und das Beispiel `spc-transformed-imr` (auto: λ = 0,35 wie
 * Sonde (b), manuell λ = 0,5).
 */
import { suite, test, assertEqual, assertDeepEqual, assertDeepClose, assertTrue } from '../../test-utils.js';
import {
  MIN_VALUES, inputValues, lambdaOf, analyze, resultOf, pointsOf, shownLambda, engineRuns,
} from '../../../js/modules/transformed-imr-chart/domain/analyze.js';

const plain = (v) => JSON.parse(JSON.stringify(v));

/** Spalte „Standzeit“ der Altprojekt-Fixture (n = 30, Ausreißer 64 an Stelle 24). */
const STANDZEIT = [
  12.4, 8.1, 15.3, 9.7, 21.6, 11.2, 7.4, 13.8, 10.5, 18.9, 6.8, 14.1, 9.2, 26.3, 12.7,
  8.8, 16.4, 11.9, 7.9, 19.8, 10.1, 13.3, 9.5, 64, 11.6, 8.4, 17.2, 12.2, 10.8, 14.9,
];

/** Spalte „Standzeit“ des Beispiels `spc-transformed-imr` (n = 50). */
const EXAMPLE = [
  9.4525, 3.4527, 20.8374, 7.5708, 7.5441, 10.3229, 10.6644, 10.037, 6.3887, 12.8963,
  9.6901, 7.6611, 19.9312, 11.5594, 12.0971, 9.8213, 14.2051, 18.2342, 12.2842, 21.3365,
  3.8902, 18.2201, 9.0455, 5.354, 9.3759, 15.9184, 5.4888, 14.3362, 10.2634, 15.1397,
  13.2288, 16.7757, 8.7112, 7.0475, 18.6266, 15.7543, 15.8801, 10.6116, 9.2593, 6.2557,
  8.5027, 12.0718, 11.8991, 12.3737, 8.2504, 7.7908, 5.5256, 5.582, 16.3129, 4.6639,
];

/** `read().result` der Altform für die Altprojekt-Fixture (manuell, λ = 0,25). */
const LEGACY_RESULT = {
  n: 30, lambda: 0.25, lambdaAuto: false,
  i: { cl: 3.611341686152775, ucl: 6.880092160823472, lcl: 0.3425912114820777, sigma: 1.0895834915568992 },
  mr: { cl: 1.229050178476182, ucl: 4.015306933081686, lcl: 0 },
  iOriginal: { cl: 13.110066936701209, ucl: 54.73817719553579, lcl: 1.3891713921762856 },
  signals: [23],
};

/** `read().result` der Altform für das Beispiel im Modus `auto`. */
const EXAMPLE_AUTO_RESULT = {
  n: 50, lambda: 0.35, lambdaAuto: true,
  i: { cl: 3.6587076170624835, ucl: 6.671647655761603, lcl: 0.6457675783633636, sigma: 1.00431334623304 },
  mr: { cl: 1.132865454550869, ucl: 3.7010714400176887, lcl: 0 },
  iOriginal: { cl: 10.543116638978987, ucl: 31.23115655832991, lcl: 1.7899825322494618 },
  signals: [],
};

/** `read().result` der Altform für das Beispiel im Modus `manual`, λ = 0,5. */
const EXAMPLE_MANUAL_RESULT = {
  n: 50, lambda: 0.5, lambdaAuto: false,
  i: { cl: 4.538510328562812, ucl: 8.824247748251015, lcl: 0.25277290887460957, sigma: 1.4285791398960674 },
  mr: { cl: 1.611437269802764, ucl: 5.26456556044563, lcl: 0 },
  iOriginal: { cl: 10.688029329180644, ucl: 29.291084828879292, lcl: 1.2687464447398424 },
  signals: [],
};

const ref = (c) => ({ instanceId: 'ws1', sheetId: 's1', columnId: c });
/** Spaltenleser wie `sourceColumns` über ein Wörterbuch Spalten-Id → Werte. */
const reader = (cols) => ({ values: (r) => cols[r.columnId] ?? null });

/** Führt `fn` aus, ohne dass `console.warn` die Ausgabe füllt; liefert die Zahl der Warnungen. */
function quiet(fn) {
  const orig = console.warn;
  let warned = 0;
  console.warn = () => { warned += 1; };
  try { return { value: fn(), warned }; } finally { console.warn = orig; }
}

suite('transformed-imr-chart: Konstanten', () => {
  test('ab fünf Werten', () => {
    assertEqual(MIN_VALUES, 5);
  });
});

suite('transformed-imr-chart: inputValues und lambdaOf', () => {
  const read = reader({ a: [1, '2,5', null, NaN, 3, '4', undefined, 5.5] });

  test('nur echte Zahlen zählen (Text „2,5“, null, NaN nicht)', () => {
    assertDeepEqual(inputValues({ columnRef: ref('a') }, read), [1, 3, 5.5]);
  });

  test('ohne Bezug oder bei fehlender Spalte leer', () => {
    assertDeepEqual(inputValues({ columnRef: null }, read), []);
    assertDeepEqual(inputValues({ columnRef: ref('gone') }, read), []);
  });

  test('lambdaOf: λ nur im Modus manual, sonst undefined', () => {
    assertEqual(lambdaOf({ lambdaMode: 'manual', lambdaManual: 0.5 }), 0.5);
    assertEqual(lambdaOf({ lambdaMode: 'manual', lambdaManual: 0 }), 0);
    assertEqual(lambdaOf({ lambdaMode: 'auto', lambdaManual: 0.5 }), undefined);
  });
});

suite('transformed-imr-chart: analyze', () => {
  test('unter fünf Werten null (keine Ausgabe, kein Fehler)', () => {
    assertEqual(analyze([], undefined), null);
    assertEqual(analyze([1, 2, 3, 4], undefined), null);
    assertEqual(analyze([1, 2, 3, 4], 0.5), null);
  });

  test('ein Wert ≤ 0 → errPositiveOnly, vor der Engine', () => {
    const n = engineRuns();
    assertDeepEqual(analyze([1, 2, 3, 4, 0], undefined), { status: 'error', reason: 'errPositiveOnly' });
    assertDeepEqual(analyze([1, 2, -3, 4, 5], 0.5), { status: 'error', reason: 'errPositiveOnly' });
    assertEqual(engineRuns(), n, 'die Engine läuft nicht');
  });

  test('Engine wirft errPositiveOnly (∞) → derselbe Grund', () => {
    assertDeepEqual(analyze([1, 2, 3, 4, Infinity], undefined), { status: 'error', reason: 'errPositiveOnly' });
  });

  test('jeder andere Wurf der Engine → errCompute mit Warnung', () => {
    // Das erste Element wirft erst beim zweiten Lesen, also in der Engine
    // (das erste liest die eigene Prüfung auf Werte ≤ 0).
    const v = [1, 2, 3, 4, 5, 6, 7];
    let reads = 0;
    Object.defineProperty(v, 0, { get() { reads += 1; if (reads === 2) throw new Error('boom'); return 1; } });
    const { value, warned } = quiet(() => analyze(v, 0.5));
    assertDeepEqual(value, { status: 'error', reason: 'errCompute' });
    assertEqual(warned, 1, 'Ursache per console.warn');
  });

  test('nicht endliche Grenze (Überlauf) → errCompute mit Warnung', () => {
    const { value, warned } = quiet(() => analyze([1e200, 2e200, 3e200, 4e200, 5e200], 3));
    assertDeepEqual(value, { status: 'error', reason: 'errCompute' });
    assertEqual(warned, 1);
    const neg = quiet(() => analyze([1e-200, 2e-200, 3e-200, 4e-200, 5e-200], -3));
    assertDeepEqual(neg.value, { status: 'error', reason: 'errCompute' });
  });

  test('Altprojekt: Rohergebnis der Engine mit n', () => {
    const a = analyze(STANDZEIT, 0.25);
    assertEqual(a.status, 'ok');
    assertEqual(a.n, 30);
    assertEqual(a.fit.lambda, 0.25);
    assertEqual(a.fit.lambdaAuto, false);
    assertEqual(a.fit.transformed.length, 30);
    assertDeepEqual(a.fit.signalsI, [23]);
  });
});

suite('transformed-imr-chart: Merker', () => {
  test('gleiche Eingabe → dasselbe Objekt, die Engine läuft nicht', () => {
    const a = analyze(STANDZEIT, 0.25);
    const n = engineRuns();
    const b = analyze([...STANDZEIT], 0.25);
    assertTrue(a === b, 'dasselbe Objekt');
    resultOf(b); pointsOf(b);
    assertEqual(engineRuns(), n, 'Ergebnis und Punkte rufen die Engine nicht');
  });

  test('andere Zahl → neue Rechnung', () => {
    analyze(STANDZEIT, 0.25);
    const n = engineRuns();
    const changed = [...STANDZEIT]; changed[0] = 12.5;
    analyze(changed, 0.25);
    assertEqual(engineRuns(), n + 1);
  });

  test('anderes λ oder Wechsel auf auto → neue Rechnung', () => {
    analyze(STANDZEIT, 0.25);
    const n = engineRuns();
    analyze(STANDZEIT, 0.5);
    assertEqual(engineRuns(), n + 1);
    analyze(STANDZEIT, undefined);
    assertEqual(engineRuns(), n + 2);
    analyze(STANDZEIT, undefined);
    assertEqual(engineRuns(), n + 2, 'auto zweimal: einmal gerechnet');
  });

  test('der Merker hält auch Fehler und null', () => {
    const e = analyze([1, 2, 3, 4, 0], undefined);
    assertTrue(analyze([1, 2, 3, 4, 0], undefined) === e);
  });
});

suite('transformed-imr-chart: resultOf gleich der Altform', () => {
  test('Altprojekt (manuell, λ = 0,25)', () => {
    assertDeepClose(resultOf(analyze(STANDZEIT, 0.25)), LEGACY_RESULT);
  });

  test('Beispiel, auto (λ geschätzt 0,35)', () => {
    assertDeepClose(resultOf(analyze(EXAMPLE, undefined)), EXAMPLE_AUTO_RESULT);
  });

  test('Beispiel, manuell λ = 0,5', () => {
    assertDeepClose(resultOf(analyze(EXAMPLE, 0.5)), EXAMPLE_MANUAL_RESULT);
  });

  test('ohne Funktionen: übersteht JSON unverändert', () => {
    const r = resultOf(analyze(STANDZEIT, 0.25));
    assertDeepEqual(plain(r), r);
  });

  test('null ohne Ergebnis oder bei Fehler', () => {
    assertEqual(resultOf(null), null);
    assertEqual(resultOf({ status: 'error', reason: 'errCompute' }), null);
  });

  test('nicht endliche zurücktransformierte Grenze wird null', () => {
    // λ = 1: die untere Grenze liegt unter −1, die Rücktransformation ist NaN.
    const r = resultOf(analyze([1, 1, 1, 1, 9, 1, 1, 1], 1));
    assertEqual(r.iOriginal.lcl, null);
    assertTrue(typeof r.i.lcl === 'number');
  });
});

suite('transformed-imr-chart: pointsOf', () => {
  test('je Wert eine Zeile in Datenfolge, Signal markiert', () => {
    const p = pointsOf(analyze(STANDZEIT, 0.25));
    assertEqual(p.length, 30);
    assertDeepEqual(Object.keys(p[0]), ['transformed', 'signal']);
    assertEqual(p[23].signal, true);
    assertEqual(p.filter((r) => r.signal).length, 1);
    assertEqual(p[23].transformed.toFixed(4), '7.3137');
  });

  test('leer ohne Ergebnis oder bei Fehler', () => {
    assertDeepEqual(pointsOf(null), []);
    assertDeepEqual(pointsOf({ status: 'error', reason: 'errPositiveOnly' }), []);
  });
});

suite('transformed-imr-chart: shownLambda (Heilung beim Lesen)', () => {
  const auto = resultOf(analyze(EXAMPLE, undefined));

  test('auto mit Ergebnis: das geschätzte λ, nicht der gespeicherte Wert', () => {
    // Altfehler: nach dem Laden des Beispiels stand gespeichert 0, angezeigt 0,35.
    assertEqual(shownLambda({ lambdaMode: 'auto', lambdaManual: 0 }, auto), 0.35);
    assertEqual(shownLambda({ lambdaMode: 'auto', lambdaManual: 0.85 }, auto), 0.35);
  });

  test('auto ohne Ergebnis: der gespeicherte Wert', () => {
    assertEqual(shownLambda({ lambdaMode: 'auto', lambdaManual: 0.85 }, null), 0.85);
  });

  test('manuell: immer der gespeicherte Wert', () => {
    assertEqual(shownLambda({ lambdaMode: 'manual', lambdaManual: 0.25 }, auto), 0.25);
    assertEqual(shownLambda({ lambdaMode: 'manual', lambdaManual: 0.25 }, null), 0.25);
  });
});
