/**
 * MSA Typ 4: Model — Schema, Vorgaben, Invariante, Ableitungen, gespeicherte Form.
 */
import { suite, test, assert, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State, NORMS, PV_MODES, ALPHA_OPTIONS } from '../../../js/modules/msa-typ4/domain/model.js';
import { analyze } from '../../../js/engines/msa-typ4-engine.js';
import { toResult } from '../../../js/modules/msa-typ4/domain/analyze.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { setFields } from '../../../js/core/model.js';
import { sheetSource, spySource } from '../../helpers/sheet-source.js';

const CTX = { cycle: 'dmaic', confidenceLevel: 95, power: 80 };
const ref = (col) => ({ instanceId: 'ws1', sheetId: 's1', columnId: col });
const strip = ({ _schema, ...rest }) => rest;
/** Eingaben schreiben wie `instance.set` und `x-field`: das ganze Objekt `params`. */
const setP = (m, p) => { m.params = { ...m.params, ...p }; };
const setTol = (m, t) => setP(m, { tolerance: { ...m.params.tolerance, ...t } });
const DEFAULT_PARAMS = {
  name: '', unit: 'mm', norm: 'AIAG', pvMode: 'tolerance', tolerance: { LSL: null, USL: null }, sigmaP: null, alpha: 0.05,
};
const plainParams = (m) => ({ ...m.params, tolerance: { ...m.params.tolerance } });
const REF = [2, 2, 2, 4, 4, 4, 6, 6, 6, 8, 8, 8, 10, 10, 10];
const MEAS = REF.map((x, i) => x + 0.01 * x + ((i % 3) - 1) * 0.02);

suite('MSA Typ 4 Model — Vorgaben und Literale', () => {
  test('Vorgaben wie die Altform, Zahlen statt Text; kein Inhalt', () => {
    const m = new State(CTX);
    assertDeepEqual(plainParams(m), DEFAULT_PARAMS);
    assertEqual(m.refColumn, null);
    assertEqual(m.measColumn, null);
    assertEqual(m.exampleWorksheetId, null);
    assertEqual(m.hasContent(), false);
  });
  test('Literale im Schema gleich den Konstanten und der Engine', () => {
    const p = State.schema.fields.params.shape;
    assertDeepEqual([...p.norm.values], NORMS);
    assertDeepEqual([...p.pvMode.values], PV_MODES);
    assertDeepEqual([...p.alpha.values], ALPHA_OPTIONS);
    // Die Engine kennt VDA5 und sixSigma als Literale; AIAG ist ihr Rückfall.
    const r = analyze(REF, MEAS, { pvMode: 'sixSigma', LSL: 0, USL: 12, sigmaP: 0.5, alpha: 0.05, norm: 'VDA5' });
    assertEqual(r.pv.value, 3);
    assertEqual(r.interpretation.textKey.startsWith('modules.msa-typ4.interpVDA5_'), true);
    const a = analyze(REF, MEAS, { pvMode: 'tolerance', LSL: 0, USL: 12, sigmaP: NaN, alpha: 0.05, norm: 'AIAG' });
    assertEqual(a.pv.value, 12);
    assertEqual(a.interpretation.textKey.startsWith('modules.msa-typ4.interpAIAG_'), true);
  });
  test('Ansichtsfelder: Beispiel-Arbeitsblatt und vier Diagramme', () => {
    assertDeepEqual(Object.keys(State.schema.view),
      ['exampleWorksheetId', 'linearityChart', 'pctBiasChart', 'perRefChart', 'residualChart']);
  });
});

suite('MSA Typ 4 Model — hasContent', () => {
  test('Spalte, Name, Grenze oder σP zählt (auch 0); Einheit, Norm, Modus und α nicht', () => {
    const cases = [
      [(m) => { m.refColumn = ref('r'); }, true],
      [(m) => { m.measColumn = ref('m'); }, true],
      [(m) => setP(m, { name: 'x' }), true],
      [(m) => setTol(m, { LSL: 0 }), true],
      [(m) => setTol(m, { USL: 12 }), true],
      [(m) => setP(m, { sigmaP: 0.5 }), true],
      [(m) => setP(m, { unit: 'µm' }), false],
      [(m) => setP(m, { norm: 'VDA5' }), false],
      [(m) => setP(m, { pvMode: 'sixSigma' }), false],
      [(m) => setP(m, { alpha: 0.01 }), false],
    ];
    for (const [fn, want] of cases) {
      const m = new State(CTX);
      fn(m);
      assertEqual(m.hasContent(), want, fn.toString());
    }
  });
});

