/**
 * Geste reorder der RACI-Matrix: id der Zeile am Griff, Endindex ohne
 * Umrechnung auf moveActivity, Vorschau im UI-State.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { isGesture } from '../../../js/core/interaction/define.js';
import { reorder } from '../../../js/modules/raci-matrix/interaction/reorder.js';

/** Ein Griff in einer Zeile mit id und Index in der Gruppe `activities` (ohne DOM). */
function grip(id, index) {
  const row = { dataset: { id, reorderIndex: String(index) } };
  const group = { dataset: { reorderGroup: 'activities' } };
  return /** @type {any} */ ({
    closest(sel) {
      if (sel === '[data-id]' || sel === '[data-reorder-index]') return row;
      if (sel === '[data-reorder-group]') return group;
      return null;
    },
  });
}

suite('raci-matrix — Geste reorder', () => {
  test('ist eine geprüfte Geste mit Griff .raci__grip auf der y-Achse', () => {
    assertTrue(isGesture(reorder));
    assertEqual(reorder.kind, 'reorder');
    assertEqual(reorder.handle, '.raci__grip');
    assertEqual(reorder.axis, 'y');
  });

  test('start liest Gruppe, Index und die id der Zeile', () => {
    assertDeepEqual(reorder.start(grip('a3', 2)), { group: 'activities', index: 2, id: 'a3' });
  });

  test('toCommand übernimmt die id und den Endindex unverändert', () => {
    assertDeepEqual(reorder.toCommand({ group: 'activities', index: 0, id: 'a1' }, { group: 'activities', index: 2 }),
      ['moveActivity', { activityId: 'a1', to: 2 }]);
  });

  test('clamp: am Ausgangsplatz die Startposition selbst, sonst Gruppe und Index im Bereich', () => {
    const items = [0, 1, 2].map((i) => ({ dataset: { reorderIndex: String(i) }, closest: () => group }));
    const group = /** @type {any} */ ({
      dataset: { reorderGroup: 'activities' },
      hasAttribute: (a) => a === 'data-reorder-closed',
      querySelectorAll: () => items,
    });
    const ctx = { root: /** @type {any} */ ({ querySelectorAll: () => [group] }) };
    const from = { group: 'activities', index: 2, id: 'a3' };
    assertTrue(reorder.clamp({ group: 'activities', index: 3 }, ctx, from) === from);
    assertTrue(reorder.clamp({ group: 'activities', index: 2 }, ctx, from) === from);
    assertDeepEqual(reorder.clamp({ group: 'activities', index: 0 }, ctx, from), { group: 'activities', index: 0 });
    assertDeepEqual(reorder.clamp({ group: 'activities', index: -1 }, ctx, { ...from, index: 1 }), { group: 'activities', index: 0 });
  });

  test('preview schreibt Gruppe und Index nach state.dropPreview, null räumt auf', () => {
    const host = { state: { dropPreview: null } };
    reorder.preview.call(host, { group: 'activities', index: 1, id: 'a2' });
    assertDeepEqual(host.state.dropPreview, { group: 'activities', index: 1 });
    reorder.preview.call(host, null);
    assertEqual(host.state.dropPreview, null);
  });
});
