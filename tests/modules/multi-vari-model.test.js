/**
 * D.Mike — Multi-Vari model tests.
 *
 * Pure state: column refs, the ordered factor list and the display flags.
 * The factor ORDER is meaning, not decoration — it decides the layout and the
 * nesting at once — so reordering and its round trip are tested here.
 */

import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import { State } from '../../js/modules/multi-vari/multi-vari-model.js';

/** A column ref with a recognisable column id. */
function ref(col) {
  return { instanceId: 'ws1', sheetId: 's1', columnId: col };
}

/** A state with a measurement and `count` assigned factors. */
function filled(count) {
  const s = new State();
  s.columnRefs.measurement = ref('y');
  while (s.factors.length < count) s.addFactor();
  s.factors.forEach((f, i) => { f.ref = ref(`f${i}`); });
  return s;
}

suite('Multi-Vari model — defaults', () => {
  test('starts with two empty factor rows', () => {
    const s = new State();
    assertEqual(s.factors.length, 2);
    assertEqual(s.factors[0].ref, null);
    assertTrue(s.factors[0].id !== s.factors[1].id, 'factor rows carry distinct ids');
  });

  test('defaults to a nested model with the ANOVA estimator', () => {
    const s = new State();
    assertEqual(s.modelForm, 'nested');
    assertEqual(s.estimator, 'anova');
  });

  test('all four display options start switched on', () => {
    const s = new State();
    assertDeepEqual(
      [s.showPoints, s.connectMeans, s.showGroupMean, s.showRefLine],
      [true, true, true, true],
    );
  });
});

suite('Multi-Vari model — factor list', () => {
  test('hasContent needs a measurement and two assigned factors', () => {
    const s = new State();
    assertEqual(s.hasContent(), false);
    s.columnRefs.measurement = ref('y');
    assertEqual(s.hasContent(), false);
    s.factors[0].ref = ref('a');
    assertEqual(s.hasContent(), false);
    s.factors[1].ref = ref('b');
    assertEqual(s.hasContent(), true);
  });

  test('selectedFactors skips unassigned rows and keeps the order', () => {
    const s = filled(3);
    s.factors[1].ref = null;
    assertDeepEqual(s.selectedFactors().map(f => f.ref.columnId), ['f0', 'f2']);
  });

  test('addFactor stops at four rows', () => {
    const s = new State();
    s.addFactor(); s.addFactor(); s.addFactor();
    assertEqual(s.factors.length, 4);
  });

  test('removeFactor keeps at least two rows', () => {
    const s = filled(3);
    const id = s.factors[1].id;
    s.removeFactor(id);
    assertDeepEqual(s.factors.map(f => f.ref.columnId), ['f0', 'f2']);
    s.removeFactor(s.factors[0].id);
    assertEqual(s.factors.length, 2);
  });

  test('moveFactorBefore reorders by id', () => {
    const s = filled(3);
    const [a, b, c] = s.factors.map(f => f.id);
    s.moveFactorBefore(c, a);
    assertDeepEqual(s.factors.map(f => f.id), [c, a, b]);
  });

  test('moveFactorBefore ignores a move onto itself or onto an unknown id', () => {
    const s = filled(3);
    const before = s.factors.map(f => f.id);
    s.moveFactorBefore(before[0], before[0]);
    s.moveFactorBefore(before[0], 'nope');
    assertDeepEqual(s.factors.map(f => f.id), before);
  });

  test('setFactorRef assigns by id', () => {
    const s = new State();
    s.setFactorRef(s.factors[1].id, ref('z'));
    assertEqual(s.factors[1].ref.columnId, 'z');
  });
});

suite('Multi-Vari model — serialization', () => {
  test('round trips refs, order, model form, estimator and flags', () => {
    const s = filled(4);
    s.modelForm = 'crossed';
    s.estimator = 'reml';
    s.showPoints = false;
    s.exampleWorksheetId = 'ws-example';

    const back = State.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
    assertDeepEqual(back.factors.map(f => f.ref.columnId), ['f0', 'f1', 'f2', 'f3']);
    assertEqual(back.modelForm, 'crossed');
    assertEqual(back.estimator, 'reml');
    assertEqual(back.showPoints, false);
    assertEqual(back.connectMeans, true);
    assertEqual(back.exampleWorksheetId, 'ws-example');
  });

  test('toJSON also writes the flat columnRefs.factors array of the spec', () => {
    const json = filled(2).toJSON();
    assertDeepEqual(json.columnRefs.factors.map(r => r.columnId), ['f0', 'f1']);
  });

  test('fromJSON reads the flat columnRefs.factors array', () => {
    const s = State.fromJSON({
      columnRefs: { measurement: ref('y'), factors: [ref('a'), ref('b'), ref('c')] },
    });
    assertDeepEqual(s.factors.map(f => f.ref.columnId), ['a', 'b', 'c']);
    assertEqual(s.hasContent(), true);
  });

  test('fromJSON survives null, garbage and an unknown model form', () => {
    for (const input of [null, 42, 'x', { modelForm: 'wobbly', estimator: 'guess' }]) {
      const s = State.fromJSON(input);
      assertEqual(s.factors.length, 2);
      assertEqual(s.modelForm, 'nested');
      assertEqual(s.estimator, 'anova');
    }
  });

  test('fromJSON clamps an oversized persisted factor list to four', () => {
    const s = State.fromJSON({
      columnRefs: { measurement: ref('y'), factors: [ref('a'), ref('b'), ref('c'), ref('d'), ref('e')] },
    });
    assertEqual(s.factors.length, 4);
  });
});
