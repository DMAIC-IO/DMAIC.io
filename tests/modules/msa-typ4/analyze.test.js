/**
 * MSA Typ 4: Spalten paaren, Engine mit Merker rechnen, Ergebnis für die
 * Lesefläche und Konfidenzband als reine Funktionen.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import {
  readInputs, engineParams, runEngine, toResult, bandPoints, BAND_STEPS,
} from '../../../js/modules/msa-typ4/domain/analyze.js';
import * as engine from '../../../js/engines/msa-typ4-engine.js';
import { sheetSource } from '../../helpers/sheet-source.js';

const ref = (col) => ({ instanceId: 'ws1', sheetId: 's1', columnId: col });
const cols = (r, m) => ({ refColumn: r, measColumn: m });
/** Fünf Referenzen zu je drei Wiederholungen, leicht steigender Bias. */
const REF = [2, 2, 2, 4, 4, 4, 6, 6, 6, 8, 8, 8, 10, 10, 10];
const MEAS = REF.map((x, i) => x + 0.01 * x + ((i % 3) - 1) * 0.02);
const P = { norm: 'AIAG', pvMode: 'tolerance', tolerance: { LSL: 0, USL: 12 }, sigmaP: null, alpha: 0.05 };
const INPUTS = { reference: REF, measured: MEAS };

suite('MSA Typ 4 analyze — readInputs', () => {
  test('ohne eine der beiden Spalten null', () => {
    const src = sheetSource({ r: [1], m: [1] });
    assertEqual(readInputs(cols(null, ref('m')), src), null);
    assertEqual(readInputs(cols(ref('r'), null), src), null);
  });
  test('gelöschte Spalte null', () => {
    assertEqual(readInputs(cols(ref('weg'), ref('m')), sheetSource({ r: [1], m: [1] })), null);
  });
  test('Paarbildung bis zur kürzeren Spalte; Zeile fällt, wenn ein Wert keine Zahl ist', () => {
    const src = sheetSource({
      r: [1, 2, 3, 4, 5, 6, 7],
      m: [1.1, '2,5', null, '', 'abc', true, '1.234,5', 99],
    });
    assertDeepEqual(readInputs(cols(ref('r'), ref('m')), src),
      { reference: [1, 2, 7], measured: [1.1, 2.5, 1234.5] });
  });
  test('Text in der Referenzspalte zählt mit Dezimalkomma', () => {
    const src = sheetSource({ r: ['2,5', '3'], m: [1, 2] });
    assertDeepEqual(readInputs(cols(ref('r'), ref('m')), src), { reference: [2.5, 3], measured: [1, 2] });
  });
  test('keine Paare: null', () => {
    assertEqual(readInputs(cols(ref('r'), ref('m')), sheetSource({ r: ['x'], m: [1] })), null);
  });
});

suite('MSA Typ 4 analyze — Engine', () => {
  test('engineParams: leere Grenzen und σP als NaN', () => {
    const { sigmaP, ...rest } = engineParams(P);
    assertDeepEqual(rest, { pvMode: 'tolerance', LSL: 0, USL: 12, alpha: 0.05, norm: 'AIAG' });
    assertTrue(Number.isNaN(sigmaP), 'σP NaN');
    assertTrue(Number.isNaN(engineParams({ ...P, tolerance: { LSL: null, USL: 1 } }).LSL), 'LSL NaN');
  });
  test('runEngine ohne Eingaben null', () => {
    assertEqual(runEngine(P, null), null);
  });
  test('runEngine gleich der Engine mit den Parametern der Altform', () => {
    const got = toResult(runEngine(P, INPUTS));
    const want = toResult(engine.analyze(REF, MEAS, { pvMode: 'tolerance', LSL: 0, USL: 12, sigmaP: NaN, alpha: 0.05, norm: 'AIAG' }));
    assertDeepEqual(got, want);
  });
  test('Merker: dieselben Eingaben rechnen nicht noch einmal, andere schon', () => {
    const a = runEngine({ ...P, alpha: 0.01 }, { reference: [...REF], measured: [...MEAS] });
    const b = runEngine({ ...P, alpha: 0.01 }, { reference: [...REF], measured: [...MEAS] });
    assertTrue(a === b, 'gleicher Lauf');
    const c = runEngine({ ...P, alpha: 0.1 }, INPUTS);
    assertTrue(c !== a, 'neuer Lauf');
  });
});

