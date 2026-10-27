import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { countHelpAnchorCoverage } from './help-anchor-coverage.mjs';
import { collectAgentData } from './agent-data.mjs';
import { APP_DIR } from './build.mjs';

/** App-Baum mit einer Vorlage je Modul: `{ foo: '<label …>' }`. */
function fixture(templates, shared = '') {
  const root = mkdtempSync(join(tmpdir(), 'help-anchor-coverage-'));
  mkdirSync(join(root, 'js', 'core'), { recursive: true });
  writeFileSync(join(root, 'js', 'core', 'stats-panel.js'), shared);
  for (const [id, html] of Object.entries(templates)) {
    mkdirSync(join(root, 'js', 'modules', id), { recursive: true });
    writeFileSync(join(root, 'js', 'modules', id, `${id}.html`), html);
  }
  return root;
}
const anchor = (key) => `<label data-help-key="${key}">x</label>`;
const run = (root, modules, exemptions = {}) => countHelpAnchorCoverage(root, modules, exemptions, []);

test('direkt verankerte Aktion und direkt verankertes Feld zählen, der Rest ist Lücke', async () => {
  const root = fixture({ foo: anchor('modules.foo.actions.addA.help') + anchor('modules.foo.fields.a.help') });
  const out = await run(root, { foo: { available: true,
    actions: { addA: {}, removeA: {} }, fields: { a: {}, b: {} } } });
  assert.deepEqual([out.total, out.covered, out.exempt], [4, 2, 0]);
  assert.deepEqual(out.missing, ['foo: actions.removeA', 'foo: fields.b']);
  assert.deepEqual(out.perModule.foo, { total: 4, covered: 2, exempt: 0 });
});

test('ein geteilter Schlüssel (modules.shared.…) verankert', async () => {
  const root = fixture({ foo: anchor('modules.shared.fields.a.help') });
  const out = await run(root, { foo: { available: true, actions: {}, fields: { a: {} } } });
  assert.deepEqual(out.missing, []);
});

test('über Kinder: Feld und Aktion mit Typedef gelten als verankert, wenn ein Typedef-Schlüssel verankert ist', async () => {
  const root = fixture({ foo: anchor('modules.foo.types.Result.mean') + anchor('modules.foo.types.Params.alpha') });
  const out = await run(root, { foo: { available: true,
    actions: { setParam: { keysOf: 'Params', keys: { alpha: {}, beta: {} } } },
    fields: { result: { keysOf: 'Result', keys: { mean: {}, sd: {} } } } } });
  assert.deepEqual(out.missing, []);
});

test('Spiegel-Feld: ein Feld, das einen Setter-Schlüssel spiegelt, ist über types.<T>.<feld> verankert', async () => {
  const root = fixture({ foo: anchor('modules.foo.types.Params.alpha') });
  const out = await run(root, { foo: { available: true,
    actions: { setParam: { keysOf: 'Params', keys: { alpha: {}, beta: {} } } },
    fields: { alpha: {}, beta: {} } } });
  assert.deepEqual(out.missing, ['foo: fields.beta']);
});

test('Ausnahmen: modulweit und "*" decken eine Lücke und zählen als ausgenommen', async () => {
  const root = fixture({ foo: '', bar: '' });
  const out = await run(root, {
    foo: { available: true, actions: { read: {}, moveA: {} }, fields: {} },
    bar: { available: true, actions: { read: {} }, fields: {} },
  }, {
    '*': [{ name: 'actions.read', reason: 'Agentenzugriff' }],
    foo: [{ name: 'actions.moveA', reason: 'Ziehen statt Tippen' }],
  });
  assert.deepEqual([out.total, out.covered, out.exempt], [3, 3, 3]);
  assert.deepEqual(out.missing, []);
  assert.deepEqual(out.staleExemptions, []);
});

test('Ausnahme ohne Treffer: unbekannter Name, inzwischen verankert, "*" ohne Lücke', async () => {
  const root = fixture({ foo: anchor('modules.foo.actions.moveA.help') });
  const out = await run(root, { foo: { available: true, actions: { moveA: {} }, fields: {} } }, {
    '*': [{ name: 'fields.positions', reason: 'nur Agent' }],
    foo: [
      { name: 'actions.moveA', reason: 'Ziehen' },
      { name: 'actions.gone', reason: 'alt' },
    ],
  });
  assert.equal(out.exempt, 0);
  assert.deepEqual(out.staleExemptions.sort(), ['*: fields.positions', 'foo: actions.gone', 'foo: actions.moveA']);
});

test('eine Ausnahme ohne Grund wirft', async () => {
  const root = fixture({ foo: '' });
  await assert.rejects(
    run(root, { foo: { available: true, actions: { read: {} }, fields: {} } }, { '*': [{ name: 'actions.read', reason: ' ' }] }),
    /ohne Grund/,
  );
});

test('nicht freigegebene Module und Module ohne Ordner zählen nicht', async () => {
  const root = fixture({ foo: '' });
  const out = await run(root, {
    foo: { available: false, actions: { a: {} }, fields: {} },
    ghost: { available: true, actions: { a: {} }, fields: {} },
  });
  assert.deepEqual([out.total, out.missing], [0, []]);
});

test('echter Baum: läuft durch und liefert eine plausible Zahl (berichtend, kein Lücken-Gate)', async () => {
  const { modules } = collectAgentData(APP_DIR);
  const out = await countHelpAnchorCoverage(APP_DIR, modules);
  assert.ok(out.total > 0);
  assert.ok(out.covered <= out.total);
  assert.ok(out.exempt <= out.covered);
});

test('eine Aktion eines Teil-Viewmodels ist über ihren Punkt-Schlüssel verankert', async () => {
  const root = fixture({ foo: anchor('modules.foo.actions.draft.addQuestion.help') });
  const out = await run(root, { foo: { available: true,
    actions: { 'draft.addQuestion': {}, 'draft.deleteQuestion': {} }, fields: {} } });
  assert.deepEqual(out.missing, ['foo: actions.draft.deleteQuestion']);
});
