import { suite, test, assertDeepEqual } from '../test-utils.js';
import { State } from '../../js/modules/ishikawa/ishikawa-model.js';

suite('ishikawa State.imagePaths', () => {
  test('returns a dataUrl path for each gallery image', () => {
    const json = { images: {
      inScope:  [{ id: 1, dataUrl: 'data:1', caption: '' }, { id: 2, dataUrl: 'asset:h9', caption: '' }],
      outScope: [{ id: 3, dataUrl: 'data:3', caption: '' }],
    } };
    assertDeepEqual(State.imagePaths(json), [
      ['images', 'inScope', 0, 'dataUrl'],
      ['images', 'inScope', 1, 'dataUrl'],
      ['images', 'outScope', 0, 'dataUrl'],
    ]);
  });
  test('returns [] when there are no images', () => {
    assertDeepEqual(State.imagePaths({ images: { inScope: [], outScope: [] } }), []);
    assertDeepEqual(State.imagePaths({}), []);
  });
});
