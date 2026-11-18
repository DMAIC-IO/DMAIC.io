import { suite, test, assert, assertEqual, assertThrows } from '../../test-utils.js';
import {
  State, TYPE_OPTIONS, WEIGHTS_OPTIONS, RULESET_OPTIONS, LAYOUT_OPTIONS, ALPHA_OPTIONS,
} from '../../../js/modules/msa-typ5/domain/model.js';
import { analyze } from '../../../js/engines/msa-typ5-engine.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { sheetSource, spySource } from '../../helpers/sheet-source.js';

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

  // 6 Teile × 2 Prüfer × 2 Wiederholungen über drei geordnete Stufen.
  const LEVELS = ['a', 'b', 'c'];
  const rows = [];
  for (let p = 1; p <= 6; p++) for (const a of ['A', 'B']) for (let r = 0; r < 2; r++) {
    rows.push({ part: `P${p}`, appraiser: a, value: LEVELS[(p + (a === 'B' ? 1 : 0) + r) % 3], rep: r + 1 });
  }

  /**
   * Engine-Aufruf in der Form des Viewmodels.
   * @param {string} type @param {object} params @returns {any}
   */
  const run = (type, params) => analyze({
    type, levels: LEVELS, ratings: rows.map((x) => ({ ...x })), references: null, params,
  });

  /** @param {any} r @param {string} label */
  const assertResult = (r, label) => {
    assertEqual(r?.meta?.errors?.length ?? 0, 0, `${label}: ${JSON.stringify(r?.meta?.errors)}`);
    assert(Boolean(r?.verdict), `${label}: Urteil`);
  };

  test('jeder type wird von der Engine angenommen', () => {
    for (const type of TYPE_OPTIONS) {
      assertResult(run(type, { weights: 'quadratic', ruleSet: 'aiag', alpha: 0.05 }), type);
    }
  });

  test('jedes weights, ruleSet und alpha wird von der Engine angenommen und wirkt', () => {
    const pairKappa = (r) => Object.values(r.betweenAppraisers.pairwiseCohenKappa)[0].kappa;
    const unweighted = pairKappa(run('nominal', { ruleSet: 'aiag', alpha: 0.05 }));
    for (const weights of WEIGHTS_OPTIONS) for (const ruleSet of RULESET_OPTIONS) for (const alpha of ALPHA_OPTIONS) {
      const label = `${weights}/${ruleSet}/${alpha}`;
      const r = run('ordinal', { weights, ruleSet, alpha });
      assertResult(r, label);
      assertEqual(r.verdict.ruleSet, ruleSet, label);
      assert(pairKappa(r) !== unweighted, `${label}: Gewichtung wirkt`);
    }
  });
});

suite('MSA Typ 5 Model — derived levels und analysis', () => {
  const part = [], appraiser = [], rating = [];
  for (let p = 1; p <= 6; p++) {
    for (const a of ['A', 'B']) {
      for (let t = 0; t < 2; t++) {
        part.push(`T${p}`); appraiser.push(a);
        rating.push((p + (a === 'B' ? t : 0)) % 3 === 0 ? 'nok' : 'ok');
      }
    }
  }
  const cols = { part, appraiser, rating };
  const data = sheetSource(cols);
  const model = () => {
    const m = new State(CTX);
    m.part = ref('part'); m.appraiser = ref('appraiser'); m.rating = ref('rating');
    return m;
  };

  test('levels und analysis lesen nur über src.read/src.list', () => {
    const d = evaluateDerived(model(), spySource(data));
    assertEqual(d.levels.all.length, 2);
    assertEqual(d.analysis.meta.parts, 6);
  });

  test('breit: gelöschte Bewertungsspalte zählt nicht mit, Reihenfolge folgt dem Blatt', () => {
    const wide = { part: ['T1', 'T2', 'T3'], b2: ['ok', 'nok', 'ok'], a1: ['ok', 'ok', 'ok'], a2: ['ok', 'nok', 'ok'], b1: ['ok', 'nok', 'ok'] };
    const src = spySource(sheetSource(wide));
    const build = (order) => {
      const m = new State(CTX);
      m.layout = 'wide'; m.trials = 2; m.part = ref('part');
      m.ratings = order.map(ref);
      return evaluateDerived(m, src).analysis;
    };
    const live = build(['b1', 'a2', 'gone', 'a1', 'b2']);
    assertEqual(live.meta.appraisers, 2);
    assertEqual(JSON.stringify(live), JSON.stringify(build(['b2', 'a1', 'a2', 'b1'])));
  });

  test('ohne Bewertungsspalte: keine Stufen, keine Analyse', () => {
    const d = evaluateDerived(new State(CTX), data);
    assertEqual(d.levels.all.length, 0);
    assertEqual(d.analysis, null);
  });

  test('mit Spalten: feste Stufen, Fleiss-κ 0,25 und Urteil „unacceptable“', () => {
    const d = evaluateDerived(model(), data);
    assertEqual(JSON.stringify(d.levels), JSON.stringify({ all: ['nok', 'ok'], positive: 'ok', negative: 'nok' }));
    assertEqual(d.analysis.meta.parts, 6);
    assertEqual(d.analysis.meta.appraisers, 2);
    assert(Math.abs(d.analysis.betweenAppraisers.fleissKappa.kappa - 0.25) < 1e-9, 'κ = 0,25');
    assertEqual(d.analysis.overall.betweenAppraisers.rate.toFixed(4), '0.3333');
    assertEqual(d.analysis.verdict.level, 'unacceptable');
  });
});
