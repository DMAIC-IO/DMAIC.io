/**
 * Tests for modules/pairwise-comparison/domain/model.js — Schema und
 * Vorgaben, gespeicherter Stand '1.0', Versionsprüfung, die Invariante
 * `reachablePhase` (streng, mit Reparatur, beim Schreiben), alle Kommandos
 * samt Ablehnungen (`param`, `hintKey`), jede Änderung der Kriterien leert den
 * Lauf und zeigt die Eingabe, `hasContent`, die Ableitung `result`, die
 * Lesefläche und der Agentenkatalog. Dazu die Fälle der alten Suite.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../../test-utils.js';
import { State, MAX_CRITERIA, MIN_CRITERIA } from '../../../js/modules/pairwise-comparison/domain/model.js';
import { setModelName } from '../../../js/core/model.js';
import { loadModel } from '../../../js/core/initial-model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { schemaAgentEntry, readSchemaModel } from '../../../js/core/agent/agent-schema.js';

setModelName(State, 'pairwise-comparison');

const SCHEMA = { _schema: { name: 'pairwise-comparison', version: '1.0' } };
const EMPTY = { ...SCHEMA, criteria: [], matrix: [], pairs: [], currentPair: 0, viewPhase: 'input' };
const LEGACY = {
  ...SCHEMA,
  criteria: ['Kosten', 'Prüfaufwand; Stufe "B"', 'Lieferzeit', 'Service'],
  matrix: [[0, 1, 0.5, 1], [0, 0, 0, 1], [0.5, 1, 0, 0], [0, 0, 1, 0]],
  pairs: [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]],
  currentPair: 6,
  viewPhase: 'results',
};
const COMPARE = {
  ...LEGACY,
  matrix: [[0, 1, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 1, 0]],
  currentPair: 2,
  viewPhase: 'compare',
};

const plain = (v) => JSON.parse(JSON.stringify(v));
const json = (v) => JSON.stringify(v);
/** @param {object} m @returns {any} */
const result = (m) => evaluateDerived(m, /** @type {any} */ (undefined), ['result']).result;
/** @param {object} j @returns {any} */
const load = (j) => State.fromJSON(plain(j));

/** @param {() => any} fn @returns {any} der geworfene Fehler oder null */
function thrown(fn) {
  try { fn(); } catch (e) { return e; }
  return null;
}

/** Laden mit Reparatur; meldet die reparierten Felder. @param {object} j */
function repaired(j) {
  const fields = [];
  const m = State.fromJSON(j, { repair: true, onRepair: (f) => fields.push(f) });
  return { m, fields };
}

/** Ein Model mit den Kriterien. @param {string[]} names @returns {any} */
function withCriteria(names) {
  const m = new State();
  for (const text of names) m.addCriterion({ text });
  return m;
}

/** Ein laufender Vergleich mit drei Kriterien und fester Paarfolge. @returns {any} */
function running() {
  return load({ ...SCHEMA, criteria: ['A', 'B', 'C'], matrix: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], pairs: [[0, 1], [0, 2], [1, 2]], currentPair: 0, viewPhase: 'compare' });
}

/** Erwartet eine Ablehnung mit `param` (und `hintKey`), Stand unverändert. */
function expectRejected(m, fn, param, hintKey) {
  const before = json(m.toJSON());
  const err = thrown(fn);
  assertTrue(err instanceof Error, 'keine Ablehnung');
  assertEqual(err.param, param, err.message);
  if (hintKey !== undefined) assertEqual(err.hintKey, hintKey);
  assertEqual(json(m.toJSON()), before, 'Stand verändert');
  return err;
}

suite('pairwise-comparison Model — Schema und Vorgaben', () => {
  test('vier Felder, ein Ansichtsfeld, sieben Kommandos, eine Invariante, eine Ableitung', () => {
    assertDeepEqual(Object.keys(State.schema.fields), ['criteria', 'matrix', 'pairs', 'currentPair']);
    assertDeepEqual(Object.keys(State.schema.view), ['viewPhase']);
    assertDeepEqual(Object.keys(State.schema.commands), [
      'addCriterion', 'removeCriterion', 'startComparison', 'chooseLeft', 'chooseRight', 'tieCurrent', 'cycleCell',
    ]);
    assertDeepEqual(Object.keys(State.schema.invariants), ['reachablePhase']);
    assertDeepEqual(Object.keys(State.schema.derived), ['result']);
  });
  test('Vorgaben wie die Altform', () => {
    assertEqual(json(new State().toJSON()), json(EMPTY));
  });
  test('Konstanten', () => {
    assertEqual(MAX_CRITERIA, 15);
    assertEqual(MIN_CRITERIA, 3);
  });
});

