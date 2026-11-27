/**
 * Gesten reorder der Makigami-Matrix: Schritte waagrecht am Schrittkopf,
 * Rollen senkrecht am Rollenkopf; id am Griff, Endindex ohne Umrechnung auf
 * moveStep bzw. moveRole, abgeschlossene Gruppen, Vorschau im UI-State.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { isGesture } from '../../../js/core/interaction/define.js';
import { stepReorder, roleReorder } from '../../../js/modules/makigami/interaction/reorder.js';

/** Ein Griff in einem Element mit id und Index in der Gruppe `group` (ohne DOM). */
function grip(group, id, index) {
  const item = { dataset: { id, reorderIndex: String(index) } };
  const g = { dataset: { reorderGroup: group } };
  return /** @type {any} */ ({
    closest(sel) {
      if (sel === '[data-id]' || sel === '[data-reorder-index]') return item;
      if (sel === '[data-reorder-group]') return g;
      return null;
    },
  });
}

/** Zwei abgeschlossene Gruppen: `steps` mit `n` Köpfen, `roles` mit `m` Zeilen. */
function world(n, m) {
  const mk = (key, count) => {
    const group = /** @type {any} */ ({
      dataset: { reorderGroup: key },
      hasAttribute: (a) => a === 'data-reorder-closed',
      querySelectorAll: () => items,
    });
    const items = Array.from({ length: count }, (_, i) => ({ dataset: { reorderIndex: String(i) }, closest: () => group }));
    return group;
  };
  const groups = [mk('steps', n), mk('roles', m)];
  return { root: /** @type {any} */ ({ querySelectorAll: () => groups }) };
}

suite('makigami — Gesten reorder', () => {
  test('zwei geprüfte Gesten: Schritte auf x am Schrittgriff, Rollen auf y am Rollengriff', () => {
    assertTrue(isGesture(stepReorder));
    assertTrue(isGesture(roleReorder));
    assertEqual(stepReorder.kind, 'reorder');
    assertEqual(roleReorder.kind, 'reorder');
    assertEqual(stepReorder.axis, 'x');
    assertEqual(roleReorder.axis, 'y');
    assertEqual(stepReorder.handle, '.makigami__drag-handle--step');
    assertEqual(roleReorder.handle, '.makigami__drag-handle--role');
  });

  test('start liest Gruppe, Index und die id des Elements', () => {
    assertDeepEqual(stepReorder.start(grip('steps', 's-2', 1)), { group: 'steps', index: 1, id: 's-2' });
    assertDeepEqual(roleReorder.start(grip('roles', 'r-1', 0)), { group: 'roles', index: 0, id: 'r-1' });
  });

  test('toCommand: id und Endindex unverändert', () => {
    assertDeepEqual(stepReorder.toCommand({ group: 'steps', index: 0, id: 's-1' }, { group: 'steps', index: 3, id: 's-1' }),
      ['moveStep', { stepId: 's-1', to: 3 }]);
    assertDeepEqual(roleReorder.toCommand({ group: 'roles', index: 2, id: 'r-3' }, { group: 'roles', index: 0, id: 'r-3' }),
      ['moveRole', { roleId: 'r-3', to: 0 }]);
  });

  test('clamp: Ausgangsplatz = Startposition, sonst Bereich der eigenen Gruppe mit id; fremde Gruppe ohne Ziel', () => {
    const ctx = world(4, 3);
    const from = { group: 'steps', index: 1, id: 's-2' };
    assertTrue(stepReorder.clamp({ group: 'steps', index: 1 }, ctx, from) === from);
    assertDeepEqual(stepReorder.clamp({ group: 'steps', index: 9 }, ctx, from), { group: 'steps', index: 3, id: 's-2' });
    assertDeepEqual(stepReorder.clamp({ group: 'steps', index: -2 }, ctx, from), { group: 'steps', index: 0, id: 's-2' });
    assertEqual(stepReorder.clamp({ group: 'roles', index: 0 }, ctx, from), null);
    const role = { group: 'roles', index: 0, id: 'r-1' };
    assertEqual(roleReorder.clamp({ group: 'steps', index: 0 }, ctx, role), null);
    assertDeepEqual(roleReorder.clamp({ group: 'roles', index: 5 }, ctx, role), { group: 'roles', index: 2, id: 'r-1' });
  });

  test('preview schreibt Gruppe, Index und id nach state.dropPreview, null räumt auf', () => {
    const host = { state: { dropPreview: null } };
    stepReorder.preview.call(host, { group: 'steps', index: 2, id: 's-1' });
    assertDeepEqual(host.state.dropPreview, { group: 'steps', index: 2, id: 's-1' });
    roleReorder.preview.call(host, null);
    assertEqual(host.state.dropPreview, null);
  });
});
