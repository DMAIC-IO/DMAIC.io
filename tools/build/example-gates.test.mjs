/**
 * Gates der Beispiele (tools/build/example-gates.mjs, Spec A2/A3 §5.5).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkExamples } from './example-gates.mjs';
import { APP_DIR } from './build.mjs';

function appWith(files) {
  const root = mkdtempSync(join(tmpdir(), 'example-gates-'));
  for (const [path, body] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, typeof body === 'string' ? body : JSON.stringify(body));
  }
  return root;
}

const DESC = (id, refs = []) => `/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */\nexport default { id: '${id}', version: '1.0.0', icon: 'module.x', exampleRefs: ${JSON.stringify(refs)}, load: () => import('./viewmodel/viewmodel.js') };\n`;

/** Gültige Temp-App: ein Index-Beispiel, ein Modul `neu` mit zwei Beispielen, ein Szenario. */
function goodApp(overrides = {}) {
  return appWith({
    'examples/index.json': { version: '1.0', examples: [{ id: 'alt', type: 'project', modules: ['histogram', 'boxplot'], file: 'projects/alt.json', format: 'json' }] },
    'examples/projects/alt.json': { sourceWorksheetFile: 'shared/worksheets/w.json' },
    'examples/shared/worksheets/w.json': { sheets: [] },
    'examples/shared/scenarios.json': { scenarios: [{ id: 's', type: 'scenario', items: ['alt#boxplot', 'neu-p', 'neu-d#andere'] }] },
    'js/modules/neu/module.js': DESC('neu'),
    'js/modules/neu/resources/examples/examples.json': { examples: [
      { id: 'neu-p', type: 'project', file: 'projects/p.json', format: 'json' },
      { id: 'neu-d', type: 'dataset', file: 'd.csv', format: 'csv' },
    ] },
    'js/modules/neu/resources/examples/projects/p.json': { sourceWorksheetFile: 'eigen.json' },
    'js/modules/neu/resources/examples/eigen.json': { sheets: [] },
    'js/modules/neu/resources/examples/d.csv': 'a\n1\n',
    'js/modules/andere/module.js': DESC('andere', ['neu-d']),
    ...overrides,
  });
}

test('gültige Temp-App: keine Befunde', () => {
  assert.deepEqual(checkExamples(goodApp(), ['andere', 'neu']), []);
});

test('doppelte Id über index.json, examples.json und scenarios.json', () => {
  const root = goodApp({ 'examples/shared/scenarios.json': { scenarios: [{ id: 'neu-p', type: 'scenario', items: ['alt'] }] } });
  assert.deepEqual(checkExamples(root, ['andere', 'neu']),
    ['examples: Id doppelt: neu-p (js/modules/neu/resources/examples/examples.json, examples/shared/scenarios.json)']);
});

test('fehlende file und fehlendes sourceWorksheetFile, je mit ihrer Basis', () => {
  const root = goodApp({
    'js/modules/neu/resources/examples/examples.json': { examples: [
      { id: 'neu-p', type: 'project', file: 'projects/p.json', format: 'json' },
      { id: 'neu-d', type: 'dataset', file: 'weg.csv', format: 'csv' },
    ] },
    'js/modules/neu/resources/examples/projects/p.json': { sourceWorksheetFile: 'shared/worksheets/weg.json' },
  });
  assert.deepEqual(checkExamples(root, ['andere', 'neu']), [
    'examples: js/modules/neu/resources/examples/examples.json: neu-p: sourceWorksheetFile fehlt: examples/shared/worksheets/weg.json',
    'examples: js/modules/neu/resources/examples/examples.json: neu-d: Datei fehlt: js/modules/neu/resources/examples/weg.csv',
  ]);
});

test('Szenario-Item: unbekanntes Beispiel und #modul, das nicht zum Beispiel gehört', () => {
  const root = goodApp({ 'examples/shared/scenarios.json': { scenarios: [{ id: 's', type: 'scenario', items: ['nope', 'alt#sipoc', 'neu-p#neu'] }] } });
  assert.deepEqual(checkExamples(root, ['andere', 'neu']), [
    'examples: examples/shared/scenarios.json: s: nope — unbekanntes Beispiel',
    'examples: examples/shared/scenarios.json: s: alt#sipoc — sipoc ist kein Modul von alt (histogram, boxplot)',
  ]);
});

test('Szenario-Item #modul gilt nur über exampleRefs (neu-d#andere ohne Verweis)', () => {
  const root = goodApp({ 'js/modules/andere/module.js': DESC('andere', []) });
  assert.deepEqual(checkExamples(root, ['andere', 'neu']),
    ['examples: examples/shared/scenarios.json: s: neu-d#andere — andere ist kein Modul von neu-d (neu)']);
});

test('echter Baum: keine Befunde', () => {
  assert.deepEqual(checkExamples(APP_DIR), []);
});
