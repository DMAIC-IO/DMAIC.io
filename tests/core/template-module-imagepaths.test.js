import { suite, test, assertDeepEqual } from '../test-utils.js';
import { createModule } from '../../js/core/template-module.js';

suite('createModule imagePaths', () => {
  test('exposes Model.imagePaths when defined', () => {
    class Model { static imagePaths(json) { return json.hits ? [['hits', 0, 'img']] : []; } toJSON() { return {}; } }
    const m = createModule({ config: { id: 'x', engine: 'alpine', meta: { url: 'http://t/' } }, Model, data: () => ({}) });
    assertDeepEqual(m.imagePaths({ hits: true }), [['hits', 0, 'img']]);
  });

  test('defaults to [] when Model has no imagePaths', () => {
    class Model { toJSON() { return {}; } }
    const m = createModule({ config: { id: 'y', engine: 'alpine', meta: { url: 'http://t/' } }, Model, data: () => ({}) });
    assertDeepEqual(m.imagePaths({}), []);
  });
});
