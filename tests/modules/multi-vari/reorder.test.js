/**
 * Geste reorder von multi-vari: Positionen ohne Umrechnung auf moveFactor.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { isGesture } from '../../../js/core/interaction/define.js';
import { reorder } from '../../../js/modules/multi-vari/interaction/reorder.js';

suite('multi-vari — Geste reorder', () => {
  test('ist eine geprüfte Geste mit Griff .multi-vari__grip', () => {
    assertTrue(isGesture(reorder));
    assertEqual(reorder.kind, 'reorder');
    assertEqual(reorder.handle, '.multi-vari__grip');
  });

  test('toCommand übernimmt den Endindex unverändert', () => {
    assertDeepEqual(reorder.toCommand({ index: 0 }, { index: 2 }),
      ['moveFactor', { fromIdx: 0, toIdx: 2 }]);
  });

  test('preview schreibt state.dropPreview am Host, null räumt auf', () => {
    const host = { state: { dropPreview: null } };
    reorder.preview.call(host, { group: 'factors', index: 1 });
    assertDeepEqual(host.state.dropPreview, { group: 'factors', index: 1 });
    reorder.preview.call(host, null);
    assertEqual(host.state.dropPreview, null);
  });
});
