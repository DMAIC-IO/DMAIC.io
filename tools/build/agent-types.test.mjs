/**
 * Typkarte der Agentenfläche (tools/build/agent-types.mjs).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderAgentTypes, resolveTypeText } from './agent-types.mjs';
import { typecheck } from './typecheck.mjs';
import { APP_DIR } from './build.mjs';

/** Ein Parameter der Altform. */
const p = (name, type, optional = false) => ({ name, type, optional, help: '' });

/** Registry-Ausschnitt: ein Altform-Modul und ein umgestelltes Modul. */
const MODULES = {
  worksheet: {
    available: true,
    actions: {
      read: { params: [p('options', 'object', true)], returns: 'AgentRead' },
      setCells: { params: [p('sheetId', 'string'), p('columnId', 'string'), p('startRow', 'number'), p('values', 'any[]')], returns: 'number' },
      addColumn: { params: [p('sheetId', 'string'), p('position', 'number', true)], returns: 'string' },
      sortRows: { params: [p('sheetId', 'string'), p('columnId', 'string'), p('direction', "'asc'|'desc'")], returns: 'boolean' },
      linkSource: { params: [p('ref', 'ColumnRef'), p('opts', '{ a: string }|null')], returns: 'void' },
    },
  },
  sipoc: {
    available: true,
    schema: true,
    actions: {
      read: { params: [p('options', 'object', true)], returns: 'AgentRead' },
      addItem: { target: 'model', keysOf: 'addItem', params: [p('command', 'object')], returns: 'number' },
      pickChart: { target: 'viewmodel', params: [p('command', 'object')], returns: 'void' },
      compute: { target: 'asyncTask', params: [p('command', 'object')], returns: 'void' },
      'compute.cancel': { target: 'asyncTask', params: [], returns: 'void' },
    },
  },
  'not-ready': { available: false, actions: { read: { params: [p('options', 'object', true)] } } },
};

/** Der Text einer Typedef aus der erzeugten Datei. */
function typedefText(out, name) {
  const m = new RegExp(`@typedef \\{([^\\n]*)\\} ${name}\\n`).exec(out);
  return m ? m[1] : null;
}

test('legacy action becomes call typedef with tuple', () => {
  const out = renderAgentTypes(MODULES);
  const t = typedefText(out, 'ModuleCall_worksheet_setCells');
  assert.ok(t, out);
  assert.match(t, /op: 'instance\.call'/);
  assert.match(t, /module: 'worksheet'/);
  assert.match(t, /instance: InstanceRef/);
  assert.match(t, /method: 'setCells'/);
  assert.match(t, /args\?: \[string, string, number, any\[\]\]/);
  assert.match(out, /^export \{\};$/m);
});

test('optional param becomes optional tuple element', () => {
  const out = renderAgentTypes(MODULES);
  assert.match(typedefText(out, 'ModuleCall_worksheet_addColumn'), /args\?: \[string, number\?\]/);
  assert.match(typedefText(out, 'ModuleCall_worksheet_read'), /args\?: \[object\?\]/);
  assert.match(typedefText(out, 'ModuleCall_worksheet_sortRows'), /args\?: \[string, string, 'asc'\|'desc'\]/);
});

test('viewmodel and asyncTask actions are excluded', () => {
  const out = renderAgentTypes(MODULES);
  assert.ok(typedefText(out, 'ModuleCall_sipoc_addItem'));
  assert.ok(typedefText(out, 'ModuleCall_sipoc_read'));
  assert.equal(typedefText(out, 'ModuleCall_sipoc_pickChart'), null);
  assert.equal(typedefText(out, 'ModuleCall_sipoc_compute'), null);
  assert.doesNotMatch(out, /compute/);
  // Nicht verfügbare Module haben keine Aufrufe, lassen sich aber anlegen.
  assert.doesNotMatch(out, /ModuleCall_notReady/);
  assert.match(typedefText(out, 'ModuleAction'), /op: 'module\.add', id\?: string, module: 'not-ready'\|'sipoc'\|'worksheet', phase\?: string/);
});

test('model action and instance.set use the generated model types', () => {
  const out = renderAgentTypes(MODULES);
  const types = ['import', "('../../modules/sipoc/domain/model.types.js')"].join('');
  assert.ok(typedefText(out, 'ModuleCall_sipoc_addItem').includes(`args?: [${types}.AddItemCommand]`));
  const set = typedefText(out, 'ModuleSet_sipoc');
  assert.ok(set.includes(`values: Partial<${types}.StateFields>`), set);
  assert.match(set, /op: 'instance\.set', id\?: string, module: 'sipoc', instance: InstanceRef/);
  assert.equal(typedefText(out, 'ModuleSet_worksheet'), null);
  assert.match(typedefText(out, 'ModuleStack'), /^ModuleAction\[\]$/);
  assert.match(typedefText(out, 'InstanceRef'), /^string \| \{ \$from: string, path: string \}$/);
});

