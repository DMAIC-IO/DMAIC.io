import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { buildBubble } from '../../../js/modules/xy-plot/domain/bubble.js';

suite('xy-plot: Blase', () => {
  test('Wurzel-Normierung auf 6 bis 28 px', () => {
    const b = buildBubble([0, 4, 16], 'S');
    assertDeepEqual(b.sizes.map(Math.round), [6, 17, 28]);
    assertDeepEqual(b.rawSizes, [0, 4, 16]);
    assertEqual(b.label, 'S');
  });
  test('gleiche Werte ergeben die Mitte', () => {
    assertDeepEqual(buildBubble([4, 4], 'S').sizes, [17, 17]);
  });
});
