import { suite, test, assert, assertEqual, assertThrows } from '../../test-utils.js';
import {
  State, TYPE_OPTIONS, WEIGHTS_OPTIONS, RULESET_OPTIONS, LAYOUT_OPTIONS, ALPHA_OPTIONS,
} from '../../../js/modules/msa-typ5/domain/model.js';
import { analyze } from '../../../js/engines/msa-typ5-engine.js';

const CTX = { cycle: 'dmaic', confidenceLevel: 95, power: 90 };
const ref = (col) => ({ instanceId: 'ws1', sheetId: 's1', columnId: col });

suite('MSA Typ 5 Model — Vorgaben', () => {
  test('Vorgaben und kein Inhalt', () => {
    const m = new State(CTX);
    assertEqual(m.type, 'binary');
    assertEqual(m.weights, 'quadratic');
    assertEqual(m.alpha, 0.05);
    assertEqual(m.ruleSet, 'aiag');
    assertEqual(m.layout, 'long');
    assertEqual(m.trials, 2);
    for (const f of ['part', 'appraiser', 'rating', 'reference', 'replicate', 'positiveLevel', 'exampleWorksheetId']) {
      assertEqual(m[f], null, f);
    }
    assertEqual(m.ratings.length, 0);
    assertEqual(m.hasContent(), false);
  });

  test('hasContent: Spalte, Bewertungsspalten oder positive Stufe', () => {
    const a = new State(CTX); a.part = ref('p');
    assertEqual(a.hasContent(), true);
    const b = new State(CTX); b.ratings = [ref('r1')];
    assertEqual(b.hasContent(), true);
    const c = new State(CTX); c.positiveLevel = 'ok';
    assertEqual(c.hasContent(), true);
    const d = new State(CTX); d.type = 'ordinal';
    assertEqual(d.hasContent(), false);
  });
});

suite('MSA Typ 5 Model — Feldbereiche', () => {
  test('trials 0 und 1,5 werden abgelehnt', () => {
    const m = new State(CTX);
    assertThrows(() => { m.trials = 0; });
    assertThrows(() => { m.trials = 1.5; });
    assertEqual(m.trials, 2);
    m.trials = 3;
    assertEqual(m.trials, 3);
  });

  test('alpha 0,02 wird abgelehnt', () => {
    const m = new State(CTX);
    assertThrows(() => { m.alpha = 0.02; });
    assertEqual(m.alpha, 0.05);
  });
});

suite('MSA Typ 5 Model — uniqueRatings', () => {
  test('derselbe Bezug zweimal wirft mit uniqueRatings', () => {
    const m = new State(CTX);
    let err;
    try { m.ratings = [ref('a'), ref('a')]; } catch (e) { err = e; }
    assertEqual(err?.invariant, 'uniqueRatings');
    assertEqual(m.ratings.length, 0);
  });

  test('Laden mit repair behält das erste Vorkommen', () => {
    const reports = [];
    const m = State.fromJSON(
      { _schema: { version: '1.0' }, ratings: [ref('a'), ref('b'), ref('a')] },
      { repair: true, onRepair: (n) => reports.push(n), context: CTX },
    );
    assertEqual(m.ratings.map((r) => r.columnId).join(','), 'a,b');
    assert(reports.length > 0, 'onRepair gemeldet');
  });
});

suite('MSA Typ 5 Model — Auswahlwerte gegen Schema und Engine', () => {
  test('Konstanten sind die Werte des Schemas', () => {
    const { fields } = State.schema;
    assertEqual(fields.type.values.join(','), TYPE_OPTIONS.join(','));
    assertEqual(fields.weights.values.join(','), WEIGHTS_OPTIONS.join(','));
    assertEqual(fields.ruleSet.values.join(','), RULESET_OPTIONS.join(','));
    assertEqual(fields.layout.values.join(','), LAYOUT_OPTIONS.join(','));
    assertEqual(fields.alpha.values.join(','), ALPHA_OPTIONS.join(','));
    assertEqual(ALPHA_OPTIONS.join(','), '0.01,0.05,0.1');
  });

  const rows = [];
  for (let p = 1; p <= 6; p++) for (const a of ['A', 'B']) for (let r = 0; r < 2; r++) {
    rows.push({ part: `P${p}`, appraiser: a, rating: (p + (a === 'B' ? 1 : 0) + r) % 3 === 0 ? 'x' : 'y', reference: undefined });
  }

  test('jeder type wird von der Engine angenommen', () => {
    for (const type of TYPE_OPTIONS) {
      const levels = type === 'ordinal' ? ['x', 'y'] : ['x', 'y'];
      const r = analyze({ type, ratings: rows.map((x) => ({ ...x })), levels }, { weights: 'quadratic', alpha: 0.05 });
      assert(r && !r.error, type);
    }
  });

  test('jedes weights und jedes ruleSet wird von der Engine angenommen', () => {
    for (const weights of WEIGHTS_OPTIONS) for (const ruleSet of RULESET_OPTIONS) {
      const r = analyze({ type: 'ordinal', ratings: rows.map((x) => ({ ...x })), levels: ['x', 'y'] }, { weights, alpha: 0.05, ruleSet });
      assert(r && !r.error, `${weights}/${ruleSet}`);
    }
  });
});