suite('MSA Typ 4 analyze — toResult', () => {
  test('ohne Lauf null', () => {
    assertEqual(toResult(null), null);
  });
  test('ohne Funktion: regression.ciBand fehlt, Zahlen bleiben', () => {
    const r = toResult(runEngine(P, INPUTS));
    assertEqual('ciBand' in r.regression, false);
    assertEqual(r.ok, true);
    assertEqual(r.perReference.length, 5);
    assertDeepEqual(Object.keys(r), ['ok', 'perReference', 'regression', 'kpi', 'pv', 'interpretation']);
    assertEqual(JSON.stringify(r), JSON.stringify(JSON.parse(JSON.stringify(r))));
  });
  test('nicht endliche Werte werden null (Q_MS_BI bei T ≤ 0)', () => {
    const r = toResult(runEngine({ ...P, norm: 'VDA5', pvMode: 'sixSigma', sigmaP: 0.5, tolerance: { LSL: 12, USL: null } }, INPUTS));
    assertEqual(r.kpi.vda5.Q_MS_BI, null);
    assertEqual(r.interpretation.textKey, 'modules.msa-typ4.interpVDA5_red');
  });
  test('je Grund der Engine invalid mit Schlüssel und Werten', () => {
    const cases = [
      [{ reference: [1, 2, 3, 4], measured: [1, 2, 3, 4] }, P, { key: 'modules.msa-typ4.errTooFewReferences', vars: { got: 4 } }],
      [{ reference: [1, 1, 2, 2, 3, 3, 4, 4, 5, 5], measured: [1, 1, 2, 2, 3, 3, 4, 4, 5, 5] }, P,
        { key: 'modules.msa-typ4.errTooFewRepeats', vars: { xRef: 1, n: 2 } }],
      [INPUTS, { ...P, tolerance: { LSL: null, USL: 12 } }, { key: 'modules.msa-typ4.errInvalidPv', vars: null }],
      [INPUTS, { ...P, pvMode: 'sixSigma', sigmaP: null }, { key: 'modules.msa-typ4.errInvalidPv', vars: null }],
    ];
    for (const [inputs, p, want] of cases) {
      assertDeepEqual(toResult(runEngine(p, inputs)), { invalid: want }, want.key);
    }
  });
});

suite('MSA Typ 4 analyze — bandPoints', () => {
  test('ohne gelungenen Lauf null', () => {
    assertEqual(bandPoints(null, INPUTS), null);
    assertEqual(bandPoints(runEngine({ ...P, tolerance: { LSL: null, USL: null } }, INPUTS), INPUTS), null);
  });
  test('41 Stützstellen nach der Altformel', () => {
    const run = runEngine(P, INPUTS);
    const b = bandPoints(run, INPUTS);
    assertEqual(b.x.length, BAND_STEPS + 1);
    assertEqual(b.x[0], 2);
    assertEqual(b.x[BAND_STEPS], 10);
    for (let i = 0; i <= BAND_STEPS; i++) {
      const x = 2 + 8 * (i / BAND_STEPS);
      const yhat = run.regression.slope * x + run.regression.intercept;
      const [lo, hi] = run.regression.ciBand(x);
      assertEqual(b.x[i], x);
      assertEqual(b.y[i], yhat);
      assertEqual(b.yPlus[i], Math.max(0, hi - yhat));
      assertEqual(b.yMinus[i], Math.max(0, yhat - lo));
    }
  });
});
