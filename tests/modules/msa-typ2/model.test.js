import { suite, test, assert, assertEqual, assertThrows } from '../../test-utils.js';
import { State, K_OPTIONS, VERDICT_BASES } from '../../../js/modules/msa-typ2/domain/model.js';
import { analyze, validate } from '../../../js/engines/msa-typ2-engine.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { setFields } from '../../../js/core/model.js';
import { sheetSource, spySource } from '../../helpers/sheet-source.js';

const CTX = { cycle: 'dmaic', confidenceLevel: 95, power: 90 };
const ref = (col) => ({ instanceId: 'ws1', sheetId: 's1', columnId: col });

suite('MSA Typ 2 Model — Vorgaben', () => {
  test('Vorgaben: k 6, verdictBasis auto, alles andere null, kein Inhalt', () => {
    const m = new State(CTX);
    assertEqual(m.k, 6);
    assertEqual(m.verdictBasis, 'auto');
    for (const f of ['part', 'operator', 'measurement', 'lsl', 'usl', 'sigmaHist', 'exampleWorksheetId']) {
      assertEqual(m[f], null, f);
    }
    assertEqual(m.hasContent(), false);
  });

  test('α aus dem Konfidenzniveau: 95 → 0,05; 99,99999 wird auf 0,0001 geklemmt', () => {
    assertEqual(new State(CTX).alpha, 0.05);
    assertEqual(new State({ ...CTX, confidenceLevel: 99.99999 }).alpha, 0.0001);
  });

  test('hasContent: eine Spalte oder eine Grenze zählt', () => {
    const a = new State(CTX); a.part = ref('p');
    assertEqual(a.hasContent(), true);
    const b = new State(CTX); b.lsl = 1;
    assertEqual(b.hasContent(), true);
    const c = new State(CTX); c.usl = 1;
    assertEqual(c.hasContent(), true);
    const d = new State(CTX); d.k = 5.15;
    assertEqual(d.hasContent(), false);
  });
});

suite('MSA Typ 2 Model — Grenzen und Feldbereiche', () => {
  test('lsl = usl wird abgelehnt, Model unverändert', () => {
    const m = new State(CTX);
    m.lsl = 5;
    let err;
    try { m.usl = 5; } catch (e) { err = e; }
    assertEqual(err?.invariant, 'limitsOrder');
    assertEqual(m.usl, null);
    assertEqual(m.lsl, 5);
  });

  test('lsl über usl wird abgelehnt; usl = null erlaubt jedes lsl', () => {
    const m = new State(CTX);
    m.usl = 3;
    assertThrows(() => { m.lsl = 9; });
    assertEqual(m.lsl, null);
    m.usl = null;
    m.lsl = 9;
    assertEqual(m.lsl, 9);
  });

  test('Laden mit repair: lsl 9, usl 3 → usl null, onRepair meldet', () => {
    const reports = [];
    const m = State.fromJSON({ lsl: 9, usl: 3, _schema: { version: '1.0' } }, { repair: true, onRepair: (n) => reports.push(n), context: CTX });
    assertEqual(m.lsl, 9);
    assertEqual(m.usl, null);
    assert(reports.length > 0, 'onRepair gemeldet');
  });

  test('setFields: lsl und usl zusammen über die alten Grenzen hinweg, in einem Aufruf', () => {
    const m = new State(CTX);
    setFields(m, { lsl: 1, usl: 2 });
    setFields(m, { lsl: 10, usl: 20 });
    assertEqual(m.lsl, 10);
    assertEqual(m.usl, 20);
  });

  test('setFields: vertauschte Grenzen schreiben nichts', () => {
    const m = new State(CTX);
    setFields(m, { lsl: 1, usl: 2 });
    let err;
    try { setFields(m, { lsl: 20, usl: 10, k: 5.15 }); } catch (e) { err = e; }
    assertEqual(err?.invariant, 'limitsOrder');
    assertEqual(m.lsl, 1);
    assertEqual(m.usl, 2);
    assertEqual(m.k, 6);
  });

  test('sigmaHist = 0 und alpha = 1 werden abgelehnt', () => {
    const m = new State(CTX);
    assertThrows(() => { m.sigmaHist = 0; });
    assertThrows(() => { m.alpha = 1; });
    assertEqual(m.sigmaHist, null);
    assertEqual(m.alpha, 0.05);
  });
});

