import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { collectAgentData } from './agent-data.mjs';
import { RELEASED_MODULES, releaseDiff } from './agent-release.mjs';
import { APP_DIR } from './build.mjs';

test('Freigabe: genau die Module aus RELEASED_MODULES sind agentenfähig', async () => {
  const { modules } = await collectAgentData(APP_DIR);
  const diff = releaseDiff(modules);
  assert.deepEqual(diff, [], `Freigaben weichen ab (Diagnose: npm run agent:report -- --verbose):\n  ${diff.join('\n  ')}`);
});

test('RELEASED_MODULES ist sortiert und ohne Doppel', async () => {
  assert.deepEqual([...RELEASED_MODULES], [...new Set(RELEASED_MODULES)].sort());
});

test('releaseDiff: nicht freigegebenes, unbekanntes und neues Modul', async () => {
  const modules = {
    a: { available: false },
    c: { available: true },
    d: { available: true },
  };
  assert.deepEqual(releaseDiff(modules, ['a', 'c', 'gone']), [
    'a: nicht freigegeben → in CONVERTED_MODULES aufnehmen (tools/build/converted-modules.mjs) oder aus RELEASED_MODULES streichen',
    'gone: nicht freigegeben → in CONVERTED_MODULES aufnehmen (tools/build/converted-modules.mjs) oder aus RELEASED_MODULES streichen',
    'd: neu freigegeben → in RELEASED_MODULES aufnehmen',
  ]);
});

test('releaseDiff: ein Modul mit Schema ist freigegeben', async () => {
  const modelUrl = pathToFileURL(join(APP_DIR, 'js', 'core', 'model.js')).href;
  const root = mkdtempSync(join(tmpdir(), 'agent-release-'));
  const dir = join(root, 'js', 'modules', 'demo');
  mkdirSync(join(dir, 'domain'), { recursive: true });
  mkdirSync(join(dir, 'viewmodel'), { recursive: true });
  writeFileSync(join(dir, 'domain', 'model.js'),
    `import { defineModel, text } from '${modelUrl}';\nexport const State = defineModel({ fields: { title: text() } });\n`);
  writeFileSync(join(dir, 'viewmodel', 'viewmodel.js'), 'export default createModule({});\n');
  const { modules } = await collectAgentData(root, { converted: ['demo'] });
  assert.deepEqual(releaseDiff(modules, ['demo']), []);
  assert.deepEqual(releaseDiff(modules, []), ['demo: neu freigegeben → in RELEASED_MODULES aufnehmen']);
});
