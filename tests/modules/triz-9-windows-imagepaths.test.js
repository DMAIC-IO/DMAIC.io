import { suite, test, assertDeepEqual } from '../test-utils.js';
import { State } from '../../js/modules/triz-9-windows/triz-9-windows-model.js';

suite('triz-9-windows State.imagePaths', () => {
  test('returns a path per cell holding an image (toJSON 2-D cells)', () => {
    const json = { cells: [
      [{ text: '', image: 'data:1' }, { text: '' }],
      [{ text: '', image: 'asset:z' }],
    ] };
    assertDeepEqual(State.imagePaths(json), [
      ['cells', 0, 0, 'image'],
      ['cells', 1, 0, 'image'],
    ]);
  });
  test('returns [] when empty / no cells', () => {
    assertDeepEqual(State.imagePaths({ cells: [[{ text: '' }, { text: '' }]] }), []);
    assertDeepEqual(State.imagePaths({}), []);
  });
});