suite('MSA Typ 4 Model — Feldbereiche und limitsOrder', () => {
  const rejects = (fn, label) => {
    const m = new State(CTX);
    let err;
    try { fn(m); } catch (e) { err = e; }
    assert(err, label);
    assertDeepEqual(plainParams(m), DEFAULT_PARAMS);
    return err;
  };
  test('Norm, Bezugsstreuung und α nur aus der Liste; Text der Auswahl wird Zahl', () => {
    rejects((m) => setP(m, { norm: 'ISO' }), 'norm');
    rejects((m) => setP(m, { pvMode: 'x' }), 'pvMode');
    rejects((m) => setP(m, { alpha: 0.2 }), 'alpha 0.2');
    rejects((m) => setP(m, { alpha: 0.1 + 0.2 }), 'alpha 0.30000000000000004');
    const m = new State(CTX);
    setP(m, { alpha: /** @type {any} */ ('0.1') });
    assertEqual(m.params.alpha, 0.1);
  });
  test('LSL ≥ USL wird abgelehnt (limitsOrder), eine Grenze allein nicht', () => {
    const err = rejects((m) => setTol(m, { LSL: 12, USL: 0 }), 'LSL > USL');
    assertEqual(err.invariant, 'limitsOrder');
    rejects((m) => setTol(m, { LSL: 5, USL: 5 }), 'LSL = USL');
    const m = new State(CTX);
    setTol(m, { LSL: 12 });
    setTol(m, { USL: null });
    assertEqual(m.params.tolerance.LSL, 12);
    setTol(m, { USL: 13 });
    assertEqual(m.params.tolerance.USL, 13);
  });
  test('Laden mit Reparatur leert USL; streng geladen wirft es', () => {
    const json = { _schema: { version: '1.0' }, params: { ...DEFAULT_PARAMS, tolerance: { LSL: 12, USL: 0 } } };
    const reports = [];
    const m = State.fromJSON(json, { repair: true, onRepair: (n) => reports.push(n), context: CTX });
    assertDeepEqual({ ...m.params.tolerance }, { LSL: 12, USL: null });
    assertTrue(reports.length > 0, 'Reparatur gemeldet');
    let err;
    try { State.fromJSON(json, { context: CTX }); } catch (e) { err = e; }
    assert(err, 'streng abgelehnt');
  });
});

suite('MSA Typ 4 Model — gespeicherte Form', () => {
  test('params.* samt tolerance.{LSL,USL}, refColumn, measColumn an den Pfaden der Altform', () => {
    const m = new State(CTX);
    setP(m, { name: 'Bolzen', tolerance: { LSL: 0, USL: 12 } });
    m.refColumn = ref('r');
    m.measColumn = ref('m');
    m.exampleWorksheetId = 'ws9';
    const json = m.toJSON();
    assertDeepEqual(Object.keys(json.params), ['name', 'unit', 'norm', 'pvMode', 'tolerance', 'sigmaP', 'alpha']);
    assertDeepEqual(json.params.tolerance, { LSL: 0, USL: 12 });
    assertDeepEqual(json.refColumn, ref('r'));
    assertDeepEqual(json.measColumn, ref('m'));
    assertEqual(json.exampleWorksheetId, 'ws9');
  });
  test('toJSON → fromJSON verlustfrei', () => {
    const m = new State(CTX);
    setFields(m, {
      params: { name: 'A', unit: 'µm', norm: 'VDA5', pvMode: 'sixSigma', tolerance: { LSL: 1, USL: 2 }, sigmaP: 0.5, alpha: 0.01 },
      refColumn: ref('r'),
      measColumn: ref('m'),
    });
    m.exampleWorksheetId = 'ws9';
    const back = State.fromJSON(m.toJSON(), { context: CTX });
    assertDeepEqual(strip(back.toJSON()), strip(m.toJSON()));
  });
});

suite('MSA Typ 4 Model — Ableitungen', () => {
  const src = sheetSource({ r: REF, m: MEAS });
  const full = () => {
    const m = new State(CTX);
    setP(m, { tolerance: { LSL: 0, USL: 12 } });
    m.refColumn = ref('r');
    m.measColumn = ref('m');
    return m;
  };

  test('result gleich der Engine (ohne ciBand), liest die Spalten über den Leser', () => {
    const { result } = evaluateDerived(full(), spySource(src));
    assertDeepEqual(result, toResult(analyze(REF, MEAS, { pvMode: 'tolerance', LSL: 0, USL: 12, sigmaP: NaN, alpha: 0.05, norm: 'AIAG' })));
    assertEqual('ciBand' in result.regression, false);
  });
  test('result null ohne Spalte und bei gelöschter Spalte', () => {
    assertEqual(evaluateDerived(new State(CTX), src).result, null);
    const m = full();
    m.measColumn = ref('weg');
    assertEqual(evaluateDerived(m, src).result, null);
  });
  test('result invalid ohne Toleranz', () => {
    const m = full();
    setP(m, { tolerance: { LSL: null, USL: null } });
    assertDeepEqual(evaluateDerived(m, src).result, { invalid: { key: 'modules.msa-typ4.errInvalidPv', vars: null } });
  });
  test('activeParams: sigmaP nur bei sixSigma, Toleranz immer in Punktform', () => {
    const m = new State(CTX);
    assertDeepEqual(evaluateDerived(m, src).activeParams,
      ['name', 'unit', 'norm', 'pvMode', 'tolerance.LSL', 'tolerance.USL', 'alpha']);
    setP(m, { pvMode: 'sixSigma' });
    assertDeepEqual(evaluateDerived(m, src).activeParams,
      ['name', 'unit', 'norm', 'pvMode', 'tolerance.LSL', 'tolerance.USL', 'sigmaP', 'alpha']);
  });
  test('activeColumnSlots: immer Referenz und Messwert', () => {
    assertDeepEqual(evaluateDerived(new State(CTX), src).activeColumnSlots, ['reference', 'measured']);
  });
  test('σP wirkt nur bei sixSigma', () => {
    const m = full();
    const before = evaluateDerived(m, src).result;
    setP(m, { sigmaP: 0.5 });
    assertDeepEqual(evaluateDerived(m, src).result, before);
    setP(m, { pvMode: 'sixSigma' });
    assertEqual(evaluateDerived(m, src).result.pv.value, 3);
  });
});