test('unresolvable typedef falls back to any', () => {
  const out = renderAgentTypes(MODULES);
  assert.match(typedefText(out, 'ModuleCall_worksheet_linkSource'), /args\?: \[any, any\]/);
  assert.equal(resolveTypeText('unknown'), 'any');
  assert.equal(resolveTypeText('Foo|string'), 'any');
  assert.equal(resolveTypeText('Array<number>'), 'number[]');
  assert.equal(resolveTypeText('?number'), 'number|null');
  assert.equal(resolveTypeText("('a'|'b')[]"), "('a'|'b')[]");
  assert.equal(resolveTypeText('number|string|null'), 'number|string|null');
  assert.equal(resolveTypeText('Array<{ a: string }>'), 'any');
});

/**
 * Eine Wegwerf-App mit der Typkarte und einem Aufrufer.
 * @param {string} stack Quelltext des Stapels
 * @returns {string[]} Befunde im Aufrufer
 */
function checkCaller(stack) {
  const root = mkdtempSync(join(tmpdir(), 'agent-types-'));
  const legacy = { worksheet: MODULES.worksheet };
  mkdirSync(join(root, 'js', 'core', 'agent'), { recursive: true });
  writeFileSync(join(root, 'js', 'core', 'agent', 'agent-types.generated.js'), renderAgentTypes(legacy));
  const typeRef = ['import', "('./agent/agent-types.generated.js').ModuleStack"].join('');
  const caller = join(root, 'js', 'core', 'caller.js');
  writeFileSync(caller, `/** @type {${typeRef}} */\nexport const stack = ${stack};\n`);
  return typecheck([caller]);
}

test('gate: wrong method name is a finding', () => {
  const findings = checkCaller("[{ op: 'instance.call', module: 'worksheet', instance: 'w1', method: 'setCelz', args: ['s', 'c', 0, [1]] }]");
  assert.ok(findings.length > 0, 'erwartet einen Befund');
  assert.match(findings[0], /caller\.js\(2,/);
});

test('gate: matching call is clean', () => {
  const findings = checkCaller("[{ op: 'instance.call', module: 'worksheet', instance: 'w1', method: 'setCells', args: ['s', 'c', 0, [1]] }, { op: 'module.add', id: 'ws', module: 'worksheet' }, { op: 'instance.call', module: 'worksheet', instance: { $from: 'ws', path: 'instanceId' }, method: 'addColumn', args: ['s'] }]");
  assert.deepEqual(findings, []);
});

test('gate: wrong argument type is a finding', () => {
  const findings = checkCaller("[{ op: 'instance.call', module: 'worksheet', instance: 'w1', method: 'setCells', args: ['s', 'c', '0', [1]] }]");
  assert.ok(findings.length > 0, 'erwartet einen Befund');
});

test('real map: generated file resolves all model types', () => {
  assert.deepEqual(typecheck([join(APP_DIR, 'js', 'core', 'agent', 'agent-types.generated.js')]), []);
});

test('real map: model command and instance.set are checked', () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-types-real-'));
  const typeRef = ['import', `('${join(APP_DIR, 'js', 'core', 'agent', 'agent-types.generated.js')}').ModuleStack`].join('');
  const write = (name, stack) => {
    const file = join(root, name);
    writeFileSync(file, `/** @type {${typeRef}} */\nexport const stack = ${stack};\n`);
    return file;
  };
  const good = write('good.js', "[{ op: 'instance.call', module: 'sipoc', instance: 'a', method: 'addItem', args: [{ col: 'inputs', text: 'x' }] }, { op: 'instance.set', module: 'sipoc', instance: 'a', values: { columns: { suppliers: [], inputs: [], process: [], outputs: [], customers: [] } } }]");
  const badCol = write('bad-col.js', "[{ op: 'instance.call', module: 'sipoc', instance: 'a', method: 'addItem', args: [{ col: 'nope', text: 'x' }] }]");
  const badSet = write('bad-set.js', "[{ op: 'instance.set', module: 'sipoc', instance: 'a', values: { colums: 1 } }]");
  const viewmodel = write('viewmodel.js', "[{ op: 'instance.call', module: 'chart-suggestion', instance: 'a', method: 'pickChart', args: [{}] }]");
  assert.deepEqual(typecheck([good]), []);
  for (const f of [badCol, badSet, viewmodel]) assert.ok(typecheck([f]).length > 0, f);
});
