/**
 * Process Map Model: jedes Kommando samt Ablehnung, Loop-Aufräumen bei
 * removeStep/moveStep, Zuklappen bei removeSubstep, Invarianten mit Reparatur.
 */
import { suite, test, assert, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/process-map/domain/model.js';

const V1 = { version: '1.0' };

/** @param {() => any} fn @returns {any} der geworfene Fehler */
function errorOf(fn) {
  try { fn(); } catch (err) { return err; }
  throw new Error('Expected function to throw');
}

/** @param {string} id @param {object} [extra] */
const step = (id, extra = {}) => ({
  id, title: id.toUpperCase(), description: '', valueType: null, inputs: [], outputs: [], substeps: [], loop: null, ...extra,
});

/** Drei Schritte a, b, c; c mit Loop auf a, a mit zwei Inputs und zwei Unterschritten, aufgeklappt. */
function three() {
  return /** @type {any} */ (State.fromJSON({
    _schema: V1,
    steps: [
      step('a', {
        inputs: [{ id: 'i1', name: 'I1', inputType: null }, { id: 'i2', name: 'I2', inputType: 'param' }],
        outputs: [{ id: 'o1', name: 'O1' }, { id: 'o2', name: 'O2' }],
        substeps: [{ id: 'x', title: 'X' }, { id: 'y', title: 'Y' }],
      }),
      step('b'),
      step('c', { loop: { targetStepId: 'a', condition: 'C', steps: [{ id: 'l1', title: 'L1' }] } }),
    ],
    expanded: ['a'],
  }));
}

suite('Process Map Model — Schritte', () => {
  test('Vorgaben: leer, ohne Inhalt', () => {
    const s = /** @type {any} */ (new State());
    assertDeepEqual(s.steps, []);
    assertDeepEqual(s.expanded, []);
    assertEqual(s.hasContent(), false);
  });

  test('addStep ohne Index hängt einen leeren Schritt an und liefert die id mit Präfix s', () => {
    const s = /** @type {any} */ (new State());
    const id = s.addStep({});
    assert(id.startsWith('s'), 'Präfix s');
    assertDeepEqual(JSON.parse(JSON.stringify(s.steps[0])), {
      id, title: '', description: '', valueType: null, inputs: [], outputs: [], substeps: [], loop: null,
    });
    assertEqual(s.hasContent(), true);
  });

  test('addStep mit atIndex fügt an der Lücke ein; außerhalb des Bereichs wird abgelehnt', () => {
    const s = three();
    const id = s.addStep({ atIndex: 1 });
    assertDeepEqual(s.steps.map((x) => x.id), ['a', id, 'b', 'c']);
    assertEqual(errorOf(() => s.addStep({ atIndex: 9 })).param, 'atIndex');
    assertEqual(s.steps.length, 4);
  });

  test('removeStep löscht jeden Loop mit diesem Ziel ganz und räumt expanded', () => {
    const s = three();
    s.removeStep({ id: 'a' });
    assertDeepEqual(s.steps.map((x) => x.id), ['b', 'c']);
    assertEqual(s.steps[1].loop, null);
    assertDeepEqual(s.expanded, []);
    assertEqual(errorOf(() => s.removeStep({ id: 'zz' })).param, 'id');
  });

  test('moveStep: Endindex; ein Ziel, das danach nicht mehr davor liegt, wird null', () => {
    const s = three();
    s.moveStep({ id: 'a', index: 2 });
    assertDeepEqual(s.steps.map((x) => x.id), ['b', 'c', 'a']);
    assertEqual(s.steps[1].loop.targetStepId, null);
    assertEqual(s.steps[1].loop.condition, 'C');
    const t = three();
    t.moveStep({ id: 'b', index: 0 });
    assertEqual(t.steps[2].loop.targetStepId, 'a');
    assertEqual(errorOf(() => t.moveStep({ id: 'b', index: 3 })).param, 'index');
  });

  test('appendSteps hängt Schritte mit Titel an und liefert ihre Zahl', () => {
    const s = three();
    assertEqual(s.appendSteps({ steps: [{ title: 'P1' }, { title: 'P2' }] }), 2);
    assertDeepEqual(s.steps.slice(3).map((x) => x.title), ['P1', 'P2']);
    assertEqual(new Set(s.steps.map((x) => x.id)).size, 5);
    assertEqual(s.steps[4].valueType, null);
  });

  test('cycleValueType: null → va → bnva → nva → null', () => {
    const s = three();
    const seen = [];
    for (let k = 0; k < 4; k++) {
      s.cycleValueType({ stepId: 'b' });
      seen.push(s.steps[1].valueType);
    }
    assertDeepEqual(seen, ['va', 'bnva', 'nva', null]);
    assertEqual(errorOf(() => s.cycleValueType({ stepId: 'zz' })).param, 'stepId');
  });
});

suite('Process Map Model — Inputs und Outputs', () => {
  test('addIO legt an (Input mit inputType null, Output ohne) und liefert die id mit Präfix io', () => {
    const s = three();
    const i = s.addIO({ stepId: 'b', type: 'inputs' });
    const o = s.addIO({ stepId: 'b', type: 'outputs' });
    assert(i.startsWith('io') && o.startsWith('io'), 'Präfix io');
    assertDeepEqual(JSON.parse(JSON.stringify(s.steps[1].inputs)), [{ id: i, name: '', inputType: null }]);
    assertDeepEqual(JSON.parse(JSON.stringify(s.steps[1].outputs)), [{ id: o, name: '' }]);
    assertEqual(errorOf(() => s.addIO({ stepId: 'b', type: 'nope' })).param, 'type');
  });

  test('removeIO entfernt aus der genannten Liste; unbekannte id wird abgelehnt', () => {
    const s = three();
    s.removeIO({ stepId: 'a', type: 'inputs', ioId: 'i1' });
    assertDeepEqual(s.steps[0].inputs.map((x) => x.id), ['i2']);
    assertEqual(errorOf(() => s.removeIO({ stepId: 'a', type: 'outputs', ioId: 'i2' })).param, 'ioId');
    assertEqual(s.steps[0].inputs.length, 1);
  });

  test('moveIO nimmt den Platz des Ziels ein (beide Richtungen)', () => {
    const s = three();
    s.moveIO({ stepId: 'a', type: 'inputs', ioId: 'i2', targetIoId: 'i1' });
    assertDeepEqual(s.steps[0].inputs.map((x) => x.id), ['i2', 'i1']);
    s.moveIO({ stepId: 'a', type: 'inputs', ioId: 'i2', targetIoId: 'i1' });
    assertDeepEqual(s.steps[0].inputs.map((x) => x.id), ['i1', 'i2']);
    s.moveIO({ stepId: 'a', type: 'outputs', ioId: 'o1', targetIoId: 'o2' });
    assertDeepEqual(s.steps[0].outputs.map((x) => x.id), ['o2', 'o1']);
  });

  test('moveIO lehnt fremde Liste, gleiche id und unbekannte id ab; der Zustand bleibt', () => {
    const s = three();
    assertEqual(errorOf(() => s.moveIO({ stepId: 'a', type: 'outputs', ioId: 'i2', targetIoId: 'i1' })).param, 'ioId');
    assertEqual(errorOf(() => s.moveIO({ stepId: 'a', type: 'inputs', ioId: 'i1', targetIoId: 'i1' })).param, 'targetIoId');
    assertEqual(errorOf(() => s.moveIO({ stepId: 'a', type: 'inputs', ioId: 'i1', targetIoId: 'x' })).param, 'targetIoId');
    assertDeepEqual(s.steps[0].inputs.map((x) => x.id), ['i1', 'i2']);
  });

  test('cycleInputType: null → param → noise → null; ein Output wird abgelehnt', () => {
    const s = three();
    const seen = [];
    for (let k = 0; k < 3; k++) {
      s.cycleInputType({ stepId: 'a', ioId: 'i1' });
      seen.push(s.steps[0].inputs[0].inputType);
    }
    assertDeepEqual(seen, ['param', 'noise', null]);
    assertEqual(s.steps[0].inputs[1].inputType, 'param');
    assertEqual(errorOf(() => s.cycleInputType({ stepId: 'a', ioId: 'o1' })).param, 'ioId');
  });
});

suite('Process Map Model — Unterschritte', () => {
  test('addSubstep liefert die id mit Präfix ss', () => {
    const s = three();
    const id = s.addSubstep({ stepId: 'b' });
    assert(id.startsWith('ss'), 'Präfix ss');
    assertDeepEqual(s.steps[1].substeps.map((x) => x.id), [id]);
  });

  test('removeSubstep: leer geworden fällt der Schritt aus expanded', () => {
    const s = three();
    s.removeSubstep({ stepId: 'a', substepId: 'x' });
    assertDeepEqual(s.expanded, ['a']);
    s.removeSubstep({ stepId: 'a', substepId: 'y' });
    assertDeepEqual(s.expanded, []);
    assertEqual(errorOf(() => s.removeSubstep({ stepId: 'a', substepId: 'y' })).param, 'substepId');
  });

  test('moveSubstep mit Endindex; setExpanded schaltet das Ansichtsfeld', () => {
    const s = three();
    s.moveSubstep({ stepId: 'a', substepId: 'x', index: 1 });
    assertDeepEqual(s.steps[0].substeps.map((x) => x.id), ['y', 'x']);
    s.setExpanded({ id: 'b', expanded: true });
    assertDeepEqual(s.expanded, ['a', 'b']);
    s.setExpanded({ id: 'a', expanded: false });
    assertDeepEqual(s.expanded, ['b']);
  });
});

suite('Process Map Model — Loops', () => {
  test('setLoop an legt einen leeren Loop an, ein vorhandener bleibt; aus entfernt ihn samt Inhalt', () => {
    const s = three();
    s.setLoop({ stepId: 'b', on: true });
    assertDeepEqual(JSON.parse(JSON.stringify(s.steps[1].loop)), { targetStepId: null, condition: '', steps: [] });
    s.setLoop({ stepId: 'c', on: true });
    assertEqual(s.steps[2].loop.condition, 'C');
    s.setLoop({ stepId: 'c', on: false });
    assertEqual(s.steps[2].loop, null);
    assertEqual(errorOf(() => s.setLoop({ stepId: 'b', on: 'ja' })).param, 'on');
  });

  test('removeLoop entfernt den Loop', () => {
    const s = three();
    s.removeLoop({ stepId: 'c' });
    assertEqual(s.steps[2].loop, null);
  });

  test('setLoopTarget: früherer Schritt gilt, null/leer löscht', () => {
    const s = three();
    s.setLoopTarget({ stepId: 'c', targetStepId: 'b' });
    assertEqual(s.steps[2].loop.targetStepId, 'b');
    s.setLoopTarget({ stepId: 'c', targetStepId: '' });
    assertEqual(s.steps[2].loop.targetStepId, null);
    s.setLoopTarget({ stepId: 'c', targetStepId: 'a' });
    s.setLoopTarget({ stepId: 'c', targetStepId: null });
    assertEqual(s.steps[2].loop.targetStepId, null);
  });

  test('setLoopTarget lehnt ab: kein Loop (noLoop), Ziel nicht davor (loopTargetNotBefore), unbekanntes Ziel', () => {
    const s = three();
    const noLoop = errorOf(() => s.setLoopTarget({ stepId: 'b', targetStepId: 'a' }));
    assertEqual(noLoop.param, 'stepId');
    assertEqual(noLoop.hintKey, 'noLoop');
    s.setLoop({ stepId: 'b', on: true });
    for (const target of ['b', 'c']) {
      const err = errorOf(() => s.setLoopTarget({ stepId: 'b', targetStepId: target }));
      assertEqual(err.param, 'targetStepId');
      assertEqual(err.hintKey, 'loopTargetNotBefore');
    }
    assertEqual(errorOf(() => s.setLoopTarget({ stepId: 'b', targetStepId: 'zz' })).param, 'targetStepId');
    assertEqual(s.steps[1].loop.targetStepId, null);
  });

  test('addLoopStep / removeLoopStep; ohne Loop wird abgelehnt', () => {
    const s = three();
    const id = s.addLoopStep({ stepId: 'c' });
    assert(id.startsWith('ls'), 'Präfix ls');
    assertDeepEqual(s.steps[2].loop.steps.map((x) => x.id), ['l1', id]);
    s.removeLoopStep({ stepId: 'c', loopStepId: 'l1' });
    assertDeepEqual(s.steps[2].loop.steps.map((x) => x.id), [id]);
    assertEqual(errorOf(() => s.removeLoopStep({ stepId: 'c', loopStepId: 'l1' })).param, 'loopStepId');
    const add = errorOf(() => s.addLoopStep({ stepId: 'a' }));
    assertEqual(add.param, 'stepId');
    assertEqual(add.hintKey, 'noLoop');
    assertEqual(errorOf(() => s.removeLoopStep({ stepId: 'a', loopStepId: 'x' })).hintKey, 'noLoop');
  });
});

suite('Process Map Model — Invarianten', () => {
  const load = (json, reports) => /** @type {any} */ (State.fromJSON({ _schema: V1, ...json },
    { repair: true, onRepair: (name) => reports.push(name) }));

  test('doppelte ids (Schritt, Unterschritt, IO je Liste, Loop-Schritt) heilt die Reparatur: der erste bleibt', () => {
    const reports = [];
    const m = load({ steps: [
      step('a', {
        substeps: [{ id: 'x', title: '1' }, { id: 'x', title: '2' }],
        inputs: [{ id: 'i', name: '1', inputType: null }, { id: 'i', name: '2', inputType: null }],
        outputs: [{ id: 'i', name: 'o' }, { id: 'o', name: '1' }, { id: 'o', name: '2' }],
        loop: { targetStepId: null, condition: '', steps: [{ id: 'l', title: '1' }, { id: 'l', title: '2' }] },
      }),
      step('a', { title: 'zweites a' }),
    ] }, reports);
    assertEqual(m.steps.length, 1);
    assertDeepEqual(m.steps[0].substeps.map((x) => x.title), ['1']);
    assertDeepEqual(m.steps[0].inputs.map((x) => x.name), ['1']);
    assertDeepEqual(m.steps[0].outputs.map((x) => x.name), ['o', '1']);
    assertDeepEqual(m.steps[0].loop.steps.map((x) => x.title), ['1']);
    assert(reports.length > 0, 'Reparatur gemeldet');
  });

  test('loopTargetBefore: Vorwärts-, Selbst- und unbekanntes Ziel werden null', () => {
    const m = load({ steps: [
      step('a', { loop: { targetStepId: 'b', condition: 'vor', steps: [] } }),
      step('b', { loop: { targetStepId: 'b', condition: 'selbst', steps: [] } }),
      step('c', { loop: { targetStepId: 'zz', condition: 'weg', steps: [] } }),
      step('d', { loop: { targetStepId: 'a', condition: 'gut', steps: [] } }),
    ] }, []);
    assertDeepEqual(m.steps.map((s) => s.loop.targetStepId), [null, null, null, 'a']);
    assertDeepEqual(m.steps.map((s) => s.loop.condition), ['vor', 'selbst', 'weg', 'gut']);
  });

  test('validExpanded: unbekannte ids fallen aus expanded', () => {
    const m = load({ steps: [step('a')], expanded: ['a', 'zz'] }, []);
    assertDeepEqual(m.expanded, ['a']);
  });

  test('ohne Reparatur wird ein Vorwärtsziel abgelehnt; instance.set prüft dasselbe', () => {
    const json = { _schema: V1, steps: [step('a', { loop: { targetStepId: 'b', condition: '', steps: [] } }), step('b')] };
    assertEqual(typeof errorOf(() => State.fromJSON(json)).message, 'string');
  });
});
