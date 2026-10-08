import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectAgentData, renderAgentRegistryModule, collectDomDetours } from './agent-data.mjs';
import ts from 'typescript';

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

/** Parse a JS snippet the way collectAgentData does. */
function sourceOf(code) {
  return ts.createSourceFile('x.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
}

test('collectDomDetours: innerHTML write is a detour', () => {
  const hits = collectDomDetours(sourceOf('function f(el) { el.innerHTML = "<b>x</b>"; }'));
  assert.equal(hits.length, 1);
  assert.match(hits[0], /^dom_detour:innerHTML@1$/);
});

test('collectDomDetours: outerHTML write is a detour', () => {
  assert.equal(collectDomDetours(sourceOf('function f(el) { el.outerHTML = ""; }')).length, 1);
});

test('collectDomDetours: dataset write is a detour and names the key', () => {
  const hits = collectDomDetours(sourceOf('function f(el) { el.dataset.orgId = "7"; }'));
  assert.equal(hits.length, 1);
  assert.match(hits[0], /^dom_detour:dataset\.orgId@1$/);
});

test('collectDomDetours: a dataset READ is not a detour', () => {
  assert.deepEqual(collectDomDetours(sourceOf('function f(el) { return el.dataset.orgId; }')), []);
});

test('collectDomDetours: uncontrolled-input buffers are NOT detours', () => {
  // The prevailing idiom in this codebase: commit to the model, then
  // normalise the input display. 52/72 modules do this legitimately.
  const code = 'function f(el) { el.value = ""; el.textContent = "3.14"; el.checked = true; }';
  assert.deepEqual(collectDomDetours(sourceOf(code)), []);
});

test('collectDomDetours: presentation writes are NOT detours', () => {
  const code = 'function f(el) { el.style.height = "0px"; el.classList.add("x"); el.scrollTop = 0; }';
  assert.deepEqual(collectDomDetours(sourceOf(code)), []);
});

test('collectAgentData: a DOM detour counts as a violation on a TAGGED module', () => {
  const vm = TAGGED_VM.replace('      maxLevel: 5,', `      /** @noagent */
      paint(el) { el.innerHTML = ""; },
      maxLevel: 5,`);
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
  const { modules } = collectAgentData(root);
  assert.equal(modules.foo.available, false);
  assert.ok(modules.foo.violations.some(v => v.startsWith('dom_detour:innerHTML')),
    `expected a dom_detour violation, got ${JSON.stringify(modules.foo.violations)}`);
});

test('collectAgentData: a DOM detour on an UNTAGGED module is reported but not a violation', () => {
  const vm = 'export default createModule({ config: { id: "bar" }, data() { return { paint(el) { el.innerHTML = ""; } }; } });';
  const root = fixture({ bar: { 'bar.js': vm } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.bar.violations, []);
  assert.ok(modules.bar.reported.some(v => v.startsWith('dom_detour:innerHTML')));
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

// ── Review-Befund I6/P1: der Generator war für 21 von 72 Modulen blind ──
// Ein Spread im `data()`-Literal und ein fehlendes Return-Literal fielen
// LAUTLOS durch. Ein solches Modul hätte das Modul-Tag bekommen, mit null
// Verstößen durch den Build gehen und `available: true` werden können,
// während zwanzig echte Viewmodel-Methoden nie begutachtet wurden.

test('collectAgentData: a spread in the data() literal is a violation (mixin methods are invisible)', () => {
  const vm = TAGGED_VM.replace('      maxLevel: 5,', `      ...chartModuleLifecycle(module),
      maxLevel: 5,`);
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.violations, ['unresolved_spread:chartModuleLifecycle(module)']);
  assert.equal(modules.foo.available, false);
});

test('collectAgentData: a multi-line spread expression is reported on one line', () => {
  const vm = TAGGED_VM.replace('      maxLevel: 5,', `      ...draggablePopout(
        module,
      ),
      maxLevel: 5,`);
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.violations, ['unresolved_spread:draggablePopout( module, )']);
});

test('collectAgentData: a spread on an UNTAGGED module is reported but not a violation', () => {
  const vm = 'export default createModule({ config: { id: "bar" }, data(module) { return { ...renderMethods }; } });';
  const root = fixture({ bar: { 'bar.js': vm } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.bar.violations, []);
  assert.deepEqual(modules.bar.reported, ['unresolved_spread:renderMethods']);
});

test('collectAgentData: a data() without a return literal is a violation, not silence', () => {
  const vm = `/**
 * Foo module.
 * @agent
 */
export default createModule({
  config: { id: 'foo' },
  data(module, _t) {
    return buildViewmodel(module);
  },
});`;
  const root = fixture({ foo: { 'foo.js': vm } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.violations, ['unresolvable_data_literal']);
  assert.equal(modules.foo.available, false);
  assert.deepEqual(modules.foo.actions, {});
});

test('collectAgentData: a missing data() literal on an UNTAGGED module does not block the build', () => {
  const vm = 'export default createModule({ config: { id: "bar" }, data(module) { return build(module); } });';
  const root = fixture({ bar: { 'bar.js': vm } });
  const { modules, coverage } = collectAgentData(root);
  assert.deepEqual(modules.bar.violations, []);
  assert.deepEqual(modules.bar.reported, ['unresolvable_data_literal']);
  assert.deepEqual(coverage, { total: 1, available: 0 });
});
