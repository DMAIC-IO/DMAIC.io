import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getModuleHelp, hasModuleHelp } from '../../js/core/help-registry.js';

test('getModuleHelp returns a bundled handbook for sipoc', async () => {
  const def = await getModuleHelp('sipoc');
  assert.equal(def.moduleId, 'sipoc');
  assert.ok(def.sections);
});

test('getModuleHelp / hasModuleHelp report false for a module without help', async () => {
  assert.equal(await getModuleHelp('__nonexistent__'), null);
  assert.equal(hasModuleHelp('__nonexistent__'), false);
});