suite('pairwise-comparison Model — gespeicherter Stand 1.0', () => {
  test('lädt streng und ohne Reparatur, toJSON zeichengleich', () => {
    for (const j of [LEGACY, COMPARE, EMPTY]) {
      assertEqual(thrown(() => load(j)), null);
      const { m, fields } = repaired(plain(j));
      assertDeepEqual(fields, []);
      assertEqual(json(m.toJSON()), json(j));
    }
  });
  test('Laden wie beim Einhängen ergibt denselben Stand', () => {
    assertEqual(json(loadModel(State, plain(LEGACY)).toJSON()), json(LEGACY));
  });
  test('Rundweg toJSON → fromJSON ist verlustfrei', () => {
    for (const j of [LEGACY, COMPARE, EMPTY]) assertEqual(json(load(load(j).toJSON()).toJSON()), json(j));
  });
  test('1.0 läuft ohne Migrationsschritt: eine Nichtzahl in der Matrix ist ungültig', () => {
    assertTrue(thrown(() => load({ ...LEGACY, matrix: [[0, 'x']] })) instanceof Error);
  });
  test('AHP-Matrix lädt wörtlich (nicht strenger als die Altform)', () => {
    const m = load({ ...LEGACY, matrix: [[1, 3, 5, 0.33], [0.33, 1, 3, 0.2], [0.2, 0.33, 1, 0.14], [3, 5, 7, 1]] });
    assertEqual(m.matrix[0][3], 0.33);
  });
});

suite('pairwise-comparison Model — Versionsprüfung', () => {
  test('höhere Version 2.0 wird abgewiesen, auch mit Reparatur und beim Einhängen', () => {
    const v2 = { ...plain(LEGACY), _schema: { name: 'pairwise-comparison', version: '2.0' } };
    assertThrows(() => State.fromJSON(v2), /_schema\.version/);
    assertThrows(() => State.fromJSON(v2, { repair: true }), /_schema\.version/);
    assertThrows(() => loadModel(State, v2), /_schema\.version/);
  });
  test('unlesbare Version wird abgewiesen', () => {
    assertThrows(() => State.fromJSON({ ...plain(LEGACY), _schema: { version: 'x' } }), /_schema\.version/);
  });
});

suite('pairwise-comparison Model — Invariante reachablePhase', () => {
  const cases = [
    ['compare ohne Paare', { ...EMPTY, criteria: ['A'], viewPhase: 'compare' }],
    ['results ohne Paare', { ...EMPTY, viewPhase: 'results' }],
    ['compare nach dem letzten Paar', { ...LEGACY, viewPhase: 'compare' }],
    ['results im laufenden Vergleich', { ...COMPARE, viewPhase: 'results' }],
  ];
  for (const [name, j] of cases) {
    test(`${name}: streng abgelehnt, mit Reparatur auf input, der Lauf bleibt`, () => {
      const err = thrown(() => load(j));
      assertTrue(err instanceof Error);
      assertEqual(err.invariant, 'reachablePhase');
      const { m, fields } = repaired(plain(j));
      assertTrue(fields.includes('viewPhase'));
      assertEqual(m.viewPhase, 'input');
      assertEqual(json(m.pairs), json(j.pairs));
      assertEqual(json(m.matrix), json(j.matrix));
      assertEqual(m.currentPair, j.currentPair);
    });
  }
  test('input ist immer erreichbar', () => {
    for (const j of [LEGACY, COMPARE, EMPTY]) assertEqual(thrown(() => load({ ...j, viewPhase: 'input' })), null);
  });
  test('Schreiben des Reiters: erreichbar ja, unerreichbar abgelehnt', () => {
    const m = load(LEGACY);
    m.viewPhase = 'input';
    m.viewPhase = 'results';
    assertEqual(m.viewPhase, 'results');
    const err = thrown(() => { m.viewPhase = 'compare'; });
    assertEqual(err?.invariant, 'reachablePhase');
    assertEqual(m.viewPhase, 'results');
  });
  test('Schreiben von currentPair über das Ende im Vergleich: abgelehnt', () => {
    const m = running();
    assertTrue(thrown(() => { m.currentPair = 3; }) instanceof Error);
    assertEqual(m.currentPair, 0);
  });
});

