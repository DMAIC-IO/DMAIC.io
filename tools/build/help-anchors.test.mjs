import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { helpKeysInScripts, anchorKeysOf } from './help-anchors.mjs';

/** Minimaler App-Baum: ein Modul `foo` mit den gegebenen Dateien, dazu die geteilte Statistiktabelle. */
function fixture(files, shared = '') {
  const root = mkdtempSync(join(tmpdir(), 'help-anchors-'));
  mkdirSync(join(root, 'js', 'modules', 'foo'), { recursive: true });
  mkdirSync(join(root, 'js', 'core'), { recursive: true });
  writeFileSync(join(root, 'js', 'core', 'stats-panel.js'), shared);
  for (const [name, body] of Object.entries(files)) writeFileSync(join(root, 'js', 'modules', 'foo', name), body);
  return root;
}

test('helpKeysInScripts: agentAction in der Werkzeugleiste liefert den Aktionsschlüssel', () => {
  const root = fixture({ 'foo.js': "actions: [{ icon: 'action.add', agentAction: 'addItem', onClick: (d) => d.addItem() }]" });
  assert.deepEqual(helpKeysInScripts(root, 'foo'), [['foo.js', 'modules.foo.actions.addItem.help']]);
});

test('helpKeysInScripts: Template-Literal mit dateilokaler Konstante wird aufgelöst', () => {
  const root = fixture({ 'foo.js': "const HELP = 'modules.foo.types.';\nconst c = { help: `${HELP}Result.mean` };" });
  assert.deepEqual(helpKeysInScripts(root, 'foo'), [['foo.js', 'modules.foo.types.Result.mean']]);
});

test('helpKeysInScripts: Template-Literal ohne bekannte Konstante bleibt unaufgelöst', () => {
  const root = fixture({ 'foo.js': 'const c = { help: `${prefix}Result.mean` };' });
  assert.deepEqual(helpKeysInScripts(root, 'foo'), []);
});

test('helpKeysInScripts: auskommentierte agentAction zählt nicht', () => {
  const root = fixture({ 'foo.js': "// agentAction: 'addItem'\n/* agentAction: 'removeItem' */" });
  assert.deepEqual(helpKeysInScripts(root, 'foo'), []);
});

test('anchorKeysOf: vereinigt Vorlage, Modul-JS, geteilten Baustein und die Familie des Moduls', async () => {
  const root = fixture({
    'foo.html': '<label data-help-key="modules.foo.fields.a.help">A</label>',
    'foo.js': "const x = { helpKey: 'modules.foo.actions.setA.help' };",
  }, "const s = { help: 'modules.shared.types.Stats.mean' };");
  const families = [
    { moduleId: 'foo', keys: async () => ['modules.foo.types.Bound.k'] },
    { moduleId: 'bar', keys: () => ['modules.bar.types.Other.k'] },
  ];
  const keys = await anchorKeysOf(root, 'foo', families);
  assert.deepEqual([...keys].sort(), [
    'modules.foo.actions.setA.help', 'modules.foo.fields.a.help',
    'modules.foo.types.Bound.k', 'modules.shared.types.Stats.mean',
  ]);
});

test('helpKeysInScripts: agentAction mit Teil-Viewmodel und Schlüssel aus viewmodel/ werden gefunden', () => {
  const root = fixture({ 'foo.js': "actions: [{ icon: 'action.add', agentAction: 'draft.addQuestion', onClick: (d) => d.draft.addQuestion() }]" });
  mkdirSync(join(root, 'js', 'modules', 'foo', 'viewmodel'), { recursive: true });
  writeFileSync(join(root, 'js', 'modules', 'foo', 'viewmodel', 'draft.js'), "const x = { helpKey: 'modules.foo.types.Fields.title' };");
  assert.deepEqual(helpKeysInScripts(root, 'foo'), [
    ['foo.js', 'modules.foo.actions.draft.addQuestion.help'],
    ['viewmodel/draft.js', 'modules.foo.types.Fields.title'],
  ]);
});
