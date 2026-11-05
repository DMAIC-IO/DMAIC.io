/**
 * Geste reorder von sipoc: Positionen ohne Umrechnung auf moveItem.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import { isGesture } from '../../js/core/interaction/define.js';
import { reorder } from '../../js/modules/sipoc/interaction/reorder.js';

/** Minimale DOM-freie Attrappe: Gruppen mit `data-group`, `data-group-label` und n Elementen. */
function fakeRoot(groups) {
  const els = groups.map(({ key, label, count }) => {
    const group = { dataset: { group: key, groupLabel: label } };
    const items = Array.from({ length: count }, () => ({ closest: () => group }));
    group.querySelectorAll = () => items;
    return group;
  });
  return { querySelectorAll: () => els };
}

/** Übersetzer-Attrappe: gibt Schlüssel und Parameter lesbar zurück. */
const t = (key, p = {}) => (key === 'common.gesture.position'
  ? `Position ${p.pos} von ${p.total}`
  : `${p.group}, Position ${p.pos} von ${p.total}`);

suite('sipoc — Geste reorder', () => {
  test('ist eine geprüfte Geste mit Griff .sipoc__grip', () => {
    assertTrue(isGesture(reorder));
    assertEqual(reorder.kind, 'reorder');
    assertEqual(reorder.handle, '.sipoc__grip');
  });

  test('toCommand übernimmt Gruppe und Endindex unverändert', () => {
    assertDeepEqual(reorder.toCommand({ group: 'inputs', index: 2 }, { group: 'process', index: 0 }),
      ['moveItem', { fromCol: 'inputs', fromIdx: 2, toCol: 'process', toIdx: 0 }]);
    assertDeepEqual(reorder.toCommand({ group: 'outputs', index: 0 }, { group: 'outputs', index: 3 }),
      ['moveItem', { fromCol: 'outputs', fromIdx: 0, toCol: 'outputs', toIdx: 3 }]);
  });

  test('preview schreibt state.dropPreview am Host, null räumt auf', () => {
    const host = { state: { dropPreview: null } };
    reorder.preview.call(host, { group: 'inputs', index: 1 });
    assertDeepEqual(host.state.dropPreview, { group: 'inputs', index: 1 });
    reorder.preview.call(host, null);
    assertEqual(host.state.dropPreview, null);
  });

  test('Ansage kommt aus der Vorgabe des Kerns (Spaltenname bei Gruppenwechsel)', () => {
    const ctx = { root: fakeRoot([
      { key: 'inputs', label: 'Inputs', count: 3 },
      { key: 'process', label: 'Prozess', count: 2 },
    ]) };
    const from = { group: 'inputs', index: 0 };
    assertEqual(reorder.announce({ group: 'inputs', index: 1 }, t, ctx, from), 'Position 2 von 3');
    assertEqual(reorder.announce({ group: 'process', index: 0 }, t, ctx, from), 'Prozess, Position 1 von 3');
  });
});