suite('pairwise-comparison Model — addCriterion', () => {
  test('trimmt und liefert die neue Nummer', () => {
    const m = new State();
    assertEqual(m.addCriterion({ text: '  Quality  ' }), 0);
    assertEqual(m.addCriterion({ text: 'Cost' }), 1);
    assertDeepEqual(plain(m.criteria), ['Quality', 'Cost']);
  });
  test('leer bzw. nur Leerzeichen: Ablehnung param text', () => {
    const m = new State();
    expectRejected(m, () => m.addCriterion({ text: '   ' }), 'text');
    expectRejected(m, () => m.addCriterion({ text: '' }), 'text');
  });
  test('Doppelung: Ablehnung param text mit hintKey duplicateWarning (auch nach Trimmen)', () => {
    const m = withCriteria(['A']);
    expectRejected(m, () => m.addCriterion({ text: 'A' }), 'text', 'duplicateWarning');
    expectRejected(m, () => m.addCriterion({ text: ' A ' }), 'text', 'duplicateWarning');
  });
  test('ab 15: Ablehnung param text mit hintKey maxReached', () => {
    const m = withCriteria(Array.from({ length: MAX_CRITERIA }, (_, i) => `C${i}`));
    assertEqual(m.criteria.length, 15);
    const err = expectRejected(m, () => m.addCriterion({ text: 'overflow' }), 'text', 'maxReached');
    assertTrue(err.message.includes('15'));
  });
  test('Doppelung geht vor der Obergrenze (wie die Altform)', () => {
    const m = withCriteria(Array.from({ length: MAX_CRITERIA }, (_, i) => `C${i}`));
    expectRejected(m, () => m.addCriterion({ text: 'C0' }), 'text', 'duplicateWarning');
  });
  test('im laufenden Vergleich: leert Matrix, Paare, Fortschritt und zeigt die Eingabe (T1)', () => {
    const m = running();
    m.chooseLeft({});
    m.addCriterion({ text: 'D' });
    assertEqual(json(m.toJSON()), json({ ...EMPTY, criteria: ['A', 'B', 'C', 'D'] }));
  });
  test('im abgeschlossenen Vergleich ebenso', () => {
    const m = load(LEGACY);
    m.addCriterion({ text: 'Neu' });
    assertEqual(m.viewPhase, 'input');
    assertEqual(m.pairs.length, 0);
  });
});

suite('pairwise-comparison Model — removeCriterion', () => {
  test('entfernt nach Nummer', () => {
    const m = withCriteria(['A', 'B', 'C']);
    m.removeCriterion({ i: 1 });
    assertDeepEqual(plain(m.criteria), ['A', 'C']);
  });
  test('fremde Nummer: Ablehnung param i', () => {
    const m = withCriteria(['A', 'B']);
    const err = expectRejected(m, () => m.removeCriterion({ i: 2 }), 'i');
    assertTrue(err.message.includes('allowed: 0..1'));
    expectRejected(m, () => m.removeCriterion({ i: -1 }), 'i');
    expectRejected(m, () => m.removeCriterion({ i: 0.5 }), 'i');
    expectRejected(new State(), () => new State().removeCriterion({ i: 0 }), 'i');
  });
  test('im Vergleich: leert den Lauf und zeigt die Eingabe (T1)', () => {
    const m = load(COMPARE);
    m.removeCriterion({ i: 0 });
    assertEqual(json(m.toJSON()), json({ ...EMPTY, criteria: ['Prüfaufwand; Stufe "B"', 'Lieferzeit', 'Service'] }));
  });
});