suite('MSA Typ 2 Model — Auswahlwerte gegen die Engine', () => {
  const parts = []; const operators = []; const measurements = [];
  for (let p = 1; p <= 5; p++) {
    for (const o of ['A', 'B']) {
      for (let r = 0; r < 3; r++) {
        parts.push(`P${p}`); operators.push(o);
        measurements.push(10 + p * 1.3 + (o === 'A' ? 0 : 0.2) + ((p * 7 + r * 3) % 5) * 0.05);
      }
    }
  }
  const data = { parts, operators, measurements };

  test('K_OPTIONS und VERDICT_BASES sind die Werte des Schemas', () => {
    const { fields } = State.schema;
    assertEqual(fields.k.values.join(','), K_OPTIONS.join(','));
    assertEqual(fields.verdictBasis.values.join(','), VERDICT_BASES.join(','));
    assertEqual(K_OPTIONS.join(','), '6,5.15');
    assertEqual(VERDICT_BASES.join(','), 'auto,tolerance,studyVar');
  });

  test('jedes K kommt als studyVarMultiplier in der Engine an', () => {
    for (const k of K_OPTIONS) {
      assertEqual(analyze(data, { studyVarMultiplier: k }).params.studyVarMultiplier, k);
    }
  });

  test('jede Urteilsgrundlage wird von der Engine angenommen', () => {
    for (const b of VERDICT_BASES) {
      const opts = { verdictBasis: b === 'auto' ? undefined : b, lsl: 5, usl: 25 };
      assertEqual(validate(data, opts).valid, true, b);
      const r = analyze(data, opts);
      assert(['tolerance', 'studyVar'].includes(r.verdictBasis), b);
    }
  });
});

suite('MSA Typ 2 Model — derived analysis', () => {
  const parts = [], ops = [], meas = [];
  for (let i = 0; i < 4; i++) {
    for (const [oi, op] of ['A', 'B'].entries()) {
      for (let r = 0; r < 2; r++) {
        parts.push(`T${i + 1}`); ops.push(op);
        meas.push(10 + i * 0.5 + oi * 0.03 + (r ? 0.02 : -0.01) + ((i * 7 + r * 3 + oi) % 5) * 0.004);
      }
    }
  }
  const cols = { part: parts, op: ops, meas };
  const data = sheetSource(cols);

  test('analysis liest nur über src.read', () => {
    const m = new State(CTX);
    m.part = ref('part'); m.operator = ref('op'); m.measurement = ref('meas');
    assertEqual(evaluateDerived(m, spySource(data)).analysis.mode, 'typ2');
  });

  test('gelöschte Messwertspalte: null wie ohne Spalte', () => {
    const m = new State(CTX);
    m.part = ref('part'); m.measurement = ref('gone');
    assertEqual(evaluateDerived(m, data).analysis, null);
  });

  test('ohne Messwertspalte: null', () => {
    const m = new State(CTX); m.part = ref('part');
    assertEqual(evaluateDerived(m, data).analysis, null);
  });

  test('mit drei Spalten: Typ 2, gleich dem Ergebnis der Engine auf denselben Daten', () => {
    const m = new State(CTX);
    m.part = ref('part'); m.operator = ref('op'); m.measurement = ref('meas');
    const { analysis } = evaluateDerived(m, data);
    assertEqual(analysis.mode, 'typ2');
    assertEqual(analysis.p, 4);
    const opts = { alpha: m.alpha, studyVarMultiplier: m.k, lsl: NaN, usl: NaN };
    const arrays = { parts, operators: ops, measurements: meas };
    assertEqual(JSON.stringify(analysis), JSON.stringify(analyze(arrays, opts)));
  });

  test('ohne Prüferspalte: Typ 3', () => {
    const m = new State(CTX);
    m.part = ref('part'); m.measurement = ref('meas');
    assertEqual(evaluateDerived(m, data).analysis.mode, 'typ3');
  });
});
