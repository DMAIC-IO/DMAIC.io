/**
 * Process Map Gesten: Kette am Schrittnummer-Griff (ohne Bänder), Unterschritte
 * am geteilten Griff, IO je Schritt und Liste (`moveIO` mit `targetIoId`).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { isGesture } from '../../../js/core/interaction/define.js';
import { chain, substeps, io } from '../../../js/modules/process-map/interaction/gestures.js';

/** Eine IO-Gruppe ohne DOM: Einträge mit id und Index, abgeschlossen. */
function ioGroup(stepId, type, ids) {
  const group = /** @type {any} */ ({
    dataset: { reorderGroup: `${stepId}:${type}`, ioStep: stepId, ioType: type },
    hasAttribute: (a) => a === 'data-reorder-closed',
  });
  const items = ids.map((id, i) => ({ dataset: { ioId: id, reorderIndex: String(i) }, closest: () => group }));
  group.querySelectorAll = () => items;
  return { group, items };
}

/** Griff im Eintrag `k` einer Gruppe. */
function grip(g, k) {
  return /** @type {any} */ ({
    closest(sel) {
      if (sel === '[data-io-id]' || sel === '[data-reorder-index]') return g.items[k];
      if (sel === '[data-reorder-group]') return g.group;
      return null;
    },
  });
}

suite('process-map — Gesten', () => {
  test('Kette und Unterschritte nutzen die Griffe des Moduls bzw. des Teil-Templates', () => {
    assertTrue(isGesture(chain) && isGesture(substeps) && isGesture(io));
    assertEqual(chain.handle, '.pmap__step-number');
    assertEqual(substeps.handle, '.fc-substep-grip');
  });

  test('Kette ohne Bänder: toCommand liefert moveStep { id, index } ohne Bandparameter', () => {
    assertDeepEqual(chain.toCommand({ id: 'a', index: 0, band: null }, { id: 'a', index: 2, band: null }),
      ['moveStep', { id: 'a', index: 2 }]);
  });

  test('io ist eine reorder-Geste auf der y-Achse am IO-Punkt', () => {
    assertEqual(io.kind, 'reorder');
    assertEqual(io.axis, 'y');
    assertEqual(io.handle, '.pmap__io-dot');
  });

  test('start liest Gruppe, Index, id, Schritt und Liste', () => {
    const g = ioGroup('s1', 'inputs', ['i1', 'i2', 'i3']);
    assertDeepEqual(io.start(grip(g, 1)), { group: 's1:inputs', index: 1, id: 'i2', stepId: 's1', type: 'inputs' });
  });

  test('clamp: Ausgangsplatz ist die Startposition, sonst mit der id am Zielplatz; fremde Gruppe kein Ziel', () => {
    const g = ioGroup('s1', 'inputs', ['i1', 'i2', 'i3']);
    const other = ioGroup('s1', 'outputs', ['o1']);
    const ctx = { root: /** @type {any} */ ({ querySelectorAll: () => [g.group, other.group] }) };
    const from = io.start(grip(g, 2));
    assertTrue(io.clamp({ group: 's1:inputs', index: 2 }, ctx, from) === from);
    assertTrue(io.clamp({ group: 's1:inputs', index: 5 }, ctx, from) === from);
    assertDeepEqual(io.clamp({ group: 's1:inputs', index: 0 }, ctx, from), { group: 's1:inputs', index: 0, id: from.id, targetId: 'i1' });
    assertEqual(io.clamp({ group: 's1:outputs', index: 0 }, ctx, from), null);
  });

  test('toCommand: moveIO mit Schritt, Liste, id und der id am Zielplatz', () => {
    const from = { group: 's1:inputs', index: 2, id: 'i3', stepId: 's1', type: /** @type {'inputs'} */ ('inputs') };
    assertDeepEqual(io.toCommand(from, { group: 's1:inputs', index: 0, targetId: 'i1' }),
      ['moveIO', { stepId: 's1', type: 'inputs', ioId: 'i3', targetIoId: 'i1' }]);
  });

  test('preview schreibt Gruppe, Index und gezogene id nach state.ioPreview, null räumt auf', () => {
    const host = { state: { ioPreview: null } };
    io.preview.call(host, { group: 's1:inputs', index: 1, id: 'i3', targetId: 'i2' });
    assertDeepEqual(host.state.ioPreview, { group: 's1:inputs', index: 1, id: 'i3' });
    io.preview.call(host, null);
    assertEqual(host.state.ioPreview, null);
  });
});