suite('pairwise-comparison Model — startComparison', () => {
  test('unter drei Kriterien: Ablehnung, Stand unverändert', () => {
    const m = withCriteria(['A', 'B']);
    expectRejected(m, () => m.startComparison({}), 'command');
  });
  test('baut Nullmatrix und alle Paare, zeigt den Vergleich', () => {
    const m = withCriteria(['A', 'B', 'C', 'D']);
    m.startComparison({});
    assertEqual(json(m.matrix), json([[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]));
    assertEqual(m.pairs.length, 6);
    assertEqual(new Set(m.pairs.map(([a, b]) => `${a}:${b}`)).size, 6);
    assertEqual(m.currentPair, 0);
    assertEqual(m.viewPhase, 'compare');
  });
  test('ein neuer Start im abgeschlossenen Lauf beginnt von vorn', () => {
    const m = load(LEGACY);
    m.startComparison({});
    assertEqual(m.currentPair, 0);
    assertEqual(m.viewPhase, 'compare');
    assertTrue(m.matrix.every((row) => row.every((v) => v === 0)));
  });
});

suite('pairwise-comparison Model — Entscheidungen', () => {
  test('chooseLeft: erstes Kriterium gewinnt, Fortschritt +1', () => {
    const m = running();
    m.chooseLeft({});
    assertEqual(m.matrix[0][1], 1);
    assertEqual(m.matrix[1][0], 0);
    assertEqual(m.currentPair, 1);
    assertEqual(m.viewPhase, 'compare');
  });
  test('chooseRight: zweites Kriterium gewinnt', () => {
    const m = running();
    m.chooseRight({});
    assertEqual(m.matrix[1][0], 1);
    assertEqual(m.matrix[0][1], 0);
  });
  test('tieCurrent: je 0.5', () => {
    const m = running();
    m.tieCurrent({});
    assertEqual(m.matrix[0][1], 0.5);
    assertEqual(m.matrix[1][0], 0.5);
  });
  test('das letzte Paar zeigt das Ergebnis', () => {
    const m = running();
    m.chooseLeft({}); m.chooseLeft({});
    assertEqual(m.viewPhase, 'compare');
    m.chooseLeft({});
    assertEqual(m.currentPair, 3);
    assertEqual(m.viewPhase, 'results');
  });
  test('ohne laufenden Vergleich: Ablehnung (vor dem Start und nach dem letzten Paar)', () => {
    for (const m of [new State(), withCriteria(['A', 'B', 'C']), load(LEGACY)]) {
      for (const name of ['chooseLeft', 'chooseRight', 'tieCurrent']) expectRejected(m, () => m[name]({}), 'command');
    }
  });
  test('Altprojekt im Vergleich: Paar 3 ist [0, 2], Gleichstand setzt beide Zellen', () => {
    const m = load(COMPARE);
    m.tieCurrent({});
    assertEqual(m.matrix[0][2], 0.5);
    assertEqual(m.matrix[2][0], 0.5);
    assertEqual(m.currentPair, 3);
  });
});

suite('pairwise-comparison Model — cycleCell', () => {
  test('0 → 0.5 → 1 → 0, die Gegenzelle spiegelt', () => {
    const m = load(LEGACY);
    // (1,0) ist 0
    m.cycleCell({ i: 1, j: 0 });
    assertEqual(m.matrix[1][0], 0.5); assertEqual(m.matrix[0][1], 0.5);
    m.cycleCell({ i: 1, j: 0 });
    assertEqual(m.matrix[1][0], 1); assertEqual(m.matrix[0][1], 0);
    m.cycleCell({ i: 1, j: 0 });
    assertEqual(m.matrix[1][0], 0); assertEqual(m.matrix[0][1], 1);
  });
  test('ein AHP-Wert geht auf 0, die Gegenzelle auf 1', () => {
    const m = load({ ...LEGACY, matrix: [[1, 3, 5, 0.33], [0.33, 1, 3, 0.2], [0.2, 0.33, 1, 0.14], [3, 5, 7, 1]] });
    m.cycleCell({ i: 0, j: 1 });
    assertEqual(m.matrix[0][1], 0);
    assertEqual(m.matrix[1][0], 1);
  });
  test('Diagonale: Ablehnung param j', () => {
    const m = load(LEGACY);
    expectRejected(m, () => m.cycleCell({ i: 2, j: 2 }), 'j');
  });
  test('fremde Nummer: Ablehnung param i bzw. j', () => {
    const m = load(LEGACY);
    const err = expectRejected(m, () => m.cycleCell({ i: 4, j: 0 }), 'i');
    assertTrue(err.message.includes('allowed: 0..3'));
    expectRejected(m, () => m.cycleCell({ i: 0, j: 4 }), 'j');
  });
  test('leere Matrix (kein Lauf): Ablehnung', () => {
    const m = withCriteria(['A', 'B', 'C']);
    expectRejected(m, () => m.cycleCell({ i: 1, j: 0 }), 'command');
  });
  test('Summen und Rangfolge folgen', () => {
    const m = load(LEGACY);
    m.cycleCell({ i: 3, j: 0 }); // 0 → 0.5: Service +0.5, Kosten −0.5
    assertDeepEqual(result(m).scores, [2, 1, 1.5, 1.5]);
    assertDeepEqual(result(m).ranking.map((r) => r.idx), [0, 2, 3, 1]);
  });
});

suite('pairwise-comparison Model — hasContent', () => {
  test('leer: nein; ein Kriterium: ja; ohne Lauf ebenso', () => {
    assertEqual(new State().hasContent(), false);
    assertEqual(withCriteria(['A']).hasContent(), true);
    assertEqual(load(LEGACY).hasContent(), true);
  });
});

suite('pairwise-comparison Model — Ableitung result', () => {
  test('null ohne Lauf und im laufenden Vergleich', () => {
    assertEqual(result(new State()), null);
    assertEqual(result(withCriteria(['A', 'B', 'C'])), null);
    assertEqual(result(load(COMPARE)), null);
  });
  test('abgeschlossen: Punkte, Höchstwert, Rangfolge mit stabilem Gleichstand', () => {
    assertEqual(json(result(load(LEGACY))), json({
      scores: [2.5, 1, 1.5, 1],
      maxScore: 2.5,
      ranking: [
        { name: 'Kosten', score: 2.5, idx: 0 },
        { name: 'Lieferzeit', score: 1.5, idx: 2 },
        { name: 'Prüfaufwand; Stufe "B"', score: 1, idx: 1 },
        { name: 'Service', score: 1, idx: 3 },
      ],
    }));
  });
  test('alle gleichwertig: je 1, Rangfolge in Eingabereihenfolge', () => {
    const m = running();
    m.tieCurrent({}); m.tieCurrent({}); m.tieCurrent({});
    const r = result(m);
    assertDeepEqual(r.scores, [1, 1, 1]);
    assertDeepEqual(r.ranking.map((x) => x.idx), [0, 1, 2]);
  });
  test('alles verloren: Höchstwert 0', () => {
    const m = load({ ...LEGACY, matrix: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]] });
    assertEqual(result(m).maxScore, 0);
  });
  test('eine zu kurze Matrixzeile ergibt null statt NaN', () => {
    const m = load({ ...LEGACY, matrix: [[0, 1], [0, 0, 0, 1], [0.5, 1, 0, 0], [0, 0, 1, 0]] });
    assertEqual(result(m).scores[0], null);
  });
});

