import { suite, test, assert, assertEqual, assertThrows } from '../../test-utils.js';
import { State, K_OPTIONS, VERDICT_BASES } from '../../../js/modules/msa-typ2/domain/model.js';
import { analyze, validate } from '../../../js/engines/msa-typ2-engine.js';

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
