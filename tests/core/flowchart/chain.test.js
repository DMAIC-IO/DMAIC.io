/**
 * Tests for core/flowchart/chain.js — reine Funktionen auf einer
 * Schrittliste: Endindex, Unterschritte, Fehler mit `param`, Eingaben bleiben
 * unverändert.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import {
  insertStep, removeStep, moveStep, addSubstep, removeSubstep, moveSubstep, expandedFromLegacy,
} from '../../../js/core/flowchart/chain.js';

const step = (id, substeps = []) => ({ id, title: id.toUpperCase(), substeps });
const ids = (list) => list.map((s) => s.id);
const chain = () => [step('a'), step('b', [{ id: 'x', title: 'X' }, { id: 'y', title: 'Y' }, { id: 'z', title: 'Z' }]), step('c')];

/** Wirft `fn` einen Fehler mit diesem `param`? @returns {Error} */
function throwsParam(fn, param) {
  let err = null;
  try { fn(); } catch (e) { err = e; }
  assertTrue(err instanceof Error, `erwartet einen Fehler mit param ${param}`);
  assertEqual(err.param, param);
  return err;
}

suite('flowchart/chain — Schritte', () => {
  test('moveStep an den Endindex: a nach 2 → b, c, a', () => {
    assertDeepEqual(ids(moveStep(chain(), 'a', 2)), ['b', 'c', 'a']);
    assertDeepEqual(ids(moveStep(chain(), 'c', 0)), ['c', 'a', 'b']);
  });

  test('moveStep: Index außerhalb 0…länge−1 wirft mit param index', () => {
    throwsParam(() => moveStep(chain(), 'a', 3), 'index');
    throwsParam(() => moveStep(chain(), 'a', -1), 'index');
    throwsParam(() => moveStep(chain(), 'a', 1.5), 'index');
  });

  test('moveStep: unbekannte id wirft mit param id', () => {
    throwsParam(() => moveStep(chain(), 'q', 0), 'id');
  });

  test('insertStep ohne Index hängt an, mit Index fügt dort ein', () => {
    assertDeepEqual(ids(insertStep(chain(), step('d'))), ['a', 'b', 'c', 'd']);
    assertDeepEqual(ids(insertStep(chain(), step('d'), 0)), ['d', 'a', 'b', 'c']);
    assertDeepEqual(ids(insertStep(chain(), step('d'), 3)), ['a', 'b', 'c', 'd']);
  });

  test('insertStep: Index außerhalb 0…länge wirft mit param index', () => {
    throwsParam(() => insertStep(chain(), step('d'), 4), 'index');
    throwsParam(() => insertStep(chain(), step('d'), -1), 'index');
  });

  test('removeStep entfernt, unbekannte id wirft mit param id', () => {
    assertDeepEqual(ids(removeStep(chain(), 'b')), ['a', 'c']);
    throwsParam(() => removeStep(chain(), 'q'), 'id');
  });
});

suite('flowchart/chain — Unterschritte', () => {
  test('moveSubstep innerhalb eines Schritts an den Endindex', () => {
    const out = moveSubstep(chain(), 'b', 'x', 2);
    assertDeepEqual(ids(out[1].substeps), ['y', 'z', 'x']);
    assertDeepEqual(ids(moveSubstep(chain(), 'b', 'z', 0)[1].substeps), ['z', 'x', 'y']);
  });

  test('moveSubstep: Index, Schritt- und Unterschritt-id werden geprüft', () => {
    throwsParam(() => moveSubstep(chain(), 'b', 'x', 3), 'index');
    throwsParam(() => moveSubstep(chain(), 'q', 'x', 0), 'stepId');
    throwsParam(() => moveSubstep(chain(), 'b', 'q', 0), 'substepId');
  });

  test('addSubstep hängt an, removeSubstep entfernt', () => {
    const added = addSubstep(chain(), 'a', { id: 'n', title: '' });
    assertDeepEqual(added[0].substeps, [{ id: 'n', title: '' }]);
    assertDeepEqual(ids(removeSubstep(chain(), 'b', 'y')[1].substeps), ['x', 'z']);
    throwsParam(() => addSubstep(chain(), 'q', { id: 'n', title: '' }), 'stepId');
    throwsParam(() => removeSubstep(chain(), 'b', 'q'), 'substepId');
  });

  test('expandedFromLegacy: ids der aufgeklappten Schritte', () => {
    assertDeepEqual(expandedFromLegacy([{ id: 'a', expanded: true }, { id: 'b' }]), ['a']);
    assertDeepEqual(expandedFromLegacy([{ id: 'a', expanded: 'yes' }, { id: 'b', expanded: false }]), []);
  });
});

suite('flowchart/chain — Kopien', () => {
  test('Eingabelisten und ihre Schritte bleiben unverändert', () => {
    const input = chain();
    const snapshot = JSON.parse(JSON.stringify(input));
    const results = [
      insertStep(input, step('d'), 1),
      removeStep(input, 'a'),
      moveStep(input, 'a', 2),
      addSubstep(input, 'b', { id: 'n', title: '' }),
      removeSubstep(input, 'b', 'x'),
      moveSubstep(input, 'b', 'x', 2),
    ];
    assertDeepEqual(input, snapshot);
    for (const r of results) assertTrue(r !== input, 'jede Funktion liefert eine neue Liste');
    assertTrue(results[3][1] !== input[1], 'der geänderte Schritt ist eine Kopie');
  });
});