suite('pairwise-comparison Model — Lesefläche und Agentenkatalog', () => {
  const entry = schemaAgentEntry(State);
  /** @param {object} m @param {object} [options] */
  const read = (m, options) => readSchemaModel(entry, m, options, evaluateDerived(m, /** @type {any} */ (undefined)));

  test('read() ohne Parameter: genau criteria, matrix, pairs, currentPair, result (ohne viewPhase)', () => {
    const out = read(load(LEGACY));
    assertDeepEqual(Object.keys(out), ['criteria', 'matrix', 'pairs', 'currentPair', 'result']);
    assertEqual(json(out.criteria), json(LEGACY.criteria));
    assertEqual(json(out.matrix), json(LEGACY.matrix));
    assertEqual(json(out.pairs), json(LEGACY.pairs));
    assertEqual(out.currentPair, 6);
    assertEqual(json(out.result), json(result(load(LEGACY))));
  });
  test('Katalog: read und die sieben Kommandos mit Objekt-Argumenten, kein setViewPhase/backToInput', () => {
    assertDeepEqual(Object.keys(entry.actions), [
      'read', 'addCriterion', 'removeCriterion', 'startComparison', 'chooseLeft', 'chooseRight', 'tieCurrent', 'cycleCell',
    ]);
    assertDeepEqual(Object.keys(entry.actions.addCriterion.keys), ['text']);
    assertDeepEqual(Object.keys(entry.actions.removeCriterion.keys), ['i']);
    assertDeepEqual(Object.keys(entry.actions.cycleCell.keys), ['i', 'j']);
    for (const name of ['startComparison', 'chooseLeft', 'chooseRight', 'tieCurrent']) {
      assertDeepEqual(Object.keys(entry.actions[name].keys ?? {}), [], name);
    }
  });
  test('instance.set: kein Feld (alle vier nur über Kommandos); result ist abgeleitet', () => {
    assertDeepEqual(entry.settable, []);
    assertDeepEqual(entry.invariants, ['reachablePhase']);
    assertEqual(entry.fields.result.derived, true);
  });
});
