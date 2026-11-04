/**
 * Statisches Handbuch: Module in neuer Form (help.<lang>.json,
 * data/references.json mit Buchverweisen) und Katalogtexte.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadModules, loadExamples, loadI18n, getModuleName } from './load-sources.mjs';

async function write(root, rel, value) {
  const full = path.join(root, rel);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, typeof value === 'string' ? value : JSON.stringify(value));
}

test('loadModules: neue Form — Hilfe beider Sprachen zusammengeführt, Bücher aufgelöst', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'handbook-new-'));
  await write(root, 'js/modules/neu/resources/i18n/help.de.json', { $schema: 'x', sections: { overview: { title: 'Überblick', blocks: [{ type: 'paragraph', content: 'Text' }] } } });
  await write(root, 'js/modules/neu/resources/i18n/help.en.json', { $schema: 'x', sections: { overview: { title: 'Overview', blocks: [{ type: 'paragraph', content: 'Text' }] } } });
  await write(root, 'js/modules/neu/resources/data/references.json', { $schema: 'x', references: [
    { book: 'melzer-2019', note: { de: 'K3', en: 'C3' } },
    { id: 'x', type: 'webpage', title: 'X', author: [{ literal: 'X' }] },
  ] });
  await write(root, 'js/modules/alt/alt-help.js', "export default { moduleId: 'alt', sections: { a: { de: { title: 'A', blocks: [] }, en: { title: 'A', blocks: [] } } } };");
  const mods = await loadModules(root, { modules: [{ id: 'alt', phase: 'define' }, { id: 'neu', phase: 'measure' }, { id: 'leer', phase: 'measure' }], converted: ['neu', 'leer'] });
  assert.deepEqual(mods.map((m) => m.id), ['alt', 'neu']);
  const neu = mods[1];
  assert.equal(neu.help.moduleId, 'neu');
  assert.equal(neu.help.sections.overview.de.title, 'Überblick');
  assert.equal(neu.help.sections.overview.en.title, 'Overview');
  assert.deepEqual(neu.references.map((r) => r.id), ['melzer-2019', 'x']);
  assert.equal(neu.references[0].note.en, 'C3');
  assert.equal(neu.phase, 'measure');
});

test('loadModules: neue Form mit kaputter Hilfe-Datei wird übersprungen, nicht abgebrochen', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'handbook-new-'));
  await write(root, 'js/modules/neu/resources/i18n/help.de.json', '{ kaputt');
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.deepEqual(await loadModules(root, { modules: [{ id: 'neu', phase: 'measure' }], converted: ['neu'] }), []);
  } finally { console.warn = warn; }
});

test('loadI18n mischt die Katalogtexte ein; getModuleName findet den Namen', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'handbook-i18n-'));
  await write(root, 'i18n/de.json', { modules: { alt: { name: 'Alt' } } });
  await write(root, 'i18n/en.json', { modules: {} });
  await write(root, 'js/modules/catalog.de.json', { $schema: '../../schemas/catalog-texts.schema.json', neu: { name: 'Neu', description: 'Kurz', whenToUse: 'Wann' } });
  await write(root, 'js/modules/catalog.en.json', { $schema: '../../schemas/catalog-texts.schema.json' });
  const i18n = await loadI18n(root);
  assert.equal(getModuleName('neu', i18n, 'de'), 'Neu');
  assert.equal(getModuleName('alt', i18n, 'de'), 'Alt');
  assert.equal('$schema' in i18n.de.modules, false);
});

test('loadModules ohne Katalog-Argument liest catalog.generated.js (echter Baum)', async () => {
  const repo = path.resolve(new URL('../../..', import.meta.url).pathname);
  const mods = await loadModules(repo);
  assert.ok(mods.length > 50, `nur ${mods.length} Module`);
  assert.ok(mods.some((m) => m.id === 'sipoc'));
});

test('loadExamples: Index, Szenarien und Modulbeispiele; sourcePath, Vorschau, modules mit exampleRefs', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'handbook-examples-'));
  await write(root, 'examples/index.json', { $schema: 'x', version: '1.0', examples: [{ id: 'alt', type: 'project', modules: ['histogram'], file: 'projects/alt.json', format: 'json' }] });
  await write(root, 'examples/projects/alt.json', {});
  await write(root, 'examples/shared/scenarios.json', { $schema: 'x', scenarios: [{ id: 's', type: 'scenario', items: ['alt'] }] });
  await write(root, 'js/modules/neu/resources/examples/examples.json', { $schema: 'x', examples: [
    { id: 'neu-d', type: 'dataset', file: 'd.csv', format: 'csv', preview: { rows: 1 } },
  ] });
  await write(root, 'js/modules/neu/resources/examples/d.csv', 'a\n1\n2\n');
  const { entries } = await loadExamples(root, { converted: ['neu'], examples: { 'neu-d': 'neu' }, exampleRefs: { 'neu-d': ['andere'], alt: ['neu'] } });
  assert.deepEqual(entries.map((e) => e.id), ['alt', 'neu-d', 's']);
  const byId = Object.fromEntries(entries.map((e) => [e.id, e]));
  assert.deepEqual(byId.alt.modules, ['histogram', 'neu']);
  assert.deepEqual(byId['neu-d'].modules, ['neu', 'andere']);
  assert.equal(byId['neu-d'].sourcePath, path.join(root, 'js/modules/neu/resources/examples/d.csv'));
  assert.equal(byId.alt.sourcePath, path.join(root, 'examples/projects/alt.json'));
  assert.deepEqual(byId['neu-d'].previewData.rows, [['1']]);
});
