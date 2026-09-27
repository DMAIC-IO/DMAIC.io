import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { getModuleReferences, hasModuleReferences } from '../../js/core/references-registry.js';
import { REFS } from '../../js/core/references-registry.generated.js';

suite('references-registry', () => {
  test('hasModuleReferences is false for an unknown module', () => {
    assertEqual(hasModuleReferences('gibt-es-nicht'), false, 'unknown module');
  });

  test('getModuleReferences resolves to [] for an unknown module', async () => {
    const refs = await getModuleReferences('gibt-es-nicht');
    assertTrue(Array.isArray(refs) && refs.length === 0, 'empty array');
  });

  test('every generated entry is an array and is reachable through the API', async () => {
    for (const id of Object.keys(REFS)) {
      assertTrue(hasModuleReferences(id), `hasModuleReferences(${id})`);
      const refs = await getModuleReferences(id);
      assertTrue(Array.isArray(refs), `${id} → array`);
    }
  });
});
