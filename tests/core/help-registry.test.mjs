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

test('getModuleHelp resolves the module-free chapter from js/help', async () => {
  // `ai-assistant` belongs to no module; it lives in `js/help/` and reaches
  // the same map through `collectGuideIds` in tools/build/help-data.mjs.
  const def = await getModuleHelp('ai-assistant');
  assert.equal(def.moduleId, 'ai-assistant');
  assert.ok(def.sections.rolle, 'the briefing chapter must carry its sections');
  assert.equal(hasModuleHelp('ai-assistant'), true);
});
