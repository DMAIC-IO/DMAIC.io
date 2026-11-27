/**
 * Activity-Flowchart: Model (domain/model.js) — jedes Kommando samt Ablehnung,
 * die sechs Invarianten mit Reparatur und die Ableitung `bands`.
 */
import { suite, test, assert, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/activity-flowchart/domain/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';

const V1 = { version: '1.0' };
const plain = (v) => JSON.parse(JSON.stringify(v));

/** @param {() => any} fn @returns {any} der geworfene Fehler */
function errorOf(fn) {
  try { fn(); } catch (err) { return err; }
  throw new Error('Expected function to throw');
}

/** Stub-Übersetzer mit den Texten der Altform (de). */
const T = (key, p) => ({
  mainPath: 'Hauptpfad', unnamedDecision: '(ohne Frage)', bandLabel: `Nein: ${p?.q}`,
})[key] ?? key;

/** @param {Partial<any>} s */
const act = (s) => ({ title: '', description: '', kind: 'activity', branchId: 'main', decision: null, substeps: [], ...s });
/** @param {Partial<any>} s */
const dec = (s) => ({ title: '', description: '', kind: 'decision', branchId: 'main', decision: { label: '', noTarget: 'end' }, substeps: [], ...s });

/**
 * a, D (Raute, Band: x, y), b — x und y im Band von D.
 * @returns {State}
 */
function chain() {
  return State.fromJSON({
    _schema: V1,
    steps: [
      act({ id: 'a', title: 'A' }),
      dec({ id: 'D', decision: { label: 'Frei?', noTarget: 'a' } }),
      act({ id: 'x', title: 'X', branchId: 'no:D' }),
      act({ id: 'y', title: 'Y', branchId: 'no:D' }),
      act({ id: 'b', title: 'B' }),
    ],
    expanded: ['x'],
  });
}
const ids = (m) => m.steps.map((s) => s.id);
/** Laden mit Reparatur; liefert Model und die reparierten Felder. @param {object} json */
function repaired(json) {
  const fields = [];
  const m = State.fromJSON({ _schema: V1, ...json }, { repair: true, onRepair: (f) => fields.push(f) });
  return { m, fields };
}
const bandOf = (m, id) => m.steps.find((s) => s.id === id).branchId;

suite('Activity-Flowchart Model — Anlegen', () => {
  test('Vorgaben: leer, ohne Inhalt', () => {
    const s = new State();
    assertDeepEqual(plain(s.steps), []);
    assertDeepEqual(plain(s.expanded), []);
    assertEqual(s.hasContent(), false);
  });

  test('addStep ohne Angaben hängt eine Aktivität an den Hauptpfad; id mit Präfix s', () => {
    const s = new State();
    const id = s.addStep({});
    assert(id.startsWith('s'), 'Präfix s');
    assertDeepEqual(plain(s.steps), [{ id, title: '', description: '', kind: 'activity', branchId: 'main', decision: null, substeps: [] }]);
    assertEqual(s.hasContent(), true);
  });

  test('addStep mit kind decision trägt eine leere Frage und endet im Prozessende', () => {
    const s = new State();
    const id = s.addStep({ kind: 'decision' });
    assertDeepEqual(plain(s.steps[0].decision), { label: '', noTarget: 'end' });
    assertEqual(s.steps[0].id, id);
  });

  test('addStep ins Band ohne Index: hinter das letzte Glied des Bands', () => {
    const s = chain();
    const id = s.addStep({ bandId: 'no:D' });
    assertDeepEqual(ids(s), ['a', 'D', 'x', 'y', id, 'b']);
    assertEqual(bandOf(s, id), 'no:D');
  });

  test('addStep in ein leeres Band landet direkt hinter der Raute', () => {
    const s = State.fromJSON({ _schema: V1, steps: [dec({ id: 'D' }), act({ id: 'b' })] });
    const id = s.addStep({ bandId: 'no:D', kind: 'decision' });
    assertDeepEqual(ids(s), ['D', id, 'b']);
    assertEqual(s.steps[1].kind, 'decision');
  });

  test('addStep ins Band überspringt verschachtelte Unterbänder', () => {
    const s = State.fromJSON({ _schema: V1, steps: [
      dec({ id: 'D' }), dec({ id: 'E', branchId: 'no:D' }), act({ id: 'e1', branchId: 'no:E' }), act({ id: 'b' }),
    ] });
    const id = s.addStep({ bandId: 'no:D' });
    assertDeepEqual(ids(s), ['D', 'E', 'e1', id, 'b']);
  });

  test('addStep mit Index setzt an diese Stelle in dieses Band', () => {
    const s = chain();
    const id = s.addStep({ bandId: 'no:D', index: 3 });
    assertDeepEqual(ids(s), ['a', 'D', 'x', id, 'y', 'b']);
    assertEqual(bandOf(s, id), 'no:D');
  });

  test('addStep: unbekanntes Band, falsche Art, Index außerhalb werden abgelehnt', () => {
    const s = chain();
    assertEqual(errorOf(() => s.addStep({ bandId: 'no:a' })).param, 'bandId');
    assertEqual(errorOf(() => s.addStep({ bandId: 'nope' })).param, 'bandId');
    assertEqual(errorOf(() => s.addStep({ kind: 'loop' })).param, 'kind');
    assertEqual(errorOf(() => s.addStep({ index: 6 })).param, 'index');
    assertEqual(s.steps.length, 5);
  });

  test('addStep vor die Raute des Bands wird abgelehnt (A14): index mit bandNotBefore, der Stand bleibt', () => {
    const s = chain();
    for (const at of [0, 1]) {
      const err = errorOf(() => s.addStep({ bandId: 'no:D', index: at }));
      assertEqual(err.param, 'index');
      assertEqual(err.hintKey, 'bandNotBefore');
      assert(!String(err.message).includes('"title"'), 'die Meldung listet nicht die ganze Kette');
    }
    assertDeepEqual(ids(s), ['a', 'D', 'x', 'y', 'b']);
    s.addStep({ bandId: 'no:D', index: 2 });
    assertEqual(s.steps[2].branchId, 'no:D');
  });

  test('appendSteps hängt Aktivitäten an den Hauptpfad und liefert die Anzahl', () => {
    const s = chain();
    assertEqual(s.appendSteps({ steps: [{ title: 'P', description: 'p' }, { title: 'Q', description: '' }] }), 2);
    assertDeepEqual(s.steps.slice(5).map((x) => [x.title, x.description, x.kind, x.branchId, x.decision]),
      [['P', 'p', 'activity', 'main', null], ['Q', '', 'activity', 'main', null]]);
    assertEqual(s.appendSteps({ steps: [] }), 0);
  });
});

suite('Activity-Flowchart Model — Entfernen und Verschieben', () => {
  test('removeStep einer Raute löst ihr Band auf, Ziele auf sie werden end, expanded geräumt', () => {
    const s = State.fromJSON({ _schema: V1, steps: [
      act({ id: 'a' }),
      dec({ id: 'D' }),
      dec({ id: 'E', branchId: 'no:D', decision: { label: '', noTarget: 'end' } }),
      act({ id: 'e1', branchId: 'no:E' }),
      act({ id: 'd1', branchId: 'no:D' }),
      dec({ id: 'F', decision: { label: '', noTarget: 'a' } }),
    ], expanded: ['E', 'a'] });
    s.setDecisionTarget({ stepId: 'E', target: 'd1' });
    s.removeStep({ id: 'D' });
    assertDeepEqual(s.steps.map((x) => [x.id, x.branchId]), [['a', 'main'], ['E', 'main'], ['e1', 'no:E'], ['d1', 'main'], ['F', 'main']]);
    s.removeStep({ id: 'd1' });
    assertEqual(s.steps.find((x) => x.id === 'E').decision.noTarget, 'end');
    s.removeStep({ id: 'E' });
    assertEqual(bandOf(s, 'e1'), 'main');
    assertDeepEqual(plain(s.expanded), ['a']);
    s.removeStep({ id: 'a' });
    assertEqual(s.steps.find((x) => x.id === 'F').decision.noTarget, 'end');
    assertEqual(errorOf(() => s.removeStep({ id: 'zz' })).param, 'id');
  });

  test('moveStep: Aktivität an einen Endindex, Band bleibt', () => {
    const s = chain();
    s.moveStep({ id: 'b', index: 0 });
    assertDeepEqual(ids(s), ['b', 'a', 'D', 'x', 'y']);
  });

  test('moveStep: Raute nimmt ihr Band als Block mit, Bereich 0…n − Block', () => {
    const s = chain();
    s.moveStep({ id: 'D', index: 0 });
    assertDeepEqual(ids(s), ['D', 'x', 'y', 'a', 'b']);
    assertEqual(bandOf(s, 'x'), 'no:D');
    s.moveStep({ id: 'D', index: 2 });
    assertDeepEqual(ids(s), ['a', 'b', 'D', 'x', 'y']);
    assertEqual(errorOf(() => s.moveStep({ id: 'D', index: 3 })).param, 'index');
    assertEqual(errorOf(() => s.moveStep({ id: 'a', index: 5 })).param, 'index');
    assertEqual(errorOf(() => s.moveStep({ id: 'a', index: -1 })).param, 'index');
  });

  test('moveStep: ein verschachteltes Band wandert mit dem ganzen Block', () => {
    const s = State.fromJSON({ _schema: V1, steps: [
      act({ id: 'a' }), dec({ id: 'D' }), dec({ id: 'E', branchId: 'no:D' }), act({ id: 'e1', branchId: 'no:E' }), act({ id: 'b' }),
    ] });
    s.moveStep({ id: 'D', index: 1 });
    assertDeepEqual(ids(s), ['a', 'D', 'E', 'e1', 'b'], 'eigene Stelle: unverändert');
    s.moveStep({ id: 'D', index: 2 });
    assertDeepEqual(ids(s), ['a', 'b', 'D', 'E', 'e1']);
    assertDeepEqual(s.steps.map((x) => x.branchId), ['main', 'main', 'main', 'no:D', 'no:E']);
  });

  test('moveStep: ein Block mit fremdem Schritt dazwischen schließt sich', () => {
    const s = State.fromJSON({ _schema: V1, steps: [
      dec({ id: 'D' }), act({ id: 'x', branchId: 'no:D' }), act({ id: 'm' }), act({ id: 'y', branchId: 'no:D' }),
    ] });
    s.moveStep({ id: 'D', index: 0 });
    assertDeepEqual(ids(s), ['D', 'x', 'y', 'm']);
  });

  test('moveStep: ein Glied vor seine Raute fällt in den Hauptpfad', () => {
    const s = chain();
    s.moveStep({ id: 'y', index: 0 });
    assertDeepEqual(ids(s), ['y', 'a', 'D', 'x', 'b']);
    assertEqual(bandOf(s, 'y'), 'main');
  });

  test('moveSubstep, addSubstep, removeSubstep, setExpanded', () => {
    const s = chain();
    const s1 = s.addSubstep({ stepId: 'a' });
    const s2 = s.addSubstep({ stepId: 'a' });
    assert(s1.startsWith('ss'), 'Präfix ss');
    s.moveSubstep({ stepId: 'a', substepId: s2, index: 0 });
    assertDeepEqual(s.steps[0].substeps.map((x) => x.id), [s2, s1]);
    s.removeSubstep({ stepId: 'a', substepId: s2 });
    assertDeepEqual(s.steps[0].substeps.map((x) => x.id), [s1]);
    assertEqual(errorOf(() => s.removeSubstep({ stepId: 'a', substepId: 'zz' })).param, 'substepId');
    s.setExpanded({ id: 'a', expanded: true });
    assertDeepEqual(plain(s.expanded), ['x', 'a']);
    s.setExpanded({ id: 'x', expanded: false });
    assertDeepEqual(plain(s.expanded), ['a']);
    assertEqual(errorOf(() => s.setExpanded({ id: 'a', expanded: 'ja' })).param, 'expanded');
  });
});

suite('Activity-Flowchart Model — Band und Wiedereinstieg', () => {
  test('setStepBand: Position bleibt, Band wechselt', () => {
    const s = chain();
    s.setStepBand({ stepId: 'b', bandId: 'no:D' });
    assertDeepEqual(ids(s), ['a', 'D', 'x', 'y', 'b']);
    assertEqual(bandOf(s, 'b'), 'no:D');
    s.setStepBand({ stepId: 'x', bandId: 'main' });
    assertEqual(bandOf(s, 'x'), 'main');
  });

  test('setStepBand: Raute hinter dem Schritt → bandNotBefore; unbekanntes Band, Nicht-Raute → bandId', () => {
    const s = chain();
    const late = errorOf(() => s.setStepBand({ stepId: 'a', bandId: 'no:D' }));
    assertEqual(late.param, 'bandId');
    assertEqual(late.hintKey, 'bandNotBefore');
    const self = errorOf(() => s.setStepBand({ stepId: 'D', bandId: 'no:D' }));
    assertEqual(self.hintKey, 'bandNotBefore');
    assertEqual(errorOf(() => s.setStepBand({ stepId: 'b', bandId: 'no:a' })).param, 'bandId');
    assertEqual(errorOf(() => s.setStepBand({ stepId: 'zz', bandId: 'main' })).param, 'stepId');
    assertEqual(bandOf(s, 'a'), 'main');
  });

  test('setDecisionTarget: end oder anderer Schritt im Band der Raute selbst', () => {
    const s = chain();
    s.setDecisionTarget({ stepId: 'D', target: 'b' });
    assertEqual(s.steps[1].decision.noTarget, 'b');
    assertEqual(s.steps[1].decision.label, 'Frei?');
    s.setDecisionTarget({ stepId: 'D', target: 'end' });
    assertEqual(s.steps[1].decision.noTarget, 'end');
  });

  test('setDecisionTarget: Nicht-Raute → stepId (notDecision); fremdes Band, eigene, unbekannte id → target', () => {
    const s = chain();
    const notDec = errorOf(() => s.setDecisionTarget({ stepId: 'a', target: 'end' }));
    assertEqual(notDec.param, 'stepId');
    assertEqual(notDec.hintKey, 'notDecision');
    for (const target of ['x', 'D', 'zz', 'next']) {
      const err = errorOf(() => s.setDecisionTarget({ stepId: 'D', target }));
      assertEqual(err.param, 'target', target);
      assertEqual(err.hintKey, 'targetNotInBand', target);
    }
    assertEqual(s.steps[1].decision.noTarget, 'a');
  });
});

suite('Activity-Flowchart Model — Invarianten', () => {
  test('Texte: sechs Invarianten in Reparaturfolge', () => {
    assertDeepEqual(Object.keys(State.schema.invariants),
      ['uniqueStepIds', 'uniqueSubstepIds', 'decisionShape', 'knownBranch', 'knownNoTarget', 'validExpanded']);
  });

  test('uniqueStepIds / uniqueSubstepIds: spätere Doppel entfallen beim Laden', () => {
    const raw = { steps: [
      act({ id: 'a', title: '1', substeps: [{ id: 'u', title: 'U1' }, { id: 'u', title: 'U2' }] }),
      act({ id: 'a', title: '2' }),
    ] };
    assertEqual(errorOf(() => State.fromJSON({ _schema: V1, ...raw })).invariant, 'uniqueStepIds');
    const { m: s, fields } = repaired(raw);
    assert(fields.length > 0, 'Reparatur gemeldet');
    assertDeepEqual(s.steps.map((x) => x.title), ['1']);
    assertDeepEqual(s.steps[0].substeps.map((x) => x.title), ['U1']);
  });

  test('decisionShape: Aktivität verliert decision, Raute ohne bekommt eine leere', () => {
    const { m: s } = repaired({ steps: [
      act({ id: 'a', decision: { label: 'L', noTarget: 'end' } }),
      dec({ id: 'D', decision: null }),
    ] });
    assertEqual(s.steps[0].decision, null);
    assertDeepEqual(plain(s.steps[1].decision), { label: '', noTarget: 'end' });
  });

  test('knownBranch: Band einer späteren, fehlenden oder Nicht-Raute → Hauptpfad', () => {
    const { m: s } = repaired({ steps: [
      act({ id: 'a', branchId: 'no:D' }), dec({ id: 'D' }), act({ id: 'b', branchId: 'no:zz' }),
      act({ id: 'c', branchId: 'no:a' }), act({ id: 'd', branchId: 'no:D' }),
    ] });
    assertDeepEqual(s.steps.map((x) => x.branchId), ['main', 'main', 'main', 'main', 'no:D']);
  });

  test('knownNoTarget: eigene und unbekannte Ziele → end', () => {
    const { m: s } = repaired({ steps: [
      dec({ id: 'D', decision: { label: '', noTarget: 'D' } }),
      dec({ id: 'E', decision: { label: '', noTarget: 'zz' } }),
      dec({ id: 'F', decision: { label: '', noTarget: 'D' } }),
    ] });
    assertDeepEqual(s.steps.map((x) => x.decision.noTarget), ['end', 'end', 'D']);
  });

  test('validExpanded: unbekannte ids entfallen', () => {
    const s = State.fromJSON({ _schema: V1, steps: [act({ id: 'a' })], expanded: ['a', 'zz'] });
    // Ansichtsfeld: heilt auch beim strengen Laden still.
    assertDeepEqual(plain(s.expanded), ['a']);
  });

  test('instance.set-Weg: setFields mit ungültigem Band, Raute ohne decision oder Fremdziel wird abgelehnt', () => {
    const s = chain();
    const before = plain(s.steps);
    const write = (fn) => errorOf(() => { const steps = plain(s.steps); fn(steps); s.steps = steps; });
    assertEqual(write((st) => { st[0].branchId = 'no:D'; }).invariant, 'knownBranch');
    assertEqual(write((st) => { st[1].decision = null; }).invariant, 'decisionShape');
    assertEqual(write((st) => { st[0].kind = 'decision'; }).invariant, 'decisionShape');
    assertEqual(write((st) => { st[1].decision.noTarget = 'zz'; }).invariant, 'knownNoTarget');
    assertDeepEqual(plain(s.steps), before);
  });
});

suite('Activity-Flowchart Model — derived bands', () => {
  test('Hauptpfad zuerst, je Raute ein Band, tiefenzuerst, Beschriftung übersetzt', () => {
    const s = State.fromJSON({ _schema: V1, steps: [
      dec({ id: 'D', decision: { label: 'Frei?', noTarget: 'end' } }),
      dec({ id: 'E', branchId: 'no:D' }),
      dec({ id: 'F', decision: { label: 'Zweite?', noTarget: 'end' } }),
    ] });
    const { bands } = evaluateDerived(s, null, undefined, T);
    assertDeepEqual(bands, [
      { id: 'main', ownerId: null, label: 'Hauptpfad', depth: 0 },
      { id: 'no:D', ownerId: 'D', label: 'Nein: Frei?', depth: 1 },
      { id: 'no:E', ownerId: 'E', label: 'Nein: (ohne Frage)', depth: 2 },
      { id: 'no:F', ownerId: 'F', label: 'Nein: Zweite?', depth: 1 },
    ]);
  });

  test('ohne Übersetzer meldet bands den Fehler', () => {
    const { bands } = evaluateDerived(chain(), null);
    assert(typeof bands.error === 'string', 'Fehler statt Wert');
  });
});
