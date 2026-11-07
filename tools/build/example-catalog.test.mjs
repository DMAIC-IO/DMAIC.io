/**
 * Beispielquellen lesen (tools/build/example-catalog.mjs).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readIndexEntries, readScenarios, readModuleExamples, readExampleOwners } from './example-catalog.mjs';
import { APP_DIR } from './build.mjs';

function appWith(files) {
  const root = mkdtempSync(join(tmpdir(), 'example-catalog-'));
  for (const [path, body] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, typeof body === 'string' ? body : JSON.stringify(body));
  }
  return root;
}

test('ohne Dateien: leere Listen', () => {
  const root = appWith({});
  assert.deepEqual(readIndexEntries(root), []);
  assert.deepEqual(readScenarios(root), []);
});

test('readIndexEntries lässt Szenarien weg, readScenarios liest shared/scenarios.json', () => {
  const root = appWith({
    'examples/index.json': { $schema: 'x', version: '1.0', examples: [{ id: 'a', type: 'project' }, { id: 's-alt', type: 'scenario' }] },
    'examples/shared/scenarios.json': { $schema: 'x', scenarios: [{ id: 's', type: 'scenario' }] },
  });
  assert.deepEqual(readIndexEntries(root).map((e) => e.id), ['a']);
  assert.deepEqual(readScenarios(root).map((e) => e.id), ['s']);
});

test('echter Baum: 12 Szenarien in shared/, keine mehr in index.json, neun geteilte Worksheets umgezogen', () => {
  assert.equal(readScenarios(APP_DIR).length, 12);
  const raw = JSON.parse(readFileSync(join(APP_DIR, 'examples', 'index.json'), 'utf8'));
  assert.equal(raw.examples.filter((e) => e.type === 'scenario').length, 0);
  for (const name of ['pizza-delivery', 'regression-collinear', 'regression-outliers', 'spc-imr-shift', 'hypothesis-pizza-fahrer',
    'outlier-bolzen-grubbs', 'distribution-weibull', 'distribution-lognormal', 'hubschrauber-flyer', 'resampling-ruestzeit']) {
    assert.ok(existsSync(join(APP_DIR, 'examples', 'shared', 'worksheets', `${name}.json`)), name);
    assert.equal(existsSync(join(APP_DIR, 'examples', 'worksheets', `${name}.json`)), false, `${name} liegt noch unter worksheets/`);
  }
  for (const keep of ['msa-typ1-hubschrauber-flyer']) {
    assert.ok(existsSync(join(APP_DIR, 'examples', 'worksheets', `${keep}.json`)), `${keep} bleibt`);
  }
});

test('readModuleExamples und readExampleOwners: Index-Besitzer ist modules[0], Modulbeispiele gehören dem Modul', () => {
  const root = appWith({
    'examples/index.json': { version: '1.0', examples: [{ id: 'alt-1', type: 'project', modules: ['histogram', 'boxplot'] }] },
    'js/modules/neu/resources/examples/examples.json': { $schema: 'x', examples: [{ id: 'neu-1', type: 'project', file: 'p.json' }] },
  });
  assert.deepEqual(readModuleExamples(root, 'neu').map((e) => e.id), ['neu-1']);
  assert.deepEqual(readModuleExamples(root, 'ohne'), []);
  assert.deepEqual([...readExampleOwners(root, ['neu'])], [['alt-1', 'histogram'], ['neu-1', 'neu']]);
});
