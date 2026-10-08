import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectAgentData, renderAgentRegistryModule } from './agent-data.mjs';

/** Build a throwaway app dir: { '<id>': { '<file>': '<body>' } }. */
function fixture(modules) {
  const root = mkdtempSync(join(tmpdir(), 'agent-'));
  for (const [id, files] of Object.entries(modules)) {
    const dir = join(root, 'js', 'modules', id);
    mkdirSync(dir, { recursive: true });
    for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  }
  return root;
}

const TAGGED_VM = `/**
 * Foo module.
 * @agent
 */
import { createModule } from '../../core/template-module.js';
export default createModule({
  config: { id: 'foo' },
  Model: State,
  data(module, _t) {
    return {
      /**
       * Read the full state.
       * @agent
       * @returns {object} the state
       */
      read() { return {}; },
      /**
       * @agent
       * @param {string} text - the problem statement
       * @returns {boolean} whether it was accepted
       */
      setProblem(text) { return true; },
      /** @noagent */
      cardClass(node) { return ''; },
      maxLevel: 5,
      _private() {},
    };
  },
});`;

const MODEL = `export class State {
  /** @type {string} the observed problem statement */
  problem = '';
  /** @type {object[]} branching tree of Why nodes */
  nodes = [];
  /**
   * @type {any[][]} the measured rows
   * @agentBulk
   */
  rows = [];
  /** @type {number} private counter */
  _idCounter = 0;
  toJSON() { return {}; }
}`;

test('collectAgentData: untagged module is listed but not available, without violations', () => {
  const root = fixture({ bar: { 'bar.js': 'export default createModule({ config: { id: "bar" }, data() { return { nope() {} }; } });', 'bar-model.js': MODEL } });
  const { modules, coverage } = collectAgentData(root);
  assert.equal(modules.bar.tagged, false);
  assert.equal(modules.bar.available, false);
  assert.deepEqual(modules.bar.violations, []);
  assert.deepEqual(coverage, { total: 1, available: 0 });
});

test('collectAgentData: tagged module with complete marks is available', () => {
  const root = fixture({ foo: { 'foo.js': TAGGED_VM, 'foo-model.js': MODEL } });
  const { modules, coverage } = collectAgentData(root);
  assert.equal(modules.foo.tagged, true);
  assert.deepEqual(modules.foo.violations, []);
  assert.equal(modules.foo.available, true);
  assert.deepEqual(coverage, { total: 1, available: 1 });
});

test('collectAgentData: only @agent methods become actions', () => {
  const root = fixture({ foo: { 'foo.js': TAGGED_VM, 'foo-model.js': MODEL } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(Object.keys(modules.foo.actions).sort(), ['read', 'setProblem']);
});

test('collectAgentData: params and returns are extracted with type and help', () => {
  const root = fixture({ foo: { 'foo.js': TAGGED_VM, 'foo-model.js': MODEL } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.actions.setProblem.params, [
    { name: 'text', type: 'string', optional: false, help: 'the problem statement' },
  ]);
  assert.equal(modules.foo.actions.setProblem.returns, 'boolean');
  assert.equal(modules.foo.actions.read.help, 'Read the full state.');
});

test('collectAgentData: non-function properties and _-prefixed methods need no mark', () => {
  const root = fixture({ foo: { 'foo.js': TAGGED_VM, 'foo-model.js': MODEL } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.violations, []);
  assert.equal('maxLevel' in modules.foo.actions, false);
  assert.equal('_private' in modules.foo.actions, false);
});

test('collectAgentData: an unmarked public method on a TAGGED module is a violation', () => {
  const vm = TAGGED_VM.replace('/** @noagent */\n      cardClass(node) { return \'\'; },', 'cardClass(node) { return \'\'; },');
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.violations, ['unmarked_method:cardClass']);
  assert.equal(modules.foo.available, false);
});

test('collectAgentData: an @agent method missing @param is a violation', () => {
  const vm = TAGGED_VM.replace('       * @param {string} text - the problem statement\n', '');
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.violations, ['missing_param:setProblem.text']);
});

test('collectAgentData: an @agent method missing @returns is a violation', () => {
  const vm = TAGGED_VM.replace('       * @returns {boolean} whether it was accepted\n', '');
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.violations, ['missing_returns:setProblem']);
});

test('collectAgentData: model fields carry type, help and the bulk mark; _-fields are dropped', () => {
  const root = fixture({ foo: { 'foo.js': TAGGED_VM, 'foo-model.js': MODEL } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.fields.problem, { type: 'string', help: 'the observed problem statement', bulk: false });
  assert.equal(modules.foo.fields.rows.bulk, true);
  assert.equal('_idCounter' in modules.foo.fields, false);
});

test('collectAgentData: a module without a model file still yields an entry with empty fields', () => {
  const root = fixture({ foo: { 'foo.js': TAGGED_VM } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.fields, {});
});

test('collectAgentData: directories without <id>.js are skipped', () => {
  const root = fixture({ foo: { 'foo.js': TAGGED_VM }, notamodule: { 'readme.md': '' } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(Object.keys(modules), ['foo']);
});

test('renderAgentRegistryModule emits a data-only module', () => {
  const text = renderAgentRegistryModule({
    modules: { foo: { tagged: true, available: true, violations: [], actions: {}, fields: {} } },
    coverage: { total: 1, available: 1 },
  });
  assert.match(text, /AUTO-GENERATED by tools\/build\/agent-data\.mjs/);
  assert.match(text, /export const AGENT_REGISTRY = /);
  assert.match(text, /export const AGENT_COVERAGE = /);
  assert.doesNotMatch(text, /^\s*import\s/m);
  assert.match(text, /"foo"/);
});

test('renderAgentRegistryModule is deterministic (sorted keys)', () => {
  const data = {
    modules: { zeta: { tagged: false, available: false, violations: [], actions: {}, fields: {} },
               alpha: { tagged: false, available: false, violations: [], actions: {}, fields: {} } },
    coverage: { total: 2, available: 0 },
  };
  const text = renderAgentRegistryModule(data);
  assert.ok(text.indexOf('"alpha"') < text.indexOf('"zeta"'));
  assert.equal(text, renderAgentRegistryModule(data));
});
