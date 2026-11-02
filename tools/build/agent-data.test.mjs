import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { collectAgentData, renderAgentRegistryModule, collectDomDetours, CREATING_VOID_EXEMPT,
         readAgentReadTypedef } from './agent-data.mjs';
import { lookup, helpExists, STRUCTURE_JARGON, typedefHelpSuffixes } from './agent-report.mjs';
import { helpKeysInTemplates, helpKeysInScripts, helpKeysInSharedSources,
  BOUND_HELP_KEY_FAMILIES } from './help-anchors.mjs';
import ts from 'typescript';

/**
 * Build a throwaway app dir.
 * @param {Record<string, Record<string, string>>} modules  { '<id>': { '<file>': '<body>' } }
 * @param {Record<string, string>} [extra]  weitere Dateien, Pfad relativ zur Wurzel
 *   (`'js/ui/mix.js'`) — damit ein Modul aus einem echten Mixin importieren kann.
 */
function fixture(modules, extra = {}) {
  const root = mkdtempSync(join(tmpdir(), 'agent-'));
  for (const [id, files] of Object.entries(modules)) {
    const dir = join(root, 'js', 'modules', id);
    mkdirSync(dir, { recursive: true });
    for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  }
  for (const [path, body] of Object.entries(extra)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  return root;
}

const TAGGED_VM = `/**
 * Foo module.
 * @agent
 */
import { createModule } from '../../core/template-module.js';
import { State } from './foo-model.js';
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
      setProblem(text) { this.model.problem = text; this.model.nodes = text; this.model.rows = text; return true; },
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
  assert.match(hits[0], /^dom_detour:innerHTML$/);
});

test('collectDomDetours: outerHTML write is a detour', () => {
  assert.equal(collectDomDetours(sourceOf('function f(el) { el.outerHTML = ""; }')).length, 1);
});

test('collectDomDetours: dataset write is a detour and names the key', () => {
  const hits = collectDomDetours(sourceOf('function f(el) { el.dataset.orgId = "7"; }'));
  assert.equal(hits.length, 1);
  assert.match(hits[0], /^dom_detour:dataset\.orgId$/);
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
  const vm = 'import { State } from "./bar-model.js"; export default createModule({ config: { id: "bar" }, Model: State, data(module) { return { ...renderMethods }; } });';
  const root = fixture({ bar: { 'bar.js': vm, 'bar-model.js': 'export class State { toJSON() { return {}; } }' } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.bar.violations, []);
  assert.deepEqual(modules.bar.reported, ['unresolved_spread:renderMethods']);
});

test('collectAgentData: a data() without a return literal is a violation, not silence', () => {
  const vm = `/**
 * Foo module.
 * @agent
 */
import { State } from './foo-model.js';
export default createModule({
  config: { id: 'foo' },
  Model: State,
  data(module, _t) {
    return buildViewmodel(module);
  },
});`;
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': 'export class State { toJSON() { return {}; } }' } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.violations, ['unresolvable_data_literal']);
  assert.equal(modules.foo.available, false);
  assert.deepEqual(modules.foo.actions, {});
});

test('collectAgentData: a missing data() literal on an UNTAGGED module does not block the build', () => {
  const vm = 'import { State } from "./bar-model.js"; export default createModule({ config: { id: "bar" }, Model: State, data(module) { return build(module); } });';
  const root = fixture({ bar: { 'bar.js': vm, 'bar-model.js': 'export class State { toJSON() { return {}; } }' } });
  const { modules, coverage } = collectAgentData(root);
  assert.deepEqual(modules.bar.violations, []);
  assert.deepEqual(modules.bar.reported, ['unresolvable_data_literal']);
  assert.deepEqual(coverage, { total: 1, available: 0 });
});

// ── Mixin-Auflösung ────────────────────────────────────────────────────────
// 21 von 72 Modulen holen Viewmodel-Methoden aus einem Mixin oder haben kein
// Return-Literal an der Stelle. Nur zu melden, was man nicht sieht, genügt
// nicht: vor der ersten Freigabe muss der Generator diese Methoden AUFLÖSEN,
// sonst wird ein Modul als verfügbar gemeldet und hat null Aktionen.

/** Ein Mixin wie `chartModuleLifecycle`: Fabrik mit Konfigurationsobjekt. */
const MIXIN = `/** Shared chart lifecycle. */
export function mixFactory(module, cfg) {
  const { mountPicker } = cfg;
  return {
    /**
     * Push a step.
     * @agent
     * @param {string} title - the step title
     * @returns {void} nothing
     */
    pushStep(title) {},
    /** @noagent */
    init() { mountPicker.call(this); },
    _hidden() {},
    themeMode: 'render',
  };
}

export const mixConst = {
  /**
   * Rename a step.
   * @agent
   * @param {string} name - the new step name
   * @returns {boolean} whether it was renamed
   */
  renameStep(name) { return true; },
  /** @noagent */
  paint() {},
};
`;

/** Ein Viewmodel, das `extra` zwischen die eigenen Mitglieder spreizt. */
function vmWith(spread, imports = `import { mixFactory, mixConst } from '../../ui/mix.js';`) {
  return TAGGED_VM
    .replace(`import { createModule } from '../../core/template-module.js';`,
      `import { createModule } from '../../core/template-module.js';\n${imports}`)
    .replace('      maxLevel: 5,', `      ${spread}\n      maxLevel: 5,`);
}

test('collectAgentData: a spread of an imported factory call resolves its methods', () => {
  const root = fixture(
    { foo: { 'foo.js': vmWith('...mixFactory(module, { mountPicker() {} }),'), 'foo-model.js': MODEL } },
    { 'js/ui/mix.js': MIXIN },
  );
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.violations, []);
  assert.deepEqual(Object.keys(modules.foo.actions).sort(), ['pushStep', 'read', 'setProblem']);
  assert.deepEqual(modules.foo.actions.pushStep.params, [
    { name: 'title', type: 'string', optional: false, help: 'the step title' },
  ]);
  assert.equal(modules.foo.available, true);
});

test('collectAgentData: the config object handed to a factory contributes no members', () => {
  // `mountPicker` ist ein Argument, das die Fabrik VERBRAUCHT — es landet nicht
  // auf dem Viewmodel und darf daher weder Aktion noch Verstoß werden.
  const root = fixture(
    { foo: { 'foo.js': vmWith('...mixFactory(module, { mountPicker() {} }),'), 'foo-model.js': MODEL } },
    { 'js/ui/mix.js': MIXIN },
  );
  const { modules } = collectAgentData(root);
  assert.equal('mountPicker' in modules.foo.actions, false);
  assert.deepEqual(modules.foo.reported.filter(v => v.includes('mountPicker')), []);
});

test('collectAgentData: an unmarked mixin method is a violation that names its origin', () => {
  const mixin = MIXIN.replace('    /** @noagent */\n    init()', '    init()');
  const root = fixture(
    { foo: { 'foo.js': vmWith('...mixFactory(module, { mountPicker() {} }),'), 'foo-model.js': MODEL } },
    { 'js/ui/mix.js': mixin },
  );
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.violations, ['unmarked_method:init@js/ui/mix.js']);
});

test('collectAgentData: a spread of an imported object constant resolves its methods', () => {
  const root = fixture(
    { foo: { 'foo.js': vmWith('...mixConst,'), 'foo-model.js': MODEL } },
    { 'js/ui/mix.js': MIXIN },
  );
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.violations, []);
  assert.equal('paint' in modules.foo.actions, false);
  // Positiv belegt, nicht nur „kein Verstoß": die @agent-Methode der Konstante
  // muss als Aktion mit Parametern und Ergebnisform auftauchen.
  assert.deepEqual(Object.keys(modules.foo.actions).sort(), ['read', 'renameStep', 'setProblem']);
  assert.deepEqual(modules.foo.actions.renameStep.params, [
    { name: 'name', type: 'string', optional: false, help: 'the new step name' },
  ]);
  assert.equal(modules.foo.actions.renameStep.returns, 'boolean');
  assert.equal(modules.foo.actions.renameStep.help, 'Rename a step.');
});

test('collectAgentData: a spread of a local constant holding a factory call resolves', () => {
  // Das Muster von process-map: `const _core = chainViewMixin(…)` im `data()`,
  // danach `..._core` plus Aufrufe von `_core.x.call(this)`.
  const vm = vmWith('..._core,').replace('  data(module, _t) {\n    return {',
    '  data(module, _t) {\n    const _core = mixFactory(module, { mountPicker() {} });\n    return {');
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } }, { 'js/ui/mix.js': MIXIN });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.violations, []);
  assert.ok('pushStep' in modules.foo.actions);
});

test('collectAgentData: a member of the module overrides the mixin member of the same name', () => {
  const vm = vmWith(`...mixFactory(module, { mountPicker() {} }),
      /**
       * @agent
       * @param {string} title - the local title
       * @returns {string} the id
       */
      pushStep(title) { return 'x'; },`);
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } }, { 'js/ui/mix.js': MIXIN });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.violations, []);
  assert.equal(modules.foo.actions.pushStep.returns, 'string');
  assert.equal(modules.foo.actions.pushStep.params[0].help, 'the local title');
});

test('collectAgentData: a data() that names a local function resolves its return literal', () => {
  // Das Muster von activity-flowchart: `data: activityFlowchartData` mit einer
  // exportierten Funktion, damit die Ansichtstransformationen testbar sind.
  const vm = `/**
 * Foo module.
 * @agent
 */
import { State } from './foo-model.js';
export default createModule({
  config: { id: 'foo' },
  Model: State,
  data: fooData,
});

export function fooData(module, _t) {
  return {
    /**
     * Read the full state.
     * @agent
     * @returns {object} the state
     */
    read() { return {}; },
    /**
     * Set the observed problem statement.
     * @agent
     * @param {string} text - the problem statement
     * @returns {void}
     */
    setProblem(text) { this.model.problem = text; this.model.nodes = text; this.model.rows = text; },
  };
}`;
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.violations, []);
  assert.deepEqual(Object.keys(modules.foo.actions), ['read', 'setProblem']);
});

test('collectAgentData: a nested spread inside a mixin resolves too', () => {
  const inner = `export const innerMix = {
  /**
   * Drop a step.
   * @agent
   * @returns {void} nothing
   */
  dropStep() {},
};
`;
  const outer = `import { innerMix } from './inner.js';
export function mixFactory(module, cfg) {
  return { ...innerMix };
}
`;
  const root = fixture(
    { foo: { 'foo.js': vmWith('...mixFactory(module, {}),', `import { mixFactory } from '../../ui/mix.js';`), 'foo-model.js': MODEL } },
    { 'js/ui/mix.js': outer, 'js/ui/inner.js': inner },
  );
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.violations, []);
  assert.ok('dropStep' in modules.foo.actions);
});

test('collectAgentData: a self-referential mixin terminates instead of looping', () => {
  const mixin = `export const loopMix = {
  ...loopMix,
  /** @noagent */
  paint() {},
};
`;
  const root = fixture(
    { foo: { 'foo.js': vmWith('...loopMix,', `import { loopMix } from '../../ui/mix.js';`), 'foo-model.js': MODEL } },
    { 'js/ui/mix.js': mixin },
  );
  const { modules } = collectAgentData(root);
  assert.equal('paint' in modules.foo.actions, false);
  assert.deepEqual(modules.foo.violations, []);
});

test('collectAgentData: a spread whose source stays unresolvable is still reported', () => {
  const root = fixture({ foo: { 'foo.js': vmWith('...fromNowhere(module),', ''), 'foo-model.js': MODEL } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.violations, ['unresolved_spread:fromNowhere(module)']);
});

// ── Task 3: `extends` und annotierte Konstruktor-Zuweisungen ──────────────
// Vier Flowchart-Module hatten NULL Model-Felder: ihre Modelle erben von
// `FlowchartState`, und dessen einziges Zustandsfeld (`this.steps`) steht im
// Konstruktor. Beide Lücken mussten zugleich fallen — `extends` allein hätte
// nur eine Klasse ohne Property-Deklarationen gefunden.

/** Ein Modul-Viewmodel ohne Verstöße, damit nur die Model-Seite geprüft wird. */
const CLEAN_VM = `/**
 * Foo module.
 * @agent
 */
import { State } from './foo-model.js';
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
       * Set the observed problem statement.
       * @agent
       * @param {string} text - the problem statement
       * @returns {void}
       */
      setProblem(text) { this.model.problem = text; this.model.nodes = text; this.model.rows = text; },
    };
  },
});`;

/** Dasselbe Viewmodel für ein Model mit dem Feld `count`. */
const COUNT_VM = CLEAN_VM.replace('this.model.problem = text; this.model.nodes = text; this.model.rows = text;', 'this.model.count = text;');

/** Das getaggte Viewmodel für ein Model mit dem Feld `title`. */
const TITLE_VM = TAGGED_VM.replace('this.model.problem = text; this.model.nodes = text; this.model.rows = text;', 'this.model.title = text;');

/**
 * Das getaggte Viewmodel für ein Model mit dem Feld `params`: Der Setter schreibt
 * das Feld als Ganzes, eine Bindung auf `params.alpha` deckt er nicht ab.
 */
const WHOLE_PARAMS_VM = TAGGED_VM.replace('this.model.problem = text; this.model.nodes = text; this.model.rows = text;', 'this.model.params = text;');

/** Dasselbe Viewmodel ohne Modul-Tag — Befunde bleiben berichtend. */
const UNTAGGED_VM = CLEAN_VM.replace(' * @agent\n', '');

test('readModelFields: a subclass inherits the fields of its imported base class', () => {
  const base = `export class Base {
  /** @type {string} the base title */
  title = '';
}`;
  const model = `import { Base } from '../../core/b/base.js';
export class State extends Base {
  /** @type {number} the own counter */
  count = 0;
}`;
  const root = fixture(
    { foo: { 'foo.js': CLEAN_VM, 'foo-model.js': model } },
    { 'js/core/b/base.js': base },
  );
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.fields.title, { type: 'string', help: 'the base title', bulk: false });
  assert.deepEqual(modules.foo.fields.count, { type: 'number', help: 'the own counter', bulk: false });
});

test('readModelFields: an own field overrides the same-named base field', () => {
  const base = `export class Base {
  /** @type {string} the base title */
  title = '';
  /** @type {boolean} only on the base */
  flag = false;
}`;
  const model = `import { Base } from '../../core/b/base.js';
export class State extends Base {
  /** @type {number} the own title */
  title = 0;
}`;
  const root = fixture(
    { foo: { 'foo.js': CLEAN_VM, 'foo-model.js': model } },
    { 'js/core/b/base.js': base },
  );
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.fields.title, { type: 'number', help: 'the own title', bulk: false });
  // Ohne diese zweite Zusicherung wäre der Test auch dann grün, wenn die
  // Basisklasse überhaupt nicht gelesen würde.
  assert.equal(modules.foo.fields.flag.type, 'boolean');
});

test('readModelFields: two-step inheritance collects all three levels', () => {
  const a = `export class A {
  /** @type {string} from A */
  a = '';
}`;
  const b = `import { A } from './a.js';
export class B extends A {
  /** @type {string} from B */
  b = '';
}`;
  const model = `import { B } from '../../core/b/b.js';
export class State extends B {
  /** @type {string} from C */
  c = '';
}`;
  const root = fixture(
    { foo: { 'foo.js': CLEAN_VM, 'foo-model.js': model } },
    { 'js/core/b/a.js': a, 'js/core/b/b.js': b },
  );
  const { modules } = collectAgentData(root);
  assert.equal(modules.foo.fields.a.help, 'from A');
  assert.equal(modules.foo.fields.b.help, 'from B');
  assert.equal(modules.foo.fields.c.help, 'from C');
});

test('readModelFields: a base class in the SAME file is resolved, and the subclass still wins', () => {
  // Die Basisklasse steht ABSICHTLICH nach der Unterklasse: eine Zusammen-
  // führung „alle Klassen der Datei in Quellreihenfolge" hätte hier die
  // Basis gewinnen lassen.
  const model = `export class State extends Base {
  /** @type {number} the own title */
  title = 0;
}
export class Base {
  /** @type {string} the base title */
  title = '';
  /** @type {boolean} only on the base */
  flag = false;
}`;
  const root = fixture({ foo: { 'foo.js': CLEAN_VM, 'foo-model.js': model } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.fields.title, { type: 'number', help: 'the own title', bulk: false });
  assert.equal(modules.foo.fields.flag.type, 'boolean');
});

test('readModelFields: an annotated constructor assignment becomes a field', () => {
  const model = `export class State {
  constructor() {
    /** @type {Array<object>} ordered chain of steps */
    this.steps = [];
  }
}`;
  const root = fixture({ foo: { 'foo.js': CLEAN_VM, 'foo-model.js': model } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.fields.steps, {
    type: 'Array<object>', help: 'ordered chain of steps', bulk: false,
  });
});

test('readModelFields: a constructor assignment WITHOUT @type is not a field', () => {
  const model = `export class State {
  constructor() {
    /** just a cache */
    this.cache = null;
    this.other = 1;
  }
}`;
  const root = fixture({ foo: { 'foo.js': CLEAN_VM, 'foo-model.js': model } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.fields, {});
});

test('readModelFields: an annotated _-prefixed constructor assignment is not a field', () => {
  const model = `export class State {
  constructor() {
    /** @type {number} private counter */
    this._idCounter = 0;
  }
}`;
  const root = fixture({ foo: { 'foo.js': CLEAN_VM, 'foo-model.js': model } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.fields, {});
});

test('readModelFields: an annotated this-assignment in another METHOD is not a field', () => {
  const model = `export class State {
  reset() {
    /** @type {string} view buffer */
    this.buffer = '';
  }
}`;
  const root = fixture({ foo: { 'foo.js': CLEAN_VM, 'foo-model.js': model } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.fields, {});
});

test('readModelFields: an annotated this-assignment in a CALLBACK inside the constructor is not a field', () => {
  const model = `export class State {
  constructor() {
    /** @type {Array<object>} real field */
    this.steps = [];
    [1].forEach(() => {
      /** @type {number} not a field */
      this.late = 1;
    });
  }
}`;
  const root = fixture({ foo: { 'foo.js': CLEAN_VM, 'foo-model.js': model } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(Object.keys(modules.foo.fields), ['steps']);
});

test('readModelFields: @agentBulk on a constructor assignment is carried over', () => {
  const model = `export class State {
  constructor() {
    /**
     * @type {any[][]} the measured rows
     * @agentBulk
     */
    this.rows = [];
  }
}`;
  const root = fixture({ foo: { 'foo.js': CLEAN_VM, 'foo-model.js': model } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.fields.rows, {
    type: 'any[][]', help: 'the measured rows', bulk: true, bulkKind: 'table',
  });
});

test('readModelFields: a cycle in the extends chain terminates', () => {
  const base = `import { State } from '../../modules/foo/foo-model.js';
export class Base extends State {
  /** @type {string} from base */
  s = '';
}`;
  const model = `import { Base } from '../../core/b/base.js';
export class State extends Base {
  /** @type {number} from state */
  n = 0;
}`;
  const root = fixture(
    { foo: { 'foo.js': CLEAN_VM, 'foo-model.js': model } },
    { 'js/core/b/base.js': base },
  );
  const { modules } = collectAgentData(root);
  assert.equal(modules.foo.fields.n.help, 'from state');
  assert.equal(modules.foo.fields.s.help, 'from base');
});

test('readModelFields: an unresolvable base class is reported, and hard only with the module tag', () => {
  const model = `export class State extends Nowhere {
  /** @type {number} the own counter */
  count = 0;
}`;
  const soft = fixture({ foo: { 'foo.js': UNTAGGED_VM, 'foo-model.js': model } });
  const softResult = collectAgentData(soft).modules.foo;
  assert.deepEqual(softResult.violations, []);
  assert.ok(softResult.reported.includes('unresolved_base_class:Nowhere'),
    `expected unresolved_base_class, got ${JSON.stringify(softResult.reported)}`);
  // Die eigenen Felder bleiben trotzdem erhalten — ein unauflösbarer Vorfahr
  // macht die Klasse nicht unlesbar.
  assert.equal(softResult.fields.count.type, 'number');

  const hard = fixture({ foo: { 'foo.js': CLEAN_VM, 'foo-model.js': model } });
  const hardResult = collectAgentData(hard).modules.foo;
  assert.ok(hardResult.violations.includes('unresolved_base_class:Nowhere'));
  assert.equal(hardResult.available, false);
});

// ── Fix-Runde 1: die Model-Wurzel kommt aus `Model:` ─────────────────────
// Vorher mischte readModelFields ALLE Klassen der Model-Datei. Mit den
// Konstruktor-Zuweisungen wurde daraus ein echter Fehler: `rest-api` behauptete
// die Felder der Hilfsklasse `Endpoint` (`headers`, `mappings`), die auf dem
// Model-Objekt nicht existieren. Eine Registry, die Felder behauptet, die es
// nicht gibt, widerspricht dem Grundsatz „die Lesefläche IST die persistierte Form“.

test('readModelFields: a helper class in the model file contributes NOTHING', () => {
  const model = `export class Endpoint {
  constructor() {
    /** @type {Array<object>} request headers */
    this.headers = [];
  }
}
export class State {
  constructor() {
    /** @type {Endpoint[]} the configured endpoints */
    this.endpoints = [];
  }
}`;
  const root = fixture({ foo: { 'foo.js': CLEAN_VM, 'foo-model.js': model } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(Object.keys(modules.foo.fields), ['endpoints']);
});

test('readModelFields: a SUBCLASS of the model in the same file does not leak into the read surface', () => {
  // Das latente Risiko der alten `roots`-Heuristik: `State` wäre als „Basis
  // einer Klasse derselben Datei" herausgefallen und `Spezial` an ihre Stelle
  // getreten — mit Vorrang bei Namensgleichheit.
  const model = `export class State {
  /** @type {string} the real title */
  title = '';
}
export class Spezial extends State {
  /** @type {number} the special title */
  title = 0;
  /** @type {boolean} only on the subclass */
  extra = false;
}`;
  const root = fixture({ foo: { 'foo.js': CLEAN_VM, 'foo-model.js': model } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.fields, {
    title: { type: 'string', help: 'the real title', bulk: false },
  });
});

test('readModelFields: a missing Model member is reported, not silently empty', () => {
  const vm = CLEAN_VM.replace('  Model: State,\n', '');
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.fields, {});
  assert.ok(modules.foo.violations.includes('unresolvable_model_class'),
    `got ${JSON.stringify(modules.foo.violations)}`);
});

test('readModelFields: a computed Model value is reported as unresolvable', () => {
  const vm = CLEAN_VM.replace('  Model: State,', '  Model: makeModel(),');
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.violations, ['unresolvable_model_class']);
});

test('readModelFields: a Model name that resolves to something other than a class is reported', () => {
  const vm = CLEAN_VM
    .replace(`import { State } from './foo-model.js';`, 'const State = { steps: [] };')
    .replace(' * @agent\n', '');
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.fields, {});
  assert.deepEqual(modules.foo.reported, ['unresolved_model_class:State']);
  assert.deepEqual(modules.foo.violations, []);     // ohne Modul-Tag berichtend
});

test('readModelFields: the shorthand `{ Model }` names the class too', () => {
  const vm = CLEAN_VM.replace('  Model: State,', '  Model,').replace('{ State }', '{ State as Model }');
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
  const { modules } = collectAgentData(root);
  assert.equal(modules.foo.fields.problem.type, 'string');
  assert.deepEqual(modules.foo.violations, []);
});

test('readModelFields: a non-identifier extends clause is reported, not resolved', () => {
  const model = `export class State extends ns.Base {
  /** @type {number} the own counter */
  count = 0;
  toJSON() { return { count: this.count }; }
}`;
  const root = fixture({ foo: { 'foo.js': COUNT_VM, 'foo-model.js': model } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.violations, ['unresolved_base_class:ns.Base']);
  assert.equal(modules.foo.fields.count.type, 'number');
});

test('readModelFields: a mixin factory as base class is reported, not resolved', () => {
  const model = `export class State extends withSteps(Base) {
  /** @type {number} the own counter */
  count = 0;
  toJSON() { return { count: this.count }; }
}`;
  const root = fixture({ foo: { 'foo.js': COUNT_VM, 'foo-model.js': model } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.violations, ['unresolved_base_class:withSteps(Base)']);
});

test('readModelFields: a class that extends ITSELF terminates AND is reported', () => {
  // Der Abstieg endet weiterhin am Pfadschutz (keine Rekursion, die eigenen
  // Felder bleiben) — aber nicht mehr still: `class State extends State` ist
  // zur Laufzeit ein Wurf und damit ein Autorenfehler, kein Randfall.
  const model = `export class State extends State {
  /** @type {number} the own counter */
  count = 0;
  toJSON() { return { count: this.count }; }
}`;
  const root = fixture({ foo: { 'foo.js': COUNT_VM, 'foo-model.js': model } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.fields, {
    count: { type: 'number', help: 'the own counter', bulk: false },
  });
  assert.deepEqual(modules.foo.violations, ['self_inheriting_class:State']);
});

test('readModelFields: an extends chain beyond the depth limit is reported as a blind spot', () => {
  // 14 Klassen: `State` erbt C12 … C0. Der Abstieg endet vor C0, und das endet
  // nicht still — eine abgeschnittene Kette ist eine Blindstelle.
  const chain = ['export class C0 {\n  /** @type {string} deepest field */\n  deepest = \'\';\n}'];
  for (let i = 1; i <= 12; i++) chain.push(`export class C${i} extends C${i - 1} {}`);
  const model = `${chain.join('\n')}
export class State extends C12 {
  /** @type {number} the own counter */
  count = 0;
  toJSON() { return { count: this.count }; }
}`;
  const root = fixture({ foo: { 'foo.js': COUNT_VM, 'foo-model.js': model } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.violations, ['unresolved_base_class:C0']);
  assert.equal('deepest' in modules.foo.fields, false);
  assert.equal(modules.foo.fields.count.type, 'number');
});

test('readModelFields: a static class member is not a read field', () => {
  // `static VERSION` ist Schema-Metadatum der Klasse, kein Instanzzustand: es
  // steht in keinem `toJSON()` und würde der Registry ein Feld andichten, das
  // das Model nicht hält — genau der Widerspruch zur persistierten Form, den die
  // Model-Wurzel-Korrektur sonst behoben hat.
  const model = `export class State {
  /** @type {string} the schema version */
  static VERSION = '3';
  /** @type {string} the stored title */
  title = '';
}`;
  const root = fixture({ foo: { 'foo.js': CLEAN_VM, 'foo-model.js': model } });
  const { modules } = collectAgentData(root);
  assert.equal('VERSION' in modules.foo.fields, false,
    `static member leaked: ${JSON.stringify(Object.keys(modules.foo.fields))}`);
  assert.deepEqual(modules.foo.fields.title,
    { type: 'string', help: 'the stored title', bulk: false });
});

const AGENT_READ_VM = `/**
 * Bar module.
 * @agent
 */
import { createModule } from '../../core/template-module.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { State } from './bar-model.js';

/**
 * Die Agenten-Lesefläche dieses Moduls.
 * @typedef {object} AgentRead
 * @property {string} activeSheetId  id of the active sheet
 * @property {any[][]} rows  [bulk] every data row of the active sheet
 */
export default createModule({
  config: { id: 'bar' },
  Model: State,
  data(module, _t) {
    return {
      /**
       * @agent
       * @param {object} [options] field/row selection
       * @returns {AgentRead} the agent-facing read surface
       */
      read(options) { return readAgentState('bar', { activeSheetId: '', rows: [] }, options); },
      /**
       * Ein Schreibweg — ohne ihn greift module_tag_without_actions, und die
       * Fälle unten prüften die Lesefläche an einem gar nicht freigebbaren Modul.
       * @agent
       * @param {string} id - id of the sheet to activate
       * @returns {void}
       */
      activateSheet(id) {},
    };
  },
});`;

const BAR_MODEL = `export class State {
  /** @type {object[]} opaque per-sheet blobs */
  sheets = [];
  toJSON() { return { sheets: this.sheets }; }
}`;

test('collectAgentData: an AgentRead typedef REPLACES the model fields', () => {
  const root = fixture({ bar: { 'bar.js': AGENT_READ_VM, 'bar-model.js': BAR_MODEL } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(Object.keys(modules.bar.fields), ['activeSheetId', 'rows']);
  assert.equal(modules.bar.fields.activeSheetId.type, 'string');
  assert.equal(modules.bar.fields.activeSheetId.help, 'id of the active sheet');
  assert.equal(modules.bar.fields.activeSheetId.derived, true);
});

test('collectAgentData: the [bulk] sentinel marks a bulk field and leaves the help clean', () => {
  const root = fixture({ bar: { 'bar.js': AGENT_READ_VM, 'bar-model.js': BAR_MODEL } });
  const { modules } = collectAgentData(root);
  assert.equal(modules.bar.fields.rows.bulk, true);
  assert.equal(modules.bar.fields.rows.help, 'every data row of the active sheet');
  assert.equal(modules.bar.fields.activeSheetId.bulk, false);
});

test('collectAgentData: [bulk] heisst table, [bulk:tree] heisst tree, ohne Marke steht nichts da', () => {
  // Das Sentinel trug bisher nur „ja/nein". Welchen Umfangs-Deskriptor ein
  // Massenfeld bekommt (Zeilen+Spalten oder Knoten+Tiefe), stand nirgends —
  // ein Baum wurde als Tabelle beschrieben.
  const vm = AGENT_READ_VM.replace(
    ' * @property {any[][]} rows  [bulk] every data row of the active sheet\n',
    ' * @property {any[][]} rows  [bulk] every data row of the active sheet\n'
    + ' * @property {object[]} nodes  [bulk:tree] the question tree\n',
  );
  const root = fixture({ bar: { 'bar.js': vm, 'bar-model.js': BAR_MODEL } });
  const { modules } = collectAgentData(root);
  const fields = modules.bar.fields;

  assert.equal(fields.rows.bulk, true);
  assert.equal(fields.rows.bulkKind, 'table');
  assert.equal(fields.rows.help, 'every data row of the active sheet');
  assert.equal(fields.nodes.bulk, true);
  assert.equal(fields.nodes.bulkKind, 'tree');
  assert.equal(fields.nodes.help, 'the question tree');
  assert.equal(fields.activeSheetId.bulk, false);
  assert.equal(fields.activeSheetId.bulkKind, undefined);
  // An einem Nicht-Massenfeld steht der Schlüssel GAR NICHT — sonst stünde
  // in der erzeugten Registry an jedem Feld etwas, wo nichts zu sagen ist.
  assert.equal('bulkKind' in fields.activeSheetId, false);
});

test('collectAgentData: bulkKind am Model-Feld — @agentBulk tree gegen @agentBulk', () => {
  const model = MODEL.replace(
    `  /** @type {object[]} branching tree of Why nodes */
  nodes = [];`,
    `  /**
   * @type {object[]} branching tree of Why nodes
   * @agentBulk tree
   */
  nodes = [];`,
  );
  const root = fixture({ foo: { 'foo.js': TAGGED_VM, 'foo-model.js': model } });
  const { modules } = collectAgentData(root);

  assert.equal(modules.foo.fields.nodes.bulk, true);
  assert.equal(modules.foo.fields.nodes.bulkKind, 'tree');
  assert.equal(modules.foo.fields.rows.bulkKind, 'table');
  assert.equal('bulkKind' in modules.foo.fields.problem, false);
});

test('collectAgentData: eine unbekannte Massendaten-Art im Typedef ist ein Verstoß', () => {
  // `agent-contract.js` sichert `'table'|'tree'` zu, der Generator prüfte es
  // nicht: `[bulk:graph]` kam durch, und zur Laufzeit partitionierten die
  // beiden Prädikate in `projectReadState` dann unterschiedlich — das Feld
  // wurde als Tabelle BESCHRIEBEN, zählte aber nicht als Tabelle, und beide
  // Massenfelder bekamen die globalen Spalten.
  const vm = AGENT_READ_VM.replace('[bulk] every data row', '[bulk:graph] every data row');
  const root = fixture({ bar: { 'bar.js': vm, 'bar-model.js': BAR_MODEL } });
  const { modules } = collectAgentData(root);

  assert.ok(modules.bar.violations.includes('invalid_bulk_kind:rows:graph'),
    `erwartet invalid_bulk_kind:rows:graph, bekam ${JSON.stringify(modules.bar.violations)}`);
  assert.equal(modules.bar.available, false);
});

test('collectAgentData: eine unbekannte Massendaten-Art am Model-Feld ist ein Verstoß, einzeilig', () => {
  // `cleanComment(bulkTag.comment) || 'table'` machte JEDEN Kommentartext am
  // Tag zur Art — auch einen mehrzeiligen. Verstoßcodes sind zeilenfrei.
  const model = MODEL.replace(
    `   * @agentBulk
  `,
    `   * @agentBulk die
   *   Zeilen
  `,
  );
  const root = fixture({ foo: { 'foo.js': TAGGED_VM, 'foo-model.js': model } });
  const { modules } = collectAgentData(root);

  assert.ok(modules.foo.violations.includes('invalid_bulk_kind:rows:die Zeilen'),
    `erwartet invalid_bulk_kind:rows:die Zeilen, bekam ${JSON.stringify(modules.foo.violations)}`);
  assert.ok(modules.foo.violations.every(v => !v.includes('\n')),
    `Verstoßcodes sind zeilenfrei: ${JSON.stringify(modules.foo.violations)}`);
});

test('collectAgentData: table und tree sind erlaubt und melden nichts — die Prüfung weist nicht zu viel ab', () => {
  const vm = AGENT_READ_VM.replace(
    ' * @property {any[][]} rows  [bulk] every data row of the active sheet\n',
    ' * @property {any[][]} rows  [bulk] every data row of the active sheet\n'
    + ' * @property {object[]} nodes  [bulk:tree] the question tree\n',
  ).replace('rows: [] }', 'rows: [], nodes: [] }');
  const root = fixture({ bar: { 'bar.js': vm, 'bar-model.js': BAR_MODEL } });
  const { modules } = collectAgentData(root);

  assert.deepEqual(modules.bar.reported.filter(v => v.startsWith('invalid_bulk_kind')), []);
  assert.equal(modules.bar.available, true);
});

const OMIT_MODEL = `export class State {
  /** @type {string} the observed problem statement */
  problem = '';
  /**
   * @type {{inScope:Array<object>, outScope:Array<object>}} image galleries
   * @agentOmit inScope[].dataUrl outScope[].dataUrl
   */
  images = { inScope: [], outScope: [] };
  toJSON() { return { problem: this.problem, images: this.images }; }
}`;

/** OMIT_MODEL mit anderem @agentOmit-Tag (oder anderem Typ). */
function omitModel(tag, type = '{inScope:Array<object>, outScope:Array<object>}') {
  return OMIT_MODEL
    .replace('@agentOmit inScope[].dataUrl outScope[].dataUrl', tag)
    .replace('{inScope:Array<object>, outScope:Array<object>}', type);
}

/** AGENT_READ_VM mit einem zusätzlichen Typedef-Feld `cells`. */
function cellsVm(sentinels, type = 'Array<Array<{ text: string, image: string|null }>>') {
  return AGENT_READ_VM.replace(
    ' * @property {any[][]} rows  [bulk] every data row of the active sheet\n',
    ' * @property {any[][]} rows  [bulk] every data row of the active sheet\n'
    + ` * @property {${type}} cells  ${sentinels} the 3x3 cells\n`,
  );
}

test('collectAgentData: @agentOmit am Model-Feld landet als omit im Feldschema', () => {
  const root = fixture({ foo: { 'foo.js': TAGGED_VM, 'foo-model.js': OMIT_MODEL } });
  const { modules } = collectAgentData(root);

  assert.deepEqual(modules.foo.fields.images.omit, ['inScope[].dataUrl', 'outScope[].dataUrl']);
  assert.equal(modules.foo.fields.images.help, 'image galleries');
  assert.equal('omit' in modules.foo.fields.problem, false, 'ohne Marke steht kein omit');
  assert.deepEqual(modules.foo.reported.filter(v => v.includes('omit')), []);
});

test('collectAgentData: [omit:…] im Typedef, vor oder nach [bulk], hält die Hilfe sauber', () => {
  for (const sentinels of ['[bulk] [omit:[][].image]', '[omit:[][].image] [bulk]']) {
    const root = fixture({ bar: { 'bar.js': cellsVm(sentinels), 'bar-model.js': BAR_MODEL } });
    const { modules } = collectAgentData(root);
    const cells = modules.bar.fields.cells;

    assert.equal(cells.bulk, true, sentinels);
    assert.equal(cells.bulkKind, 'table', sentinels);
    assert.deepEqual(cells.omit, ['[][].image'], sentinels);
    assert.equal(cells.help, 'the 3x3 cells', sentinels);
    assert.deepEqual(modules.bar.reported.filter(v => v.includes('omit')), [], sentinels);
  }
  const root = fixture({ bar: { 'bar.js': AGENT_READ_VM, 'bar-model.js': BAR_MODEL } });
  assert.equal('omit' in collectAgentData(root).modules.bar.fields.rows, false);
});

test('collectAgentData: ein Auslassungspfad gegen die Grammatik ist invalid_omit_path', () => {
  const cases = [
    ['@agentOmit', 'invalid_omit_path:images:'],
    ['@agentOmit inScope[]', 'invalid_omit_path:images:inScope[]'],
    ['@agentOmit inScope..dataUrl', 'invalid_omit_path:images:inScope..dataUrl'],
    ['@agentOmit []', 'invalid_omit_path:images:[]'],
  ];
  for (const [tag, code] of cases) {
    const root = fixture({ foo: { 'foo.js': TAGGED_VM, 'foo-model.js': omitModel(tag) } });
    const { modules } = collectAgentData(root);
    assert.ok(modules.foo.violations.includes(code), `${tag}: erwartet ${code}, bekam ${JSON.stringify(modules.foo.violations)}`);
    assert.equal(modules.foo.available, false, tag);
  }
});

test('collectAgentData: ein Pfad, der nicht zum Typ passt, ist omit_path_mismatch', () => {
  const cases = [
    [omitModel('@agentOmit inScope.dataUrl'), 'omit_path_mismatch:images:inScope.dataUrl'],
    [omitModel('@agentOmit gallery[].dataUrl'), 'omit_path_mismatch:images:gallery[].dataUrl'],
    [omitModel('@agentOmit inScope[].dataUrl', '{inScope:string, outScope:string}'), 'omit_path_mismatch:images:inScope[].dataUrl'],
  ];
  for (const [model, code] of cases) {
    const root = fixture({ foo: { 'foo.js': TAGGED_VM, 'foo-model.js': model } });
    const { modules } = collectAgentData(root);
    assert.ok(modules.foo.violations.includes(code), `erwartet ${code}, bekam ${JSON.stringify(modules.foo.violations)}`);
  }
  const root = fixture({ bar: { 'bar.js': cellsVm('[bulk] [omit:[].image]'), 'bar-model.js': BAR_MODEL } });
  assert.ok(collectAgentData(root).modules.bar.violations.includes('omit_path_mismatch:cells:[].image'));
});

test('collectAgentData: ein nicht auflösbarer Typ widerlegt keinen Pfad', () => {
  for (const type of ['object', 'any', 'Gallery', '{a: string}|{b: string}', '{x: object}']) {
    const root = fixture({ foo: { 'foo.js': TAGGED_VM, 'foo-model.js': omitModel('@agentOmit x.y', type) } });
    const { modules } = collectAgentData(root);
    assert.deepEqual(modules.foo.reported.filter(v => v.includes('omit')), [], type);
  }
});

test('collectAgentData: a module with an AgentRead typedef is available without a model class', () => {
  // Kein `Model:`-Mitglied → readModelFields würde `unresolvable_model_class`
  // melden. Mit deklarierter Lesefläche ist das Model irrelevant.
  const noModel = AGENT_READ_VM.replace('  Model: State,\n', '');
  const root = fixture({ bar: { 'bar.js': noModel, 'bar-model.js': BAR_MODEL } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.bar.violations, []);
  assert.equal(modules.bar.available, true);
});

test('readAgentReadTypedef: returns null when the module declares none', () => {
  const sf = ts.createSourceFile('x.js', TAGGED_VM, ts.ScriptTarget.ESNext, true);
  assert.equal(readAgentReadTypedef(sf), null);
});

const TRAILING_AGENT_READ_VM = `/**
 * Bar module.
 * @agent
 */
import { createModule } from '../../core/template-module.js';
import { State } from './bar-model.js';

export default createModule({
  config: { id: 'bar' },
  Model: State,
  data(module, _t) {
    return {
      /**
       * @agent
       * @param {object} [options] field/row selection
       * @returns {AgentRead} the agent-facing read surface
       */
      read(options) { return {}; },
    };
  },
});

/**
 * Die Agenten-Lesefläche dieses Moduls.
 * @typedef {object} AgentRead
 * @property {string} activeSheetId  id of the active sheet
 * @property {any[][]} rows  [bulk] every data row of the active sheet
 */
`;

test('readAgentReadTypedef: a typedef block NOT attached to a statement (trailing at end of file) is not found', () => {
  const sf = ts.createSourceFile('x.js', TRAILING_AGENT_READ_VM, ts.ScriptTarget.ESNext, true);
  assert.equal(readAgentReadTypedef(sf), null);
});

test('collectAgentData: a trailing, unattached AgentRead typedef falls back to the Model-derived fields', () => {
  const root = fixture({ bar: { 'bar.js': TRAILING_AGENT_READ_VM, 'bar-model.js': BAR_MODEL } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(Object.keys(modules.bar.fields), ['sheets']);
  assert.equal('derived' in modules.bar.fields.sheets, false);
});

const VIA_VM = (via) => TAGGED_VM.replace('export default createModule', `/**
 * @typedef {object} AgentRead
 * @property {string} problem  [via: ${via}] die Problemstellung
 */
export default createModule`);

test('readAgentReadTypedef: [via: a, b] wird gelesen und aus der Hilfe entfernt', () => {
  const sf = sourceOf(`
/**
 * @typedef {object} AgentRead
 * @property {string} step  [via: answer, back] die offene Frage
 */
export default 1;
`);
  const fields = readAgentReadTypedef(sf);
  assert.deepEqual(fields.step.via, ['answer', 'back']);
  assert.equal(fields.step.help, 'die offene Frage');
});

test('readAgentReadTypedef: [via:] steht mit [bulk] in beliebiger Reihenfolge', () => {
  const sf = sourceOf(`
/**
 * @typedef {object} AgentRead
 * @property {string[]} rows  [bulk] [via: addRow] die Zeilen
 */
export default 1;
`);
  const f = readAgentReadTypedef(sf).rows;
  assert.equal(f.bulk, true);
  assert.deepEqual(f.via, ['addRow']);
});

test('collectAgentData: [via:] mit unbekannter Aktion meldet unknown_via_action', () => {
  const root = fixture({ foo: { 'foo.js': VIA_VM('nope'), 'foo-model.js': MODEL } });
  const { modules } = collectAgentData(root);
  assert.ok(modules.foo.violations.includes('unknown_via_action:problem:nope'));
});

test('collectAgentData: [via:] mit echter Aktion meldet nichts', () => {
  const root = fixture({ foo: { 'foo.js': VIA_VM('setProblem'), 'foo-model.js': MODEL } });
  const { modules } = collectAgentData(root);
  assert.equal(modules.foo.violations.includes('unknown_via_action:problem:setProblem'), false);
  assert.deepEqual(modules.foo.fields.problem.via, ['setProblem']);
});

test('readAgentReadTypedef: [omit:…] und [via:…] stehen in beliebiger Reihenfolge', () => {
  const sf = sourceOf(`
/**
 * @typedef {object} AgentRead
 * @property {object[]} cells  [omit:[].image] [via: setCell] die Zellen
 * @property {object[]} other  [via: setCell] [omit:[].image] die anderen
 */
export default 1;
`);
  const f = readAgentReadTypedef(sf);
  for (const k of ['cells', 'other']) {
    assert.deepEqual(f[k].via, ['setCell']);
    assert.deepEqual(f[k].omit, ['[].image']);
  }
  assert.equal(f.cells.help, 'die Zellen');
});

test('readAgentReadTypedef: [via:] erlaubt Teil-Viewmodel-Namen mit Punkt', () => {
  const sf = sourceOf(`
/**
 * @typedef {object} AgentRead
 * @property {object[]} f  [via: part.add, other] x
 */
export default 1;
`);
  assert.deepEqual(readAgentReadTypedef(sf).f.via, ['part.add', 'other']);
});

test('collectAgentData: eine @noagent-Methode in [via:] ist eine unbekannte Aktion', () => {
  const root = fixture({ foo: { 'foo.js': VIA_VM('cardClass'), 'foo-model.js': MODEL } });
  const { modules } = collectAgentData(root);
  assert.ok(modules.foo.violations.includes('unknown_via_action:problem:cardClass'));
});

test('collectAgentData: ein missratenes [via …] meldet invalid_via statt still Prosa zu sein', () => {
  for (const bad of ['', ' a b', ' : x']) {
    const vm = TAGGED_VM.replace('export default createModule', `/**
 * @typedef {object} AgentRead
 * @property {string} problem  [via${bad}] die Problemstellung
 */
export default createModule`);
    const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
    assert.ok(collectAgentData(root).modules.foo.violations.includes('invalid_via:problem'), `[via${bad}]`);
  }
  const bad2 = VIA_VM('a b');
  const root = fixture({ foo: { 'foo.js': bad2, 'foo-model.js': MODEL } });
  assert.ok(collectAgentData(root).modules.foo.violations.includes('invalid_via:problem'));
});

test('collectAgentData: die beschriebenen Schreibwege stehen neben den Einträgen, nicht darin', () => {
  const root = fixture({ foo: { 'foo.js': VIA_VM('setProblem'), 'foo-model.js': MODEL } });
  const data = collectAgentData(root);
  assert.equal('writtenFields' in data.modules.foo, false);
  assert.ok(Array.isArray(data.writtenFields.foo));
});

test('die erzeugte Registry trägt keine Berichtsfelder', () => {
  const root = fixture({ foo: { 'foo.js': VIA_VM('setProblem'), 'foo-model.js': MODEL } });
  assert.equal(renderAgentRegistryModule(collectAgentData(root)).includes('writtenFields'), false);
});

const TAGGED_NO_ACTIONS = `/**
 * Empty module.
 * @agent
 */
import { createModule } from '../../core/template-module.js';
import { State } from './empty-model.js';
export default createModule({
  config: { id: 'empty' },
  Model: State,
  data(module, _t) {
    return {
      /** @noagent */
      cardClass(node) { return ''; },
    };
  },
});`;

test('collectAgentData: a module tag with zero @agent actions is a violation', () => {
  const root = fixture({ empty: { 'empty.js': TAGGED_NO_ACTIONS, 'empty-model.js': BAR_MODEL } });
  const { modules } = collectAgentData(root);
  assert.ok(modules.empty.violations.includes('module_tag_without_actions'));
  assert.equal(modules.empty.available, false);
});

/* Dasselbe Modul, aber mit dem geteilten `read()` — das ist der billige Weg zu
   einer grünen Freigabe: Tag plus eine Zeile Spread. Ohne einen einzigen
   Schreibweg darf das nicht durchgehen. */
const TAGGED_ONLY_READ = TAGGED_NO_ACTIONS.replace('      /** @noagent */', `      /**
       * Read the full state.
       * @agent
       * @returns {object} the state
       */
      read() { return {}; },
      /** @noagent */`);

test('collectAgentData: a module whose ONLY action is read() is still a violation', () => {
  const root = fixture({ empty: { 'empty.js': TAGGED_ONLY_READ, 'empty-model.js': BAR_MODEL } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(Object.keys(modules.empty.actions), ['read']);
  // `no_read_action` ist erfüllt — die erste Hürde muss trotzdem greifen,
  // sonst sind die beiden Codes redundant statt orthogonal.
  assert.ok(!modules.empty.violations.includes('no_read_action'));
  assert.ok(modules.empty.violations.includes('module_tag_without_actions'));
  assert.equal(modules.empty.available, false);
});

test('collectAgentData: a released module without a read() action is a violation', () => {
  const noRead = TAGGED_VM.replace(/\/\*\*\n\s+\* Read the full state\.\n\s+\* @agent\n\s+\* @returns \{object\} the state\n\s+\*\/\n\s+read\(\) \{ return \{\}; \},\n/, '');
  const root = fixture({ foo: { 'foo.js': noRead, 'foo-model.js': MODEL } });
  const { modules } = collectAgentData(root);
  assert.ok(modules.foo.violations.includes('no_read_action'));
  assert.equal(modules.foo.available, false);
});

test('collectAgentData: both new hurdles are only REPORTED on an untagged module', () => {
  const root = fixture({
    empty: { 'empty.js': TAGGED_NO_ACTIONS.replace(' * @agent\n', ''), 'empty-model.js': BAR_MODEL },
  });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.empty.violations, []);
  assert.ok(modules.empty.reported.includes('module_tag_without_actions'));
  assert.ok(modules.empty.reported.includes('no_read_action'));
});

test('collectAgentData: the released pilot modules are available in the real tree', () => {
  // Der echte Baum, nicht ein Fixture: dieser Fall ist das Tor, das eine
  // Freigabe festhält. Er wächst mit jedem freigegebenen Pilotmodul.
  const appDir = join(import.meta.dirname, '..', '..');
  const { modules, coverage } = collectAgentData(appDir);
  for (const id of ['five-why', 'worksheet', 'hypothesis-test']) {
    assert.deepEqual(modules[id].violations, [], `${id} hat Verstöße`);
    assert.equal(modules[id].available, true, `${id} ist nicht freigegeben`);
    assert.ok('read' in modules[id].actions, `${id} hat kein read()`);
  }
  assert.ok(coverage.available >= 3);
});

test('collectAgentData: hypothesis-test exposes the computed result as a read field', () => {
  const appDir = join(import.meta.dirname, '..', '..');
  const { modules } = collectAgentData(appDir);
  assert.ok('result' in modules['hypothesis-test'].fields);
  assert.equal(modules['hypothesis-test'].fields.result.derived, true);
  // Die interne Beispiel-Buchführung gehört NICHT zur Lesefläche.
  assert.equal('exampleWorksheetId' in modules['hypothesis-test'].fields, false);
});

test('collectAgentData: worksheet declares its read surface, rows are bulk', () => {
  const appDir = join(import.meta.dirname, '..', '..');
  const { modules } = collectAgentData(appDir);
  assert.deepEqual(Object.keys(modules.worksheet.fields),
    ['sheets', 'sheetId', 'columns', 'rows', 'formulas']);
  assert.equal(modules.worksheet.fields.rows.bulk, true);
  assert.equal(modules.worksheet.fields.rows.derived, true);
  // Zweites tabellarisches Massenfeld: ab hier nimmt `columnNames` NICHT
  // mehr das globale `columns`, sondern das Schwesterfeld (`agent-read.js`).
  assert.equal(modules.worksheet.fields.formulas.bulk, true);
  assert.equal(modules.worksheet.fields.formulas.bulkKind, 'table');
  assert.equal(modules.worksheet.fields.formulas.derived, true);
});

/* ─── Das i18n-Tor der freigegebenen Module ───────────────────────────────
   Jeder Aktions- und Feldname steht in vier Quellen: der generierten
   Registry (abgeleitet), `i18n/de.json`, `i18n/en.json` und — für Anker —
   als `data-help-key`-Literal in der Vorlage. Nur die erste wächst mit dem
   Code mit. Ohne dieses Tor würde ein Umbenennen beide Sprachbäume still
   veralten lassen (`contextHelp()` fällt auf die JSDoc-Prosa zurück, ein
   deutscher Agent bekäme Englisch) und ein Tippfehler im `data-help-key`
   würde das Fragezeichen einfach nicht erscheinen lassen — ohne einen
   einzigen roten Test. */

/* `lookup` und `helpExists` kommen aus `agent-report.mjs` (oben importiert)
   und werden hier NICHT zweitgeschrieben. Beide Seiten — das Tor hier und
   die Abdeckungszahl dort — müssen denselben Schlüssel auf dieselbe Weise
   auflösen; zwei Kopien könnten auseinanderlaufen, und der Fehlerfall wäre
   der unangenehmste: der Report meldet 100 %, während dieses Tor rot ist,
   oder umgekehrt. Die Kette ist die von `agent-catalog.js:contextHelp`
   (Modulschlüssel → `modules.shared.<suffix>`); `context-help.js` kennt
   dagegen nur das Literal aus `data-help-key` und wird unten direkt mit
   `lookup` geprüft. Dass ein LEERER Schlüssel als nicht vorhanden gilt, ist
   in `agent-report.test.mjs` festgenagelt. */

test('i18n-Tor: die geteilte Statistiktabelle liefert ihre Anker-Schlüssel an die Tore', () => {
  const appDir = join(import.meta.dirname, '..', '..');
  const keys = helpKeysInSharedSources(appDir).map(([, k]) => k);
  assert.ok(keys.includes('modules.shared.types.Stats.mean'), keys.join(', '));
  assert.ok(keys.includes('modules.shared.types.SeriesStats.name'), keys.join(', '));
});

test('i18n-Tor: jede Aktion, jeder Parameter und jedes Feld eines freigegebenen Moduls hat einen Schlüssel in BEIDEN Sprachdateien', () => {
  const appDir = join(import.meta.dirname, '..', '..');
  const { modules } = collectAgentData(appDir);
  const trees = {
    de: JSON.parse(readFileSync(join(appDir, 'i18n', 'de.json'), 'utf8')),
    en: JSON.parse(readFileSync(join(appDir, 'i18n', 'en.json'), 'utf8')),
  };
  const released = Object.entries(modules).filter(([, m]) => m.available === true);
  assert.ok(released.length >= 1, 'kein freigegebenes Modul — das Tor prüfte nichts');

  const missing = [];
  for (const [id, entry] of released) {
    for (const [action, def] of Object.entries(entry.actions)) {
      for (const [lang, tree] of Object.entries(trees)) {
        if (!helpExists(tree, id, `actions.${action}.help`)) {
          missing.push(`${lang}: modules.${id}.actions.${action}.help`);
        }
        for (const param of def.params ?? []) {
          if (!helpExists(tree, id, `actions.${action}.params.${param.name}`)) {
            missing.push(`${lang}: modules.${id}.actions.${action}.params.${param.name}`);
          }
        }

      }
    }
    for (const field of Object.keys(entry.fields)) {
      for (const [lang, tree] of Object.entries(trees)) {
        if (!helpExists(tree, id, `fields.${field}.help`)) {
          missing.push(`${lang}: modules.${id}.fields.${field}.help`);
        }
      }
    }
    for (const suffix of typedefHelpSuffixes(entry)) {
      for (const [lang, tree] of Object.entries(trees)) {
        if (!helpExists(tree, id, suffix)) missing.push(`${lang}: modules.${id}.${suffix}`);
      }
    }
  }
  assert.deepEqual(missing, [], `fehlende i18n-Schlüssel:\n${missing.join('\n')}`);
});

test('i18n-Tor: jeder Anker-Schlüssel (Vorlage, Modul-JS, geteilter Baustein) löst in BEIDEN Sprachdateien auf', () => {
  const appDir = join(import.meta.dirname, '..', '..');
  const { modules } = collectAgentData(appDir);
  const trees = {
    de: JSON.parse(readFileSync(join(appDir, 'i18n', 'de.json'), 'utf8')),
    en: JSON.parse(readFileSync(join(appDir, 'i18n', 'en.json'), 'utf8')),
  };
  const broken = [];
  let checked = 0;
  for (const [id, entry] of Object.entries(modules)) {
    if (entry.available !== true) continue;
    for (const [file, key] of [...helpKeysInTemplates(appDir, id), ...helpKeysInScripts(appDir, id)]) {
      checked += 1;
      // `context-help.js` fragt NUR dieses Literal (`i18n.exists(key)`) und
      // kennt keinen geteilten Rückfall — ein Tippfehler heißt: kein Knopf.
      for (const [lang, tree] of Object.entries(trees)) {
        if (lookup(tree, key) === undefined) broken.push(`${lang}: ${file} → ${key}`);
      }
    }
  }
  for (const [file, key] of helpKeysInSharedSources(appDir)) {
    checked += 1;
    for (const [lang, tree] of Object.entries(trees)) {
      if (lookup(tree, key) === undefined) broken.push(`${lang}: ${file} → ${key}`);
    }
  }
  assert.ok(checked >= 2, `zu wenige Anker geprüft (${checked})`);
  assert.deepEqual(broken, [], `nicht auflösbare data-help-key:\n${broken.join('\n')}`);
});

test('i18n-Tor: ein verankerter Satz (Vorlage, Modul-JS, geteilter Baustein) enthält keinen Strukturjargon', () => {
  // Doppelnutzen: der Satz am Label ist derselbe, den der Agent liest. Wer
  // Alt hält, prüft damit die Agentenbeschreibung — das geht nur, wenn sie
  // für Menschen geschrieben ist. Die Struktur steht im JSDoc-Typ.
  const appDir = join(import.meta.dirname, '..', '..');
  const { modules } = collectAgentData(appDir);
  const trees = {
    de: JSON.parse(readFileSync(join(appDir, 'i18n', 'de.json'), 'utf8')),
    en: JSON.parse(readFileSync(join(appDir, 'i18n', 'en.json'), 'utf8')),
  };
  const jargon = [];
  for (const [id, entry] of Object.entries(modules)) {
    if (entry.available !== true) continue;
    for (const [file, key] of [...helpKeysInTemplates(appDir, id), ...helpKeysInScripts(appDir, id)]) {
      for (const [lang, tree] of Object.entries(trees)) {
        const text = lookup(tree, key);
        const hit = text && STRUCTURE_JARGON.exec(text);
        if (hit) jargon.push(`${lang}: ${file} → ${key} („${hit[0]}")`);
      }
    }
  }
  for (const [file, key] of helpKeysInSharedSources(appDir)) {
    for (const [lang, tree] of Object.entries(trees)) {
      const text = lookup(tree, key);
      const hit = text && STRUCTURE_JARGON.exec(text);
      if (hit) jargon.push(`${lang}: ${file} → ${key} („${hit[0]}")`);
    }
  }
  assert.deepEqual(jargon, [], `Strukturjargon in verankerten Sätzen:\n${jargon.join('\n')}`);
});

test('i18n-Tor: jeder zur Laufzeit gebundene Hilfeschlüssel löst in BEIDEN Sprachdateien auf und ist frei von Strukturjargon', async () => {
  const appDir = join(import.meta.dirname, '..', '..');
  const trees = {
    de: JSON.parse(readFileSync(join(appDir, 'i18n', 'de.json'), 'utf8')),
    en: JSON.parse(readFileSync(join(appDir, 'i18n', 'en.json'), 'utf8')),
  };
  const problems = [];
  let checked = 0;
  for (const { moduleId, keys } of BOUND_HELP_KEY_FAMILIES) {
    for (const key of await keys()) {
      checked += 1;
      for (const [lang, tree] of Object.entries(trees)) {
        const text = lookup(tree, key);
        if (text === undefined) { problems.push(`${lang}: ${moduleId} → ${key} löst nicht auf`); continue; }
        const hit = STRUCTURE_JARGON.exec(text);
        if (hit) problems.push(`${lang}: ${moduleId} → ${key} enthält Strukturjargon („${hit[0]}")`);
      }
    }
  }
  assert.ok(checked > 0, 'keine gebundenen Hilfeschlüssel geprüft');
  assert.deepEqual(problems, [], `gebundene Hilfeschlüssel:\n${problems.join('\n')}`);
});

/* Controller-Entscheid zu Review-Befund 2: das Tor darf NICHT den
   modulspezifischen `actions.read.help` verlangen. Der geteilte Rückfall
   (`modules.shared.<suffix>`) ist genau dafür da, dass nicht 72 Module
   denselben Satz in beide Sprachbäume kopieren, und Regel 1
   der Agentenfläche sagt ausdrücklich, dass fehlende Kontexthilfe
   nicht blockiert. Geprüft wird deshalb die dokumentierte KETTE:
   Modulschlüssel, sonst geteilter Schlüssel. Das Tor fängt weiterhin jede
   Veralterung, für die es gebaut ist — eine umbenannte Aktion, ein
   umbenannter Parameter, ein umbenanntes Feld hat keinen geteilten
   Rückfall und wird rot. */
test('i18n-Tor: der read-Hilfetext jedes freigegebenen Moduls löst über die dokumentierte Kette auf', () => {
  const appDir = join(import.meta.dirname, '..', '..');
  const { modules } = collectAgentData(appDir);
  const trees = {
    de: JSON.parse(readFileSync(join(appDir, 'i18n', 'de.json'), 'utf8')),
    en: JSON.parse(readFileSync(join(appDir, 'i18n', 'en.json'), 'utf8')),
  };
  const released = Object.entries(modules).filter(([, m]) => m.available === true);
  assert.ok(released.length >= 2, 'weniger als zwei freigegebene Module');

  const missing = [];
  for (const [id] of released) {
    for (const [lang, tree] of Object.entries(trees)) {
      if (!helpExists(tree, id, 'actions.read.help')) {
        missing.push(`${lang}: modules.${id}.actions.read.help (auch kein geteilter Rückfall)`);
      }
    }
  }
  assert.deepEqual(missing, [], `unauflösbare read-Hilfetexte:\n${missing.join('\n')}`);
});

test('i18n-Tor: das deutsche read-Hilfetext von five-why bleibt der modulspezifische', () => {
  // Der geteilte Rückfall (`modules.shared.actions.read.help`) ist additiv: der
  // Modulschlüssel gewinnt weiterhin. Dieser Fall hält fest, dass die
  // Freigabe von five-why ihren eigenen Text behält.
  const appDir = join(import.meta.dirname, '..', '..');
  const de = JSON.parse(readFileSync(join(appDir, 'i18n', 'de.json'), 'utf8'));
  assert.equal(lookup(de, 'modules.five-why.actions.read.help'),
    'Liefert Problemtext und Fragebaum als Lesezustand.');
  assert.ok(lookup(de, 'modules.shared.actions.read.help'));
  assert.ok(lookup(de, 'modules.shared.actions.read.params.options'));
});

/* ── Domänen-Tor ────────────────────────────────────────────────────────
   Die vier Aufzähl-Setter des Hypothesentests prüfen ihr Argument gegen die
   aus dem Model exportierten Wertemengen (`CATEGORIES`, `TEST_TYPES`,
   `DIRECTIONS`, `TARGET_TYPES`) — ein Wert daneben rechnete still den
   FALSCHEN Test (die Engines lesen jede unbekannte Richtung als `less`).
   Diese Prüfung kann nur so viel wert sein, wie sie zu dem passt, was die
   OBERFLÄCHE anbietet: driftete die `<option>`-Liste von der Wertemenge ab,
   wäre entweder ein Knopf unbedienbar oder der Agent gegen eine veraltete
   Liste geprüft. Deshalb wird hier die Vorlage selbst gelesen. */
test('Domänen-Tor: die erklärten Wertemengen des Hypothesentests sind GENAU die der Vorlage', async () => {
  const appDir = join(import.meta.dirname, '..', '..');
  const { CATEGORIES, TEST_TYPES, DIRECTIONS, TARGET_TYPES } =
    await import(join(appDir, 'js', 'modules', 'hypothesis-test', 'hypothesis-test-model.js'));
  const html = readFileSync(
    join(appDir, 'js', 'modules', 'hypothesis-test', 'hypothesis-test.html'), 'utf8');

  /** Alle Werte eines Attributs in der Vorlage, in Vorkommensreihenfolge. */
  const attrValues = (attr) =>
    [...html.matchAll(new RegExp(`${attr}="([^"]+)"`, 'g'))].map(m => m[1]);
  /** Die `<option value>` des `<select data-ref="…">`-Blocks. */
  const optionValues = (ref) => {
    const open = html.indexOf(`data-ref="${ref}"`);
    assert.ok(open > 0, `kein <select data-ref="${ref}"> in der Vorlage`);
    const end = html.indexOf('</select>', open);
    return [...html.slice(open, end).matchAll(/<option value="([^"]+)"/g)].map(m => m[1]);
  };

  assert.deepEqual(attrValues('data-cat'), [...CATEGORIES]);
  assert.deepEqual(attrValues('data-type'), [...TEST_TYPES]);
  assert.deepEqual(optionValues('direction'), [...DIRECTIONS]);
  assert.deepEqual(optionValues('target-type'), [...TARGET_TYPES]);

  // Und die Listen sind eingefroren: eine zur Laufzeit erweiterte Wertemenge
  // wäre ein Loch in genau der Prüfung, die sie tragen.
  for (const list of [CATEGORIES, TEST_TYPES, DIRECTIONS, TARGET_TYPES]) {
    assert.ok(Object.isFrozen(list));
  }
});

// ═══════════════════════════════════════════════════════════════
// Generator-Härtung: was der Generator bisher verschluckte
// ═══════════════════════════════════════════════════════════════

test('collectDomDetours erkennt += auf innerHTML', () => {
  const hits = collectDomDetours(sourceOf(`function render(el) { el.innerHTML += '<b>x</b>'; }`));
  assert.equal(hits.length, 1);
  assert.match(hits[0], /^dom_detour:innerHTML$/);
});

test('collectDomDetours sieht ??=, ||=, &&= und -=', () => {
  for (const op of ['??=', '||=', '&&=', '-=']) {
    const hits = collectDomDetours(sourceOf(`el.dataset.k ${op} 'x';`));
    assert.deepEqual(hits, ['dom_detour:dataset.k'], op);
  }
});

test('collectDomDetours meldet dieselbe Eigenschaft einmal', () => {
  assert.deepEqual(collectDomDetours(sourceOf(`el.innerHTML = 'a';\nel.innerHTML = 'b';`)), ['dom_detour:innerHTML']);
});

test('collectDomDetours erkennt dataset mit Klammerzugriff', () => {
  const hits = collectDomDetours(sourceOf(`function mark(el) { el.dataset['state'] = 'on'; }`));
  assert.equal(hits.length, 1);
  assert.match(hits[0], /^dom_detour:dataset\.state$/);
});

test('eine Hilfsklasse in der Model-Datei mischt ihre Felder nicht unter', () => {
  // Punkt (b) der Härtung: sieht behoben aus. Der Test hält die Korrektur.
  const root = fixture({
    foo: {
      'foo.js': `/**\n * Foo.\n * @agent\n */\nimport { State } from './foo-model.js';\ncreateModule({ id: 'foo', Model: State });`,
      'foo-model.js': `export class Helper {\n  /** @type {string} nicht die Lesefläche */\n  secret = '';\n}\nexport class State {\n  /** @type {string} der Titel */\n  title = '';\n}`,
    },
  });
  const { modules } = collectAgentData(root);
  assert.deepEqual(Object.keys(modules.foo.fields), ['title']);
});

test('ein geklammerter Funktionswert gilt als Methode, nicht als Daten', () => {
  const root = fixture({
    foo: {
      'foo.js': `/**\n * Foo.\n * @agent\n */\ncreateModule({ id: 'foo', data() { return {\n  /**\n   * Tut etwas.\n   * @agent\n   * @returns {void} nichts\n   */\n  doIt: (() => {}),\n}; } });`,
    },
  });
  const { modules } = collectAgentData(root);
  assert.ok(Object.prototype.hasOwnProperty.call(modules.foo.actions, 'doIt'),
    'der geklammerte Funktionswert wurde stumm übersprungen');
});

test('ein Verstoßcode eines vererbten Mitglieds trägt keine Zeilennummer', () => {
  const root = fixture({
    foo: { 'foo.js': `/**\n * Foo.\n * @agent\n */\nimport { mix } from '../../ui/mix.js';\ncreateModule({ id: 'foo', data() { return { ...mix() }; } });` },
  }, { 'js/ui/mix.js': `export function mix() { return { unmarkiert() {} }; }` });
  const { modules } = collectAgentData(root);
  const code = modules.foo.reported.find(c => c.startsWith('unmarked_method:unmarkiert'));
  assert.equal(code, 'unmarked_method:unmarkiert@js/ui/mix.js');
});

test('class State extends State wird gemeldet, nicht still terminiert', () => {
  const root = fixture({
    foo: {
      'foo.js': `/**\n * Foo.\n * @agent\n */\nimport { State } from './foo-model.js';\ncreateModule({ id: 'foo', Model: State });`,
      'foo-model.js': `export class State extends State {\n  /** @type {string} der Titel */\n  title = '';\n}`,
    },
  });
  const { modules } = collectAgentData(root);
  assert.ok(modules.foo.violations.some(v => v.startsWith('self_inheriting_class:')),
    `kein Befund: ${JSON.stringify(modules.foo.violations)}`);
});

test('calculator führt alle neun Modellfelder', () => {
  const appDir = join(import.meta.dirname, '..', '..');
  const { modules } = collectAgentData(appDir);
  assert.deepEqual(Object.keys(modules.calculator.fields).sort(),
    ['angleMode', 'dataset', 'expression', 'lastResult', 'lsl', 'memory', 'mode', 'ssDataset', 'usl']);
});

test('unreadable_state_key: ein persistierter Schlüssel ohne Lesefeld ist ein Befund', () => {
  const root = fixture({ foo: { 'foo.js': TITLE_VM, 'foo-model.js': `export class State {
    /** @type {string} der Titel */
    title = '';
    toJSON() { return { title: this.title, hidden: 'weg' }; }
  }` } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreadable_state_key:hidden']);
  // tagged⇒hard: der Befund blockiert tatsächlich die Freigabe, nicht nur `reported`.
  assert.ok(modules.foo.violations.includes('unreadable_state_key:hidden'));
  assert.equal(modules.foo.available, false);
});

test('unreadable_state_key: ein _-präfigierter persistierter Schlüssel wird NICHT gemeldet', () => {
  const root = fixture({ foo: { 'foo.js': TITLE_VM, 'foo-model.js': `export class State {
    /** @type {string} der Titel */
    title = '';
    toJSON() { return { title: this.title, _schema: 3 }; }
  }` } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, []);
});

test('unreadable_state_key: JSON.parse(JSON.stringify({…})) wird entpackt', () => {
  const root = fixture({ foo: { 'foo.js': TITLE_VM, 'foo-model.js': `export class State {
    /** @type {string} der Titel */
    title = '';
    toJSON() { return JSON.parse(JSON.stringify({ title: this.title, hidden: 1 })); }
  }` } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreadable_state_key:hidden']);
});

test('unreadable_state_key: eine lokale Variable wird verfolgt', () => {
  const root = fixture({ foo: { 'foo.js': TITLE_VM, 'foo-model.js': `export class State {
    /** @type {string} der Titel */
    title = '';
    toJSON() { const out = { title: this.title, hidden: 1 }; return out; }
  }` } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreadable_state_key:hidden']);
});

test('unresolvable_tojson: ein Spread im Rückgabeobjekt ist eine Blindstelle', () => {
  const root = fixture({ foo: { 'foo.js': TITLE_VM, 'foo-model.js': `export class State {
    /** @type {string} der Titel */
    title = '';
    toJSON() { return { ...this.base(), title: this.title }; }
  }` } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unresolvable_tojson']);
});

test('ein erklärtes AgentRead-Typedef setzt das Gate aus', () => {
  const root = fixture({ bar: { 'bar.js': AGENT_READ_VM, 'bar-model.js': BAR_MODEL } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.bar.reported, []);
});

test('geerbtes toJSON wird gefunden', () => {
  const root = fixture({ foo: { 'foo.js': TITLE_VM, 'foo-model.js': `export class Base {
    toJSON() { return { title: this.title, hidden: 1 }; }
  }
  export class State extends Base {
    /** @type {string} der Titel */
    title = '';
  }` } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreadable_state_key:hidden']);
});

test('unresolvable_tojson: eine nicht-const lokale Variable (let, neu zugewiesen) ist eine Blindstelle', () => {
  // Review-Fund 1: die alte Fassung folgte JEDER lokalen Variable, auch
  // einer mit `let` neu zugewiesenen. `out` zeigte hier zuerst auf
  // { title } — die zweite, per `if` zugewiesene Fassung mit `hidden` wäre
  // lautlos verschwunden, ohne jeden Befund.
  const root = fixture({ foo: { 'foo.js': TITLE_VM, 'foo-model.js': `export class State {
    /** @type {string} der Titel */
    title = '';
    toJSON() {
      let out = { title: this.title };
      if (this.title) out = { title: this.title, hidden: 1 };
      return out;
    }
  }` } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unresolvable_tojson']);
});

test('unresolvable_tojson: mehr als eine return-Anweisung ist eine Blindstelle', () => {
  // Review-Fund 2: die alte Fassung las nur die erste TOP-LEVEL
  // `return`-Anweisung. Der `if`-Zweig unten (mit `onlyInIf`) landete nie
  // im entpackten Literal, aber auch ohne jeden Befund — die zweite
  // `return`-Anweisung ist für sich genommen vollständig „sauber" (nur
  // `title`, ein bekanntes Feld), also kam kein `unreadable_state_key`
  // zustande, obwohl ein Schlüssel verschwiegen wurde.
  const root = fixture({ foo: { 'foo.js': TITLE_VM, 'foo-model.js': `export class State {
    /** @type {string} der Titel */
    title = '';
    toJSON() {
      if (this.title) return { title: this.title, onlyInIf: 1 };
      return { title: this.title };
    }
  }` } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unresolvable_tojson']);
});

test('unreachable_write: eine x-model-Bindung ohne @agent-Setter ist ein Befund', () => {
  const root = fixture({ foo: {
    'foo.js': TAGGED_VM,
    'foo-model.js': `export class State {
      /** @type {string} der Titel */
      title = '';
      toJSON() { return { title: this.title }; }
    }`,
    'foo.html': '<input x-model="model.title">',
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreachable_write:title']);
  // tagged⇒hard: der Befund blockiert tatsächlich die Freigabe, nicht nur `reported`.
  assert.ok(modules.foo.violations.includes('unreachable_write:title'));
  assert.equal(modules.foo.available, false);
});

const viewVm = ({ extra = '', typedef = '', readBody = 'return options;' } = {}) => `/**
 * Foo module.
 * @agent
 */
import { createModule } from '../../core/template-module.js';
import { State } from './foo-model.js';
${typedef}
export default createModule({
  config: { id: 'foo' },
  Model: State,
  data(module, _t) {
    return {
      /**
       * Liest.
       * @agent
       * @param {object} [options] die Optionen
       * @returns {object} der Zustand
       */
      read(options) { ${readBody} },
      /**
       * Schreibt.
       * @agent
       * @param {string} title der Titel
       * @returns {void}
       */
      setTitle(title) { this.model.title = title; },
      ${extra}
    };
  },
});`;

const viewModel = (fields, body = 'activeTab: this.activeTab, title: this.title') => `export class State {
  ${fields}
  /** @type {string} der Titel */
  title = '';
  /** @type {string} der Reiter */
  activeTab = 'a';
  toJSON() { return { ${body} }; }
}`;

test('viewFields: Liste kommt in die Registry, das Feld fällt aus der Lesefläche', () => {
  const root = fixture({ foo: { 'foo.js': viewVm(), 'foo-model.js': viewModel("static VIEW_FIELDS = ['activeTab'];") } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.viewFields, ['activeTab']);
  assert.ok(!Object.hasOwn(modules.foo.fields, 'activeTab'));
  assert.ok(Object.hasOwn(modules.foo.fields, 'title'));
  assert.deepEqual(modules.foo.reported, [], 'auch kein unreadable_state_key');
});

test('viewFields: ohne Deklaration kein Schlüssel', () => {
  const root = fixture({ foo: { 'foo.js': viewVm(), 'foo-model.js': viewModel('') } });
  assert.equal(collectAgentData(root).modules.foo.viewFields, undefined);
});

test('unresolved_view_fields: kein Literal, oder Pfad gegen die Grammatik', () => {
  for (const decl of ['static VIEW_FIELDS = makeList();', "static VIEW_FIELDS = ['a[]'];", "static VIEW_FIELDS = ['a..b'];"]) {
    const root = fixture({ foo: { 'foo.js': viewVm(), 'foo-model.js': `const makeList = () => [];\n${viewModel(decl)}` } });
    assert.ok(collectAgentData(root).modules.foo.reported.includes('unresolved_view_fields'), decl);
  }
});

test('view_field_not_persisted: erstes Segment fehlt in toJSON()', () => {
  const root = fixture({ foo: { 'foo.js': viewVm(), 'foo-model.js': viewModel("static VIEW_FIELDS = ['activeTab', 'gibtEsNicht[].x'];") } });
  assert.deepEqual(collectAgentData(root).modules.foo.reported, ['view_field_not_persisted:gibtEsNicht[].x']);
});

test('view_field_declared: Feld steht im AgentRead-Typedef, auch verschachtelt', () => {
  const typedef = `/**
 * @typedef {object} AgentRead
 * @property {string} activeTab  der Reiter
 * @property {Array<{ id: string, collapsed: boolean }>} risks  die Risiken
 */
`;
  const vm = viewVm({ typedef, readBody: "return readAgentState('foo', { activeTab: 'a', risks: [] }, options);" });
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js':
    viewModel("static VIEW_FIELDS = ['activeTab', 'risks[].collapsed'];\n  risks = [];", 'activeTab: this.activeTab, title: this.title, risks: this.risks') } });
  const { reported } = collectAgentData(root).modules.foo;
  assert.ok(reported.includes('view_field_declared:activeTab'));
  assert.ok(reported.includes('view_field_declared:risks[].collapsed'));
});

test('view_field_agent_write: parametergetrieben ist ein Befund, die Folgeschreibung nicht', () => {
  const setter = `/**
       * Setzt den Reiter.
       * @agent
       * @param {string} tab der Reiter
       * @returns {void}
       */
      setTab(tab) { this.model.activeTab = tab; },`;
  const consequence = `/**
       * Legt etwas an und aktiviert es.
       * @agent
       * @returns {void}
       */
      openThing() { this.model.title = 'neu'; this.model.activeTab = 'neu'; },`;
  const modelText = viewModel("static VIEW_FIELDS = ['activeTab'];");
  const hit = fixture({ foo: { 'foo.js': viewVm({ extra: setter }), 'foo-model.js': modelText } });
  assert.deepEqual(collectAgentData(hit).modules.foo.reported, ['view_field_agent_write:activeTab']);
  const clean = fixture({ foo: { 'foo.js': viewVm({ extra: consequence }), 'foo-model.js': modelText } });
  assert.deepEqual(collectAgentData(clean).modules.foo.reported, []);
});

/**
 * Ein Modul mit den Ansichtsfeldern `activeTab` und `selected`,
 * das nur die übergebene @agent-Methode zusätzlich trägt.
 * @param {string} signature  z. B. `pick(id)`
 * @param {string} body  der Methodenkörper
 * @param {{ modelMembers?: string, views?: string[] }} [options]
 * @returns {string[]} die Befunde zu den Ansichtsfeldern
 */
const viewWriteFindings = (signature, body, { modelMembers = '', views = ['selected'] } = {}) => {
  const params = signature.slice(signature.indexOf('(') + 1, -1).split(',').map(p => p.trim()).filter(Boolean);
  const action = `/**
       * Die Probe.
       * @agent
${params.map(p => `       * @param {string} ${p} der Wert`).join('\n')}
       * @returns {string} die id
       */
      ${signature} { ${body} return ''; },`;
  const list = ['activeTab', ...views].map(v => `'${v}'`).join(', ');
  const root = fixture({ foo: { 'foo.js': viewVm({ extra: action }), 'foo-model.js': viewModel(
    `static VIEW_FIELDS = [${list}];\n  selected = '';\n  items = [];\n  ${modelMembers}`,
    'activeTab: this.activeTab, title: this.title, selected: this.selected, items: this.items') } });
  return collectAgentData(root).modules.foo.reported.filter(code => code.startsWith('view_field_'));
};

test('view_field_agent_write: ein Aufruf trennt die Herkunft vom Parameter', () => {
  assert.deepEqual(viewWriteFindings('add(type)', 'const q = make(type); this.model.selected = q.id;'), []);
});

test('view_field_agent_write: der Parameter selbst ist ein Befund', () => {
  assert.deepEqual(viewWriteFindings('pick(id)', 'this.model.selected = id;'), ['view_field_agent_write:selected']);
});

test('view_field_agent_write: ein reiner Alias des Parameters ist ein Befund', () => {
  assert.deepEqual(viewWriteFindings('pick(id)', 'const x = id; this.model.selected = x;'), ['view_field_agent_write:selected']);
});

test('view_field_agent_write: die Prüfung sieht zwei Model-Ebenen tief', () => {
  const modelMembers = 'set(a) { this._put(a); }\n  _put(b) { this.selected = b; }';
  assert.deepEqual(viewWriteFindings('pick(id)', 'this.model.set(id);', { modelMembers }), ['view_field_agent_write:selected']);
});

test('view_field_agent_write: ein Aliaspfad trifft das Element-Ansichtsfeld', () => {
  assert.deepEqual(
    viewWriteFindings('pick(id, v)', 'const s = this.model.items.find(i => i.id === id); s.open = v;', { views: ['items[].open'] }),
    ['view_field_agent_write:items[].open']);
});

test('view_field_agent_write: weitere Formen, die aus dem Parameter stammen', () => {
  const hit = ['view_field_agent_write:selected'];
  assert.deepEqual(viewWriteFindings('pick(id)', 'this.model.selected = id.value;'), hit, 'Eigenschaftszugriff');
  assert.deepEqual(viewWriteFindings('pick(id)', 'const x = id.value; const y = x; this.model.selected = y;'), hit, 'Kette');
  assert.deepEqual(viewWriteFindings('pick(id)', 'this.model.selected = (id);'), hit, 'Klammern');
  assert.deepEqual(viewWriteFindings('pick(id)', 'this.model.set(id.value);', { modelMembers: 'set(a) { const c = a; this.selected = c; }' }), hit, 'Alias im Model');
  assert.deepEqual(viewWriteFindings('pick(id, v)', 'this.model.open(id, v);', {
    views: ['items[].open'], modelMembers: 'open(id, v) { const s = this.items.find(i => i.id === id); s.open = v; }',
  }), ['view_field_agent_write:items[].open'], 'Aliaspfad im Model');
});

test('view_field_agent_write: was die Herkunft trennt, ist kein Befund', () => {
  assert.deepEqual(viewWriteFindings('pick(id)', 'const q = new Thing(id); this.model.selected = q.id;'), [], 'new');
  assert.deepEqual(viewWriteFindings('pick(id)', 'const q = { id }; this.model.selected = q.id;'), [], 'Objektliteral');
  assert.deepEqual(viewWriteFindings('pick(id)', 'this.model.selected = make(id);'), [], 'Aufruf rechts');
  assert.deepEqual(viewWriteFindings('pick(id)', 'this.model.selected = id ? id : null;'), [], 'Bedingung');
  assert.deepEqual(viewWriteFindings('pick(id)', 'this.model.selected = id || null;'), [], 'Operator');
  assert.deepEqual(viewWriteFindings('pick(id)', "this.model.selected = requireText('id', make(id));"), [], 'Prüfer um einen fremden Aufruf');
  assert.deepEqual(viewWriteFindings('pick(id)', "this.model.selected = this.requireText('id', id);"), [], 'Prüfer als Methode');
  assert.deepEqual(viewWriteFindings('pick(id)', "this.model.selected = requirements(id);"), [], 'nur der Name beginnt gleich');
  assert.deepEqual(viewWriteFindings('pick(id)', "const q = requireThing(make(id)); this.model.selected = q;"), [], 'Alias eines Prüfers ohne direkten Wert');
  assert.deepEqual(viewWriteFindings('pick(id)', 'this.model.set(make(id));', { modelMembers: 'set(a) { this.selected = a; }' }), [], 'Aufruf als Argument');
  assert.deepEqual(viewWriteFindings('pick(id)', 'this.model.set(id);', { modelMembers: 'set(a) { const q = make(a); this.selected = q.id; }' }), [], 'Aufruf im Model');
  assert.deepEqual(viewWriteFindings('pick(id)', 'const s = this.model.items.find(i => i.id === id); this.model.selected = s.id;'), [], 'Wert aus der Sammlung');
  assert.deepEqual(viewWriteFindings('pick(id)', '[1].forEach(id => { this.model.selected = id; });'), [], 'verdeckter Name');
});

test('view_field_agent_write: Prüfer und Typwandlung geben den Parameter zurück', () => {
  const hit = ['view_field_agent_write:selected'];
  assert.deepEqual(viewWriteFindings('pick(id)', "this.model.selected = requireText('id', id);"), hit, 'Prüfer rechts');
  assert.deepEqual(viewWriteFindings('pick(id)', "const x = requireId('id', id); this.model.selected = x;"), hit, 'Prüfer als Alias');
  assert.deepEqual(viewWriteFindings('pick(id)', "this.model.selected = requireEnum('id', id, IDS);"), hit, 'Prüfer mit Menge');
  for (const wrap of ['String', 'Number', 'Boolean']) {
    assert.deepEqual(viewWriteFindings('pick(id)', `this.model.selected = ${wrap}(id);`), hit, wrap);
  }
  assert.deepEqual(viewWriteFindings('pick(id)', "this.model.set(requireText('id', id));", { modelMembers: 'set(a) { this.selected = a; }' }), hit, 'als Argument');
  assert.deepEqual(viewWriteFindings('pick(id)', 'this.model.set(id);', { modelMembers: 'set(a) { const c = String(a); this.selected = c; }' }), hit, 'im Model');
});

test('view_field_agent_write: ein Alias im Block zählt nur dort', () => {
  const hit = ['view_field_agent_write:selected'];
  assert.deepEqual(viewWriteFindings('pick(id)', 'if (id) { const x = id; this.model.selected = x; }'), hit, 'Block');
  assert.deepEqual(viewWriteFindings('pick(id)', 'const a = id; if (id) { const b = a.v; if (b) { const c = b; this.model.selected = c; } }'), hit, 'verschachtelt');
  assert.deepEqual(viewWriteFindings('pick(id)', '[1].forEach(() => { const x = id; this.model.selected = x; });'), hit, 'Closure');
  assert.deepEqual(viewWriteFindings('pick(id)', 'if (id) { const x = id; this.model.set(x); }', { modelMembers: 'set(a) { this.selected = a; }' }), hit, 'Delegation');
  assert.deepEqual(viewWriteFindings('pick(id)', 'this.model.set(id);', { modelMembers: 'set(a) { if (a) { const c = a; this.selected = c; } }' }), hit, 'im Model');
  assert.deepEqual(viewWriteFindings('pick(id)', 'if (id) { const x = make(id); this.model.selected = x; }'), [], 'Aufruf im Block');
  assert.deepEqual(viewWriteFindings('pick(id)', 'const x = id; if (id) { const x = make(id); this.model.selected = x; }'), [], 'Neubindung im Block');
  assert.deepEqual(viewWriteFindings('pick(id)', 'if (id) { const x = id; } if (!id) { this.model.selected = x; }'), [], 'außerhalb des Blocks');
});

test('view_field_agent_write: ein Mutator mit dem Parameter ist eine Schreibung', () => {
  const hit = ['view_field_agent_write:selected'];
  assert.deepEqual(viewWriteFindings('pick(id)', 'this.model.selected.push(id);'), hit, 'direkt');
  assert.deepEqual(viewWriteFindings('pick(id)', 'this.model.add(id);', { modelMembers: 'add(a) { this.selected.push(a); }' }), hit, 'über das Model');
});

test('writtenFields: ein Block-Alias bleibt in der weiten Menge ungesehen', () => {
  const action = `/**
       * Die Probe.
       * @agent
       * @param {string} id die id
       * @returns {void}
       */
      pick(id) { if (id) { const x = id; this.model.selected = x; } },`;
  const root = fixture({ foo: { 'foo.js': viewVm({ extra: action }), 'foo-model.js': viewModel(
    "static VIEW_FIELDS = ['activeTab', 'selected'];\n  selected = '';",
    'activeTab: this.activeTab, title: this.title, selected: this.selected') } });
  assert.ok(!collectAgentData(root).writtenFields.foo.includes('selected'));
});

test('view_field_agent_write: die dritte Model-Ebene bleibt ungesehen', () => {
  const modelMembers = 'one(a) { this.two(a); }\n  two(b) { this.three(b); }\n  three(c) { this.selected = c; }';
  assert.deepEqual(viewWriteFindings('pick(id)', 'this.model.one(id);', { modelMembers }), []);
});

test('view_field_agent_write: writtenFields bleibt die weite Menge', () => {
  const action = `/**
       * Die Probe.
       * @agent
       * @param {string} type der Typ
       * @returns {string} die id
       */
      add(type) { const q = make(type); this.model.selected = q.id; return q.id; },`;
  const root = fixture({ foo: { 'foo.js': viewVm({ extra: action }), 'foo-model.js': viewModel(
    "static VIEW_FIELDS = ['activeTab', 'selected'];\n  selected = '';",
    'activeTab: this.activeTab, title: this.title, selected: this.selected') } });
  assert.ok(collectAgentData(root).writtenFields.foo.includes('selected'));
});

test('view_field_declared: reiner Typedef-Name nennt seine Schlüssel', () => {
  const typedef = `/**
 * @typedef {object} SelType
 * @property {boolean} open  offen
 */
/**
 * @typedef {object} AgentRead
 * @property {SelType} selected  die Auswahl
 */
`;
  const vm = viewVm({ typedef, readBody: "return readAgentState('foo', { selected: null }, options);" });
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': viewModel(
    "static VIEW_FIELDS = ['activeTab', 'selected.open'];\n  selected = null;",
    'activeTab: this.activeTab, title: this.title, selected: this.selected') } });
  assert.ok(collectAgentData(root).modules.foo.reported.includes('view_field_declared:selected.open'));
});

test('unresolvable_tojson: mit VIEW_FIELDS auch bei erklärter Lesefläche, und nur einmal', () => {
  const typedef = `/**
 * @typedef {object} AgentRead
 * @property {string} title  der Titel
 */
`;
  const declaredVm = viewVm({ typedef, readBody: "return readAgentState('foo', { title: '' }, options);" });
  const spreadModel = (fields) => viewModel(fields, '...this.base(), title: this.title');
  const count = (vm, model) => collectAgentData(fixture({ foo: { 'foo.js': vm, 'foo-model.js': model } }))
    .modules.foo.reported.filter(code => code === 'unresolvable_tojson').length;
  assert.equal(count(declaredVm, spreadModel("static VIEW_FIELDS = ['activeTab'];")), 1, 'erklärt, mit Liste');
  assert.equal(count(viewVm(), spreadModel("static VIEW_FIELDS = ['activeTab'];")), 1, 'abgeleitet, keine Doppelung');
  assert.equal(count(declaredVm, spreadModel('')), 0, 'erklärt, ohne Liste bleibt es still');
});

test('Ansichtsfelder: keine Ausnahme bleibt offen bei einer Vorlagenbindung', () => {
  const root = fixture({ foo: {
    'foo.js': viewVm(),
    'foo-model.js': viewModel("static VIEW_FIELDS = ['activeTab'];"),
    'foo.html': '<select x-model="model.activeTab"></select>',
  } });
  assert.deepEqual(collectAgentData(root).modules.foo.reported, []);
});

test('unreachable_write: eine direkte Zuweisung in einer @agent-Methode deckt ab', () => {
  const vm = TAGGED_VM.replace("/** @noagent */\n      cardClass(node) { return ''; },", `/**
       * @agent
       * @param {string} t
       * @returns {void}
       */
      setTitle(t) { this.model.title = String(t ?? ''); },
      /** @noagent */
      cardClass(node) { return ''; },`);
  const root = fixture({ foo: {
    'foo.js': vm,
    'foo-model.js': `export class State {
      /** @type {string} der Titel */
      title = '';
      toJSON() { return { title: this.title }; }
    }`,
    'foo.html': '<input x-model="model.title">',
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, []);
});

test('unreachable_write: eine Zuweisung in einer @noagent-Methode deckt NICHT ab', () => {
  const vm = TAGGED_VM.replace("/** @noagent */\n      cardClass(node) { return ''; },", `/** @noagent */
      setTitle(t) { this.model.title = String(t ?? ''); },
      /** @noagent */
      cardClass(node) { return ''; },`);
  const root = fixture({ foo: {
    'foo.js': vm,
    'foo-model.js': `export class State {
      /** @type {string} der Titel */
      title = '';
      toJSON() { return { title: this.title }; }
    }`,
    'foo.html': '<input x-model="model.title">',
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreachable_write:title']);
});

test('unreachable_write: Elementbindungen und Puffer lösen nichts aus', () => {
  const root = fixture({ foo: {
    'foo.js': TITLE_VM,
    'foo-model.js': `export class State {
      /** @type {string} der Titel */
      title = '';
      toJSON() { return { title: this.title }; }
    }`,
    'foo.html': '<input x-model="step.title"><input x-model="draft">',
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, []);
});

test('template_model_call: ein direkter model.*-Aufruf aus der Vorlage ist ein Befund', () => {
  const root = fixture({ foo: {
    'foo.js': TITLE_VM,
    'foo-model.js': `export class State {
      /** @type {string} der Titel */
      title = '';
      toJSON() { return { title: this.title }; }
    }`,
    'foo.html': '<button @click="model.removeTitle()">',
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['template_model_call:removeTitle']);
  // tagged⇒hard: genauso blockierend wie `unreachable_write`, nicht nur `reported`.
  assert.ok(modules.foo.violations.includes('template_model_call:removeTitle'));
  assert.equal(modules.foo.available, false);
});

test('template_model_call: ein Ereignismodifikator verdeckt den model.*-Aufruf nicht (W1-4)', () => {
  const root = fixture({ foo: {
    'foo.js': TITLE_VM,
    'foo-model.js': `export class State {
      /** @type {string} der Titel */
      title = '';
      toJSON() { return { title: this.title }; }
    }`,
    'foo.html': '<button @click.stop.prevent="model.removeTitle()">',
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['template_model_call:removeTitle']);
  assert.ok(modules.foo.violations.includes('template_model_call:removeTitle'));
  assert.equal(modules.foo.available, false);
});

test('unreachable_write: eine Delegation an eine zuweisende Model-Methode deckt ab', () => {
  // `setTitle` ruft nicht `this.model.title = …` direkt auf, sondern
  // delegiert an `this.model.setTitle(t)` — und GENAU DIE Model-Methode
  // weist `this.title` zu. Das ist die Form, die Welle-1-Module wie
  // `hypothesis-test.setPowerGoal` benutzen.
  const vm = TAGGED_VM.replace("/** @noagent */\n      cardClass(node) { return ''; },", `/**
       * @agent
       * @param {string} t
       * @returns {void}
       */
      setTitle(t) { this.model.setTitle(t); },
      /** @noagent */
      cardClass(node) { return ''; },`);
  const root = fixture({ foo: {
    'foo.js': vm,
    'foo-model.js': `export class State {
      /** @type {string} der Titel */
      title = '';
      toJSON() { return { title: this.title }; }
      setTitle(t) { this.title = String(t ?? ''); }
    }`,
    'foo.html': '<input x-model="model.title">',
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, []);
});

test('unreachable_write: eine Delegation an eine Model-Methode, die das Feld NICHT zuweist, deckt NICHT ab', () => {
  const vm = TAGGED_VM.replace("/** @noagent */\n      cardClass(node) { return ''; },", `/**
       * @agent
       * @param {string} t
       * @returns {void}
       */
      setTitle(t) { this.model.setTitle(t); },
      /** @noagent */
      cardClass(node) { return ''; },`);
  const root = fixture({ foo: {
    'foo.js': vm,
    'foo-model.js': `export class State {
      /** @type {string} der Titel */
      title = '';
      toJSON() { return { title: this.title }; }
      setTitle(t) { this.touched = true; }
    }`,
    'foo.html': '<input x-model="model.title">',
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreachable_write:title']);
});

test('unreachable_write: eine Delegation an eine nicht auflösbare Model-Methode deckt NICHT ab (fail closed)', () => {
  // Die Model-Klasse hat KEIN `setTitle` — weder eigen noch geerbt.
  const vm = TAGGED_VM.replace("/** @noagent */\n      cardClass(node) { return ''; },", `/**
       * @agent
       * @param {string} t
       * @returns {void}
       */
      setTitle(t) { this.model.setTitle(t); },
      /** @noagent */
      cardClass(node) { return ''; },`);
  const root = fixture({ foo: {
    'foo.js': vm,
    'foo-model.js': `export class State {
      /** @type {string} der Titel */
      title = '';
      toJSON() { return { title: this.title }; }
    }`,
    'foo.html': '<input x-model="model.title">',
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreachable_write:title']);
});

test('unreachable_write: eine parameterlose @agent-Methode deckt NICHT ab, auch wenn eine Model-Methode zuweist (Review-Fund, Fix-Runde 3)', () => {
  // Der exakte Repro-Fall aus dem Review: `changed()` hat keinen Parameter,
  // delegiert aber an `apply(t)`, die `this.title` zuweist. Ohne die
  // Parameterfluss-Schranke hätte das als Abdeckung gezählt — genau die
  // Form, die ein Alpine-`@change`-Handler erzeugt
  // (`control-chart.chartTypeChanged`, `histogram.binModeChanged`), und
  // R2 verlangt eine Marke an jeder öffentlichen Methode. Ein
  // parameterloses `clear()`/`changed()` ist kein Setter im Sinn der Setter-Regel.
  const vm = TAGGED_VM.replace("/** @noagent */\n      cardClass(node) { return ''; },", `/**
       * @agent
       * @returns {void}
       */
      changed() { this.model.apply(this.model.title); },
      /** @noagent */
      cardClass(node) { return ''; },`);
  const root = fixture({ foo: {
    'foo.js': vm,
    'foo-model.js': `export class State {
      /** @type {string} der Titel */
      title = '';
      toJSON() { return { title: this.title }; }
      apply(t) { this.title = t; }
    }`,
    'foo.html': '<input x-model="model.title">',
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreachable_write:title']);
  assert.equal(modules.foo.available, false);
});

test('unreachable_write: eine direkte Zuweisung einer Konstante deckt NICHT ab (kein Parameterfluss)', () => {
  // `setTitle` HAT einen Parameter `t` — weist aber eine Konstante zu,
  // nicht `t`. Ein Agent kann über diesen Setter das Feld nicht auf einen
  // von ihm gewählten Wert bringen.
  const vm = TAGGED_VM.replace("/** @noagent */\n      cardClass(node) { return ''; },", `/**
       * @agent
       * @param {string} t
       * @returns {void}
       */
      setTitle(t) { this.model.title = 'fixed'; },
      /** @noagent */
      cardClass(node) { return ''; },`);
  const root = fixture({ foo: {
    'foo.js': vm,
    'foo-model.js': `export class State {
      /** @type {string} der Titel */
      title = '';
      toJSON() { return { title: this.title }; }
    }`,
    'foo.html': '<input x-model="model.title">',
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreachable_write:title']);
});

test('unreachable_write: eine Delegation deckt ab, wenn der Wert über eine lokale Zwischenvariable aus dem Parameter fließt', () => {
  // Spiegelt `hypothesis-test.setPowerGoal`: die Model-Methode weist nicht
  // direkt ihren Parameter zu, sondern eine lokale `const`, die aus ihm
  // abgeleitet ist (`const n = parseFloat(v)`).
  const vm = TAGGED_VM.replace("/** @noagent */\n      cardClass(node) { return ''; },", `/**
       * @agent
       * @param {string} t
       * @returns {void}
       */
      setTitle(t) { this.model.setTitle(t); },
      /** @noagent */
      cardClass(node) { return ''; },`);
  const root = fixture({ foo: {
    'foo.js': vm,
    'foo-model.js': `export class State {
      /** @type {string} der Titel */
      title = '';
      toJSON() { return { title: this.title }; }
      setTitle(v) {
        const n = String(v ?? '').trim();
        this.title = n;
      }
    }`,
    'foo.html': '<input x-model="model.title">',
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, []);
});

test('unreachable_write: eine Model-Methode, die an eine weitere Methode delegiert, deckt NICHT ab (nur eine Delegationsebene)', () => {
  // Guard (a): `setTitle` (Model) weist `title` nicht selbst zu, sondern
  // ruft `applyTitle` auf, die es tut. Die Prüfung schaut nur in den
  // Körper der UNMITTELBAR aufgerufenen Methode — eine zweite Ebene zählt
  // nicht, auch wenn sie das Feld am Ende zuweist.
  const vm = TAGGED_VM.replace("/** @noagent */\n      cardClass(node) { return ''; },", `/**
       * @agent
       * @param {string} t
       * @returns {void}
       */
      setTitle(t) { this.model.setTitle(t); },
      /** @noagent */
      cardClass(node) { return ''; },`);
  const root = fixture({ foo: {
    'foo.js': vm,
    'foo-model.js': `export class State {
      /** @type {string} der Titel */
      title = '';
      toJSON() { return { title: this.title }; }
      setTitle(t) { this.applyTitle(t); }
      applyTitle(t) { this.title = t; }
    }`,
    'foo.html': '<input x-model="model.title">',
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreachable_write:title']);
});

test('unreachable_write: eine direkte `this.<feld>`-Zuweisung am Viewmodel (ohne `.model`) deckt NICHT ab', () => {
  // Guard (b): `assignTargetAfterThis` mit `through: 'model'` muss `this.title = t`
  // (am Viewmodel selbst, kein `this.model...`) verwerfen — sonst würde ein
  // Tippfehler im Modulquelltext als Abdeckung durchgehen.
  const vm = TAGGED_VM.replace("/** @noagent */\n      cardClass(node) { return ''; },", `/**
       * @agent
       * @param {string} t
       * @returns {void}
       */
      setTitle(t) { this.title = t; },
      /** @noagent */
      cardClass(node) { return ''; },`);
  const root = fixture({ foo: {
    'foo.js': vm,
    'foo-model.js': `export class State {
      /** @type {string} der Titel */
      title = '';
      toJSON() { return { title: this.title }; }
    }`,
    'foo.html': '<input x-model="model.title">',
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreachable_write:title']);
});

test('unreachable_write: eine nicht auflösbare Model-Klasse lässt eine Delegation NICHT als Abdeckung zählen (fail closed)', () => {
  // Guard (c): `Model: makeModel()` ist kein Name — `resolveModelClass`
  // liefert `null`, und die Delegation darf dann nicht stillschweigend als
  // Abdeckung gelten, nur weil sie nicht geprüft werden konnte.
  const vm = TAGGED_VM
    .replace('Model: State,', 'Model: makeModel(),')
    .replace("/** @noagent */\n      cardClass(node) { return ''; },", `/**
       * @agent
       * @param {string} t
       * @returns {void}
       */
      setTitle(t) { this.model.setTitle(t); },
      /** @noagent */
      cardClass(node) { return ''; },`);
  const root = fixture({ foo: {
    'foo.js': vm,
    'foo-model.js': `export function makeModel() { return class State {
      title = '';
      setTitle(t) { this.title = t; }
    }; }`,
    'foo.html': '<input x-model="model.title">',
  } });
  const { modules } = collectAgentData(root);
  // Vollständige Gleichheit statt nur `includes` (Review-Fund, Fix-Runde 4):
  // sonst hätte eine Regression, die `unreachable_write:title` zusätzlich
  // zu einem FALSCH angenommenen Treffer meldete, diesen Test nicht rot
  // gemacht. `unresolvable_model_class` steht ebenfalls drin — das ist der
  // erwartete, separate Befund über die Lesefläche, den `readModelFields`
  // für dieselbe nicht auflösbare `Model:`-Angabe sowieso schon meldet.
  assert.deepEqual(modules.foo.reported, ['unresolvable_model_class', 'unreachable_write:title']);
});

test('unreachable_write: ein Objektliteral-Schlüssel, der zufällig wie der Parameter heißt, beweist KEINEN Parameterfluss', () => {
  // Review-Fund, Fix-Runde 4 (1/3): `{ t: 1 }` enthält den Bezeichner `t`
  // nur als SCHLÜSSEL (ein Name, kein Verweis) — ohne die Ausnahme für
  // `PropertyAssignment` hätte das als Abdeckung gezählt, nur weil der
  // Parameter zufällig `t` heißt.
  const vm = TAGGED_VM.replace("/** @noagent */\n      cardClass(node) { return ''; },", `/**
       * @agent
       * @param {string} t
       * @returns {void}
       */
      setTitle(t) { this.model.title = { t: 1 }; },
      /** @noagent */
      cardClass(node) { return ''; },`);
  const root = fixture({ foo: {
    'foo.js': vm,
    'foo-model.js': `export class State {
      /** @type {object} der Titel */
      title = '';
      toJSON() { return { title: this.title }; }
    }`,
    'foo.html': '<input x-model="model.title">',
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreachable_write:title']);
});

test('unreachable_write: ein Closure-Parameter, der den Methodenparameter überschattet, deckt NICHT ab', () => {
  // Review-Fund, Fix-Runde 4 (2/3): `forEach((t) => { this.model.title = t; })`
  // — das `t` IN der Closure ist das Element der Iteration, nicht der
  // äußere Methodenparameter `t`, obwohl beide denselben Namen tragen.
  const vm = TAGGED_VM.replace("/** @noagent */\n      cardClass(node) { return ''; },", `/**
       * @agent
       * @param {string} t
       * @returns {void}
       */
      setTitle(t) { ['x'].forEach((t) => { this.model.title = t; }); },
      /** @noagent */
      cardClass(node) { return ''; },`);
  const root = fixture({ foo: {
    'foo.js': vm,
    'foo-model.js': `export class State {
      /** @type {string} der Titel */
      title = '';
      toJSON() { return { title: this.title }; }
    }`,
    'foo.html': '<input x-model="model.title">',
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreachable_write:title']);
});

test('unreachable_write: eine blockweit neu gebundene lokale Variable überschattet den Methodenparameter', () => {
  // Review-Fund, Fix-Runde 4 (3/3): innerhalb des `if`-Blocks ist `t` die
  // lokale Deklaration (`this.model.other` gelesen), nicht der äußere
  // Parameter — die Zuweisung `this.model.title = t` dort liest also KEINEN
  // vom Agenten gewählten Wert, auch wenn der Name identisch ist.
  const vm = TAGGED_VM.replace("/** @noagent */\n      cardClass(node) { return ''; },", `/**
       * @agent
       * @param {string} v
       * @returns {void}
       */
      setOther(v) { this.model.other = v; },
      /**
       * @agent
       * @param {string} t
       * @returns {void}
       */
      setTitle(t) {
        if (t) {
          const t = this.model.other;
          this.model.title = t;
        }
      },
      /** @noagent */
      cardClass(node) { return ''; },`);
  const root = fixture({ foo: {
    'foo.js': vm,
    'foo-model.js': `export class State {
      /** @type {string} der Titel */
      title = '';
      /** @type {string} ein anderes Feld */
      other = '';
      toJSON() { return { title: this.title, other: this.other }; }
    }`,
    'foo.html': '<input x-model="model.title">',
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreachable_write:title']);
});

test('unreachable_write: eine verschachtelte Bindung ohne Setter ist ein Befund', () => {
  const root = fixture({ foo: {
    'foo.js': WHOLE_PARAMS_VM,
    'foo-model.js': `export class State {
      /** @type {object} die Parameter */
      params = { alpha: '' };
      toJSON() { return { params: { alpha: this.params.alpha } }; }
    }`,
    'foo.html': '<input x-model="model.params.alpha">',
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreachable_write:params.alpha']);
  assert.equal(modules.foo.available, false);
});

test('unreachable_write: eine verschachtelte Zuweisung aus einem Parameter deckt ab', () => {
  const vm = TAGGED_VM.replace("/** @noagent */\n      cardClass(node) { return ''; },", `/**
       * @agent
       * @param {string} value der Wert
       * @returns {void}
       */
      setAlpha(value) { this.model.params.alpha = value; },`);
  const root = fixture({ foo: {
    'foo.js': vm,
    'foo-model.js': `export class State {
      /** @type {object} die Parameter */
      params = { alpha: '' };
      toJSON() { return { params: { alpha: this.params.alpha } }; }
    }`,
    'foo.html': '<input x-model="model.params.alpha">',
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, []);
  assert.equal(modules.foo.available, true);
});

test('unreachable_write: ein dynamischer Schlüssel deckt genau die geprüfte Menge ab', () => {
  const vm = TAGGED_VM.replace("/** @noagent */\n      cardClass(node) { return ''; },", `/**
       * @agent
       * @param {string} key der Schlüssel
       * @param {string} value der Wert
       * @returns {void}
       */
      setParam(key, value) {
        requireEnum('key', key, PARAM_KEYS);
        this.model.params[key] = value;
      },`);
  const root = fixture({ foo: {
    'foo.js': `const PARAM_KEYS = ['alpha', 'beta'];\n${vm}`,
    'foo-model.js': `export class State {
      /** @type {object} die Parameter */
      params = { alpha: '', beta: '', gamma: '' };
      toJSON() { return { params: { ...this.params } }; }
    }`,
    'foo.html': '<input x-model="model.params.alpha"><input x-model="model.params.beta"><input x-model="model.params.gamma">',
  } });
  const { modules } = collectAgentData(root);
  // alpha und beta sind abgedeckt, gamma NICHT — es steht nicht in PARAM_KEYS.
  assert.deepEqual(modules.foo.reported, ['unreachable_write:params.gamma']);
});

test('unreachable_write: ein Schlüssel mit Punkt deckt die zweite Ebene ab', () => {
  const vm = TAGGED_VM.replace("/** @noagent */\n      cardClass(node) { return ''; },", `/**
       * @agent
       * @param {string} key der Schlüssel
       * @param {string} value der Wert
       * @returns {void}
       */
      setParam(key, value) {
        requireEnum('key', key, PARAM_KEYS);
        setAtPath(this.model.params, key, value);
      },`);
  const root = fixture({ foo: {
    'foo.js': `const PARAM_KEYS = ['alpha', 'tolerance.LSL'];
function setAtPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts.slice(0, -1)) cur = cur[p];
  cur[parts[parts.length - 1]] = value;
}
${vm}`,
    'foo-model.js': `export class State {
      /** @type {object} die Parameter */
      params = { alpha: '', tolerance: { LSL: '', USL: '' } };
      toJSON() { return { params: { alpha: this.params.alpha, tolerance: { ...this.params.tolerance } } }; }
    }`,
    'foo.html': '<input x-model="model.params.alpha"><input x-model="model.params.tolerance.LSL"><input x-model="model.params.tolerance.USL">',
  } });
  const { modules } = collectAgentData(root);
  // `tolerance.USL` steht nicht in PARAM_KEYS — genau dieses Feld bleibt offen.
  assert.deepEqual(modules.foo.reported, ['unreachable_write:params.tolerance.USL']);
});

test('unreachable_write: ein dynamischer Schlüssel ohne auflösbare Menge deckt NICHTS ab', () => {
  const vm = TAGGED_VM.replace("/** @noagent */\n      cardClass(node) { return ''; },", `/**
       * @agent
       * @param {string} key der Schlüssel
       * @param {string} value der Wert
       * @returns {void}
       */
      setParam(key, value) { this.model.params[key] = value; },`);
  const root = fixture({ foo: {
    'foo.js': vm,
    'foo-model.js': `export class State {
      /** @type {object} die Parameter */
      params = { alpha: '' };
      toJSON() { return { params: { alpha: this.params.alpha } }; }
    }`,
    'foo.html': '<input x-model="model.params.alpha">',
  } });
  const { modules } = collectAgentData(root);
  // Fail closed: ohne geprüfte Schlüsselmenge ist nicht entscheidbar, welche
  // Felder der Agent wirklich treffen kann.
  assert.deepEqual(modules.foo.reported, ['unreachable_write:params.alpha']);
});

test('unreachable_write: eine Pfad-Hilfe, die nur LIEST, deckt NICHTS ab (Review-Fund)', () => {
  // Der Repro-Fall des Reviews: `logKeys` erfüllt alle äußeren Merkmale einer
  // Pfad-Hilfe (lokal auflösbar, erstes Argument `this.model.params`, ein
  // Argument mit geprüfter Schlüsselmenge) — und weist doch nichts zu. Zählte
  // sie als Abdeckung, gäbe das Gate ein Feld frei, das kein Agent setzen kann.
  const vm = WHOLE_PARAMS_VM.replace("/** @noagent */\n      cardClass(node) { return ''; },", `/**
       * @agent
       * @param {string} key der Schlüssel
       * @param {string} value der Wert
       * @returns {void}
       */
      setParam(key, value) {
        requireEnum('key', key, PARAM_KEYS);
        logKeys(this.model.params, key, value);
      },`);
  const root = fixture({ foo: {
    'foo.js': `const PARAM_KEYS = ['alpha'];
function logKeys(obj, path, value) {
  const parts = path.split('.');
  report(obj[parts[0]], value);
}
${vm}`,
    'foo-model.js': `export class State {
      /** @type {object} die Parameter */
      params = { alpha: '' };
      toJSON() { return { params: { alpha: this.params.alpha } }; }
    }`,
    'foo.html': '<input x-model="model.params.alpha">',
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreachable_write:params.alpha']);
  assert.equal(modules.foo.available, false);
});

test('unreachable_write: eine Pfeilfunktions-Pfad-Hilfe deckt ab, eine gleichnamige Klasse NICHT', () => {
  // Zwei Deklarationsformen am selben Aufruf: die Pfeilfunktion führt dieselbe
  // Aliaskette (`let cur = obj`) wie die Funktionsdeklaration und deckt
  // deshalb ab; die Klasse hat keinen Funktionskörper, den die Prüfung lesen
  // könnte, und deckt deshalb nichts ab (fail closed).
  const vm = WHOLE_PARAMS_VM.replace("/** @noagent */\n      cardClass(node) { return ''; },", `/**
       * @agent
       * @param {string} key der Schlüssel
       * @param {string} value der Wert
       * @returns {void}
       */
      setParam(key, value) {
        requireEnum('key', key, PARAM_KEYS);
        setAtPath(this.model.params, key, value);
      },`);
  const model = `export class State {
      /** @type {object} die Parameter */
      params = { alpha: '' };
      toJSON() { return { params: { alpha: this.params.alpha } }; }
    }`;
  const html = '<input x-model="model.params.alpha">';
  const arrow = fixture({ foo: {
    'foo.js': `const PARAM_KEYS = ['alpha'];
const setAtPath = (obj, path, value) => {
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts.slice(0, -1)) cur = cur[p];
  cur[parts[parts.length - 1]] = value;
};
${vm}`,
    'foo-model.js': model,
    'foo.html': html,
  } });
  assert.deepEqual(collectAgentData(arrow).modules.foo.reported, []);

  const asClass = fixture({ foo: {
    'foo.js': `const PARAM_KEYS = ['alpha'];
class setAtPath { constructor(obj, path, value) { this.obj = obj; } }
${vm}`,
    'foo-model.js': model,
    'foo.html': html,
  } });
  assert.deepEqual(collectAgentData(asClass).modules.foo.reported, ['unreachable_write:params.alpha']);
});

test('unreachable_write: ein zweimal gebundener Pfad ist EIN Befund, nicht zwei', () => {
  // `bindings.models` trägt einen Eintrag JE Bindung. Ohne Entdoppelung
  // stünde derselbe Code mehrfach in `reported` — und die Vertragsfläche,
  // die Gate und Agent lesen, zählte Bindungen statt Felder.
  const root = fixture({ foo: {
    'foo.js': WHOLE_PARAMS_VM,
    'foo-model.js': `export class State {
      /** @type {object} die Parameter */
      params = { alpha: '' };
      toJSON() { return { params: { alpha: this.params.alpha } }; }
    }`,
    'foo.html': '<input x-model="model.params.alpha"><select x-model="model.params.alpha"></select>',
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreachable_write:params.alpha']);
});

test('unresolvable_tojson: eine Pfeilfunktions-toJSON als Klassenfeld wird nicht als MethodDeclaration erkannt und klettert nicht zur Basisklasse', () => {
  // Review-Fund 3 (latent, 0 Treffer im Bestand): die alte Fassung suchte
  // `toJSON` nur als `MethodDeclaration`. Eine überschreibende Pfeilfunktion
  // als Klassenfeld fiel durch das Raster, und der Abstieg kletterte zur
  // Basisklasse — und beschrieb die Unterklasse fälschlich mit DEREN
  // Schlüsseln (`title: 'base'`, ohne `hidden`, ohne jeden Befund).
  const root = fixture({ foo: { 'foo.js': TITLE_VM.replace('this.model.title = text;', 'this.model.title = text; this.model.toJSON = text;'), 'foo-model.js': `export class Base {
    toJSON() { return { title: 'base' }; }
  }
  export class State extends Base {
    /** @type {string} der Titel */
    title = '';
    toJSON = () => ({ title: this.title, hidden: 1 });
  }` } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unresolvable_tojson']);
});

test('undeclared_option_source: eine zustandsabhängige Menge über einen lokalen Namen ist ein Befund', () => {
  // Die Form aus doe-advisor.js:170,176 — das dritte Argument ist ein
  // Bezeichner, nicht `this.*`.
  const vm = TAGGED_VM.replace("/** @noagent */\n      cardClass(node) { return ''; },", `/**
       * @agent
       * @param {string} opt die Möglichkeit
       * @returns {void}
       */
      answer(opt) {
        const options = this.model.currentOptions;
        requireEnum('opt', opt, options);
        this.model.chosen = opt;
      },`);
  const root = fixture({ foo: {
    'foo.js': vm,
    'foo-model.js': `export class State {
      /** @type {string} die Wahl */
      chosen = '';
      get currentOptions() { return ['a', 'b']; }
      toJSON() { return { chosen: this.chosen }; }
    }`,
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['undeclared_option_source:answer:opt']);
});

test('undeclared_option_source: eine eingewickelte Menge wird am inneren Zugriff benannt', () => {
  // Die Form aus unit-converter.js:217 — `Object.keys(this.model.unitKeys())`.
  // Der Feldname ist der letzte an `this` hängende Zugriff: `unitKeys`.
  const vm = TAGGED_VM.replace("/** @noagent */\n      cardClass(node) { return ''; },", `/**
       * @agent
       * @param {string} unitKey die Einheit
       * @returns {void}
       */
      setUnit(unitKey) {
        requireEnum('unitKey', unitKey, Object.keys(this.model.unitKeys()));
        this.model.chosen = unitKey;
      },`);
  const root = fixture({ foo: {
    'foo.js': vm,
    'foo-model.js': `export class State {
      /** @type {string} die Wahl */
      chosen = '';
      unitKeys() { return { m: 1, km: 1000 }; }
      toJSON() { return { chosen: this.chosen }; }
    }`,
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['undeclared_option_source:setUnit:unitKey']);
});

test('undeclared_option_source: auch requireKnownId zählt', () => {
  // Die Spaltenmenge wird mit requireKnownId geprüft. Ein Gate,
  // das nur requireEnum ansieht, ließe den Vorzeigefall dieses Plans durch.
  const vm = TAGGED_VM.replace("/** @noagent */\n      cardClass(node) { return ''; },", `/**
       * @agent
       * @param {string} key der Schlüssel
       * @returns {void}
       */
      setColumn(key) {
        requireKnownId('key', key, this.pickableColumns());
        this.model.chosen = key;
      },`);
  const root = fixture({ foo: {
    'foo.js': vm,
    'foo-model.js': `export class State {
      /** @type {string} die Wahl */
      chosen = '';
      toJSON() { return { chosen: this.chosen }; }
    }`,
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['undeclared_option_source:setColumn:key']);
});

test('undeclared_option_source: eine Konstante als Wertemenge ist kein Befund', () => {
  const vm = TAGGED_VM.replace("/** @noagent */\n      cardClass(node) { return ''; },", `/**
       * @agent
       * @param {string} mode der Modus
       * @returns {void}
       */
      setMode(mode) {
        requireEnum('mode', mode, MODES);
        this.model.chosen = mode;
      },`);
  const root = fixture({ foo: {
    'foo.js': `const MODES = ['DEG', 'RAD'];\n${vm}`,
    'foo-model.js': `export class State {
      /** @type {string} die Wahl */
      chosen = '';
      toJSON() { return { chosen: this.chosen }; }
    }`,
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, []);
});

test('undeclared_option_source: ein deklariertes Lesefeld desselben Namens genügt', () => {
  const vm = TAGGED_VM.replace("/** @noagent */\n      cardClass(node) { return ''; },", `/**
       * @agent
       * @param {string} opt die Möglichkeit
       * @returns {void}
       */
      answer(opt) {
        const options = this.model.currentOptions;
        requireEnum('opt', opt, options);
        this.model.chosen = opt;
      },`);
  const root = fixture({ foo: {
    // Der Typedef muss an der `export default`-Anweisung hängen, nicht am Dateikopf.
    'foo.js': vm.replace('export default createModule', `/**
 * @typedef {object} AgentRead
 * @property {string} chosen  die Wahl
 * @property {string[]} currentOptions  die Möglichkeiten der offenen Frage
 */
export default createModule`).replace('read() { return {}; }', "read() { return readAgentState('foo', {chosen: '', currentOptions: []}); }"),
    'foo-model.js': `export class State {
      /** @type {string} die Wahl */
      chosen = '';
      get currentOptions() { return ['a', 'b']; }
      toJSON() { return { chosen: this.chosen }; }
    }`,
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, []);
});

test('undeclared_option_source: eine _-präfixierte Menge ist kein Befund', () => {
  const vm = TAGGED_VM.replace("/** @noagent */\n      cardClass(node) { return ''; },", `/**
       * @agent
       * @param {string} v der Wert
       * @returns {void}
       */
      pick(v) {
        requireEnum('v', v, this._ids());
        this.model.chosen = v;
      },`);
  const root = fixture({ foo: {
    'foo.js': `${vm}`,
    'foo-model.js': `export class State {
      /** @type {string} die Wahl */
      chosen = '';
      toJSON() { return { chosen: this.chosen }; }
    }`,
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, []);
});

test('undeclared_option_source: ein parametrisierter Aufruf ist kein Befund', () => {
  const vm = TAGGED_VM.replace("/** @noagent */\n      cardClass(node) { return ''; },", `/**
       * @agent
       * @param {string} v der Wert
       * @returns {void}
       */
      pick(v) {
        requireEnum('v', v, this.idsFor(v));
        this.model.chosen = v;
      },`);
  const root = fixture({ foo: {
    'foo.js': `${vm}`,
    'foo-model.js': `export class State {
      /** @type {string} die Wahl */
      chosen = '';
      toJSON() { return { chosen: this.chosen }; }
    }`,
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, []);
});

test('undeclared_option_source: die Projektion eines deklarierten Feldes ist kein Befund', () => {
  const vm = TAGGED_VM.replace("/** @noagent */\n      cardClass(node) { return ''; },", `/**
       * @agent
       * @param {string} v der Wert
       * @returns {void}
       */
      pick(v) {
        requireEnum('v', v, this.model.items.map(i => i.id));
        this.model.chosen = v;
      },
      /**
       * @agent
       * @param {string[]} list die Einträge
       * @returns {void}
       */
      setItems(list) { this.model.items = list; },`);
  const root = fixture({ foo: {
    'foo.js': `${vm}`,
    'foo-model.js': `export class State {
      /** @type {string} die Wahl */
      chosen = '';
      /** @type {string[]} die Einträge */
      items = [];
      toJSON() { return { chosen: this.chosen, items: this.items }; }
    }`,
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, []);
});

test('undeclared_option_source: die Projektion eines nicht deklarierten Namens ist ein Befund', () => {
  const vm = TAGGED_VM.replace("/** @noagent */\n      cardClass(node) { return ''; },", `/**
       * @agent
       * @param {string} v der Wert
       * @returns {void}
       */
      pick(v) {
        requireEnum('v', v, this.activeParams().map(p => p.key));
        this.model.chosen = v;
      },`);
  const root = fixture({ foo: {
    'foo.js': `${vm}`,
    'foo-model.js': `export class State {
      /** @type {string} die Wahl */
      chosen = '';
      toJSON() { return { chosen: this.chosen }; }
    }`,
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['undeclared_option_source:pick:v']);
});

// ── Abschluss-Review Welle 2, Teil F-A ────────────────────────────────────

/** Ein `@agent`-Methodenrumpf im Testmodul, der `cardClass` ersetzt. */
function vmWithAgent(method) {
  return TAGGED_VM.replace("/** @noagent */\n      cardClass(node) { return ''; },", method);
}

const CHOSEN_MODEL = `export class State {
      /** @type {string} die Wahl */
      chosen = '';
      toJSON() { return { chosen: this.chosen }; }
    }`;

const SET_COLUMN_ELEMENT_ACCESS = `/**
       * @agent
       * @param {string} slot der Platz
       * @param {string} ref die Spalte
       * @returns {void}
       */
      setColumn(slot, ref) {
        const keys = this.pickableColumns()[slot].map(c => c.key);
        requireKnownId('ref', ref, keys);
        this.model.chosen = ref;
      },`;

test('undeclared_option_source: ein Elementzugriff ohne Lesefeld ist ein Befund (A-I1)', () => {
  const root = fixture({ foo: {
    'foo.js': vmWithAgent(SET_COLUMN_ELEMENT_ACCESS),
    'foo-model.js': CHOSEN_MODEL,
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['undeclared_option_source:setColumn:ref']);
});

test('undeclared_option_source: ein Elementzugriff mit Lesefeld ist kein Befund (A-I1)', () => {
  const root = fixture({ foo: {
    'foo.js': vmWithAgent(SET_COLUMN_ELEMENT_ACCESS).replace('export default createModule', `/**
 * @typedef {object} AgentRead
 * @property {string} chosen  die Wahl
 * @property {object} pickableColumns  die wählbaren Spalten je Platz
 */
export default createModule`).replace('read() { return {}; }', "read() { return readAgentState('foo', {chosen: '', pickableColumns: {}}); }"),
    'foo-model.js': CHOSEN_MODEL,
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, []);
});

test('undeclared_option_source: eine Alias-Kette über zwei Stufen wird verfolgt', () => {
  const root = fixture({ foo: {
    'foo.js': vmWithAgent(`/**
       * @agent
       * @param {string} v der Wert
       * @returns {void}
       */
      pick(v) {
        const a = this.owners();
        const b = a;
        requireEnum('v', v, b);
        this.model.chosen = v;
      },`),
    'foo-model.js': CHOSEN_MODEL,
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['undeclared_option_source:pick:v']);
});

test('undeclared_option_source: eine .filter-Projektion eines nicht deklarierten Namens ist ein Befund', () => {
  const root = fixture({ foo: {
    'foo.js': vmWithAgent(`/**
       * @agent
       * @param {string} v der Wert
       * @returns {void}
       */
      pick(v) {
        requireEnum('v', v, this.owners().filter(o => o));
        this.model.chosen = v;
      },`),
    'foo-model.js': CHOSEN_MODEL,
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['undeclared_option_source:pick:v']);
});

test('undeclared_option_source: bares this.model als Menge ist kein Befund (blinder Fleck)', () => {
  const root = fixture({ foo: {
    'foo.js': vmWithAgent(`/**
       * @agent
       * @param {string} v der Wert
       * @returns {void}
       */
      pick(v) {
        requireEnum('v', v, Object.keys(this.model));
        this.model.chosen = v;
      },`),
    'foo-model.js': CHOSEN_MODEL,
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, []);
});

test('undeclared_option_source: zwei Prüfungen derselben Menge sind EIN Befund', () => {
  const root = fixture({ foo: {
    'foo.js': vmWithAgent(`/**
       * @agent
       * @param {string} v der Wert
       * @returns {void}
       */
      pick(v) {
        requireEnum('v', v, this.owners());
        requireKnownId('v', v, this.owners());
        this.model.chosen = v;
      },`),
    'foo-model.js': CHOSEN_MODEL,
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['undeclared_option_source:pick:v']);
});

const PARAMS_MODEL = `export class State {
      /** @type {object} die Parameter */
      params = { alpha: 0, beta: 0 };
      toJSON() { return { params: { ...this.params } }; }
    }`;
const PARAMS_HTML = '<input x-model="model.params.alpha"><input x-model="model.params.beta">';
const SET_AT_PATH = `const KEYS = ['alpha', 'beta'];
function setAtPath(obj, path, value) { obj[path] = value; }
`;

/** Schreibt `params` als Ganzes; eine Bindung auf `params.alpha` deckt das nicht ab. */
const SET_WHOLE_PARAMS = `/**
       * @agent
       * @param {object} params die Parameter
       * @returns {void}
       */
      setParams(params) { this.model.params = params; },`;

test('unreachable_write: eine Pfad-Hilfe mit konstantem Wert deckt NICHTS ab (A-I3)', () => {
  const root = fixture({ foo: {
    'foo.js': SET_AT_PATH + vmWithAgent(`${SET_WHOLE_PARAMS}
      /**
       * @agent
       * @param {string} key der Schlüssel
       * @returns {void}
       */
      reset(key) {
        requireEnum('key', key, KEYS);
        setAtPath(this.model.params, key, 0);
      },`),
    'foo-model.js': PARAMS_MODEL,
    'foo.html': PARAMS_HTML,
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreachable_write:params.alpha', 'unreachable_write:params.beta']);
});

test('unreachable_write: ein überschatteter Schlüssel deckt NICHTS ab (A-M2)', () => {
  const root = fixture({ foo: {
    'foo.js': `const KEYS = ['alpha', 'beta'];\n` + vmWithAgent(`/**
       * @agent
       * @param {string} key der Schlüssel
       * @param {number} value der Wert
       * @returns {void}
       */
      setParam(key, value) {
        requireEnum('key', key, KEYS);
        Object.keys(this.model.params).forEach(key => { this.model.params[key] = value; });
      },`),
    'foo-model.js': PARAMS_MODEL,
    'foo.html': PARAMS_HTML,
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreachable_write:params.alpha', 'unreachable_write:params.beta']);
});

test('unreachable_write: ein überschatteter Schlüssel an einer Pfad-Hilfe deckt NICHTS ab (A-M2)', () => {
  const root = fixture({ foo: {
    'foo.js': SET_AT_PATH + vmWithAgent(`${SET_WHOLE_PARAMS}
      /**
       * @agent
       * @param {string} key der Schlüssel
       * @param {number} value der Wert
       * @returns {void}
       */
      setParam(key, value) {
        requireEnum('key', key, KEYS);
        Object.keys(this.model.params).forEach(key => setAtPath(this.model.params, key, value));
      },`),
    'foo-model.js': PARAMS_MODEL,
    'foo.html': PARAMS_HTML,
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreachable_write:params.alpha', 'unreachable_write:params.beta']);
});

test('unreachable_write: eine Pfad-Hilfe mit Parameterwert deckt die geprüfte Menge ab', () => {
  const root = fixture({ foo: {
    'foo.js': SET_AT_PATH + vmWithAgent(`/**
       * @agent
       * @param {string} key der Schlüssel
       * @param {number} value der Wert
       * @returns {void}
       */
      setParam(key, value) {
        requireEnum('key', key, KEYS);
        setAtPath(this.model.params, key, value);
      },`),
    'foo-model.js': PARAMS_MODEL,
    'foo.html': PARAMS_HTML,
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, []);
});

// Flaches Model: Schlüssel liegen an der Wurzel (`this.model[key]`), nicht unter `params`.
const FLAT_MODEL = `export class State {
      /** @type {number} Alpha */
      alpha = 0.05;
      /** @type {number} Power */
      power = 0.8;
      /** @type {object} Statistik-Parameter */
      statParams = { trim: 0.1 };
      toJSON() { return { alpha: this.alpha, power: this.power, statParams: { ...this.statParams } }; }
    }`;
const FLAT_HTML = '<input x-model="model.alpha"><input x-model="model.power">'
  + '<input x-model.number="model.statParams.trim">';

/**
 * Fixture für das flache Model: eine `@agent`-Methode `setParam` mit dem
 * gegebenen Rumpf, davor die gegebene Schlüsselkonstante und Hilfen.
 * @param {string} head  Deklarationen vor der Klasse
 * @param {string} body  Rumpf von `setParam(key, value)`
 * @returns {string}
 */
function flatRoot(head, body) {
  return fixture({ foo: {
    'foo.js': head + vmWithAgent(`/**
       * @agent
       * @param {string} key der Schlüssel
       * @param {number} value der Wert
       * @returns {void}
       */
      setParam(key, value) {
${body}
      },`),
    'foo-model.js': FLAT_MODEL,
    'foo.html': FLAT_HTML,
  } });
}

test('unreachable_write: eine Direktzuweisung an der Model-Wurzel deckt die geprüften Schlüssel ab', () => {
  const root = flatRoot(`const PARAM_KEYS = ['alpha', 'power'];\n`,
    `        requireEnum('key', key, PARAM_KEYS);\n        this.model[key] = value;`);
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported.filter(r => /:(alpha|power)$/.test(r)), []);
});

test('unreachable_write: eine importierte Pfad-Hilfe deckt die geprüfte Menge ab', () => {
  const root = fixture({ foo: {
    'foo.js': `import { setAtPath } from './foo-path.js';\nconst KEYS = ['alpha', 'beta'];\n` + vmWithAgent(`/**
       * @agent
       * @param {string} key der Schlüssel
       * @param {number} value der Wert
       * @returns {void}
       */
      setParam(key, value) {
        requireEnum('key', key, KEYS);
        setAtPath(this.model.params, key, value);
      },`),
    'foo-path.js': 'export function setAtPath(obj, path, value) { obj[path] = value; }\n',
    'foo-model.js': PARAMS_MODEL,
    'foo.html': PARAMS_HTML,
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, []);
});

test('unreachable_write: eine importierte Hilfe, die nur LIEST, deckt NICHTS ab', () => {
  const root = fixture({ foo: {
    'foo.js': `import { setAtPath } from './foo-path.js';\nconst KEYS = ['alpha', 'beta'];\n` + vmWithAgent(`/**
       * @agent
       * @param {string} key der Schlüssel
       * @param {number} value der Wert
       * @returns {void}
       */
      setParam(key, value) {
        requireEnum('key', key, KEYS);
        setAtPath(this.model.params, key, value);
      },`),
    'foo-path.js': 'export function setAtPath(obj, path, value) { report(obj[path], value); }\n',
    'foo-model.js': PARAMS_MODEL,
    'foo.html': PARAMS_HTML,
  } });
  const { modules } = collectAgentData(root);
  assert.notDeepEqual(modules.foo.reported, []);
});

test('unreachable_write: eine Pfad-Hilfe an der Model-Wurzel deckt Punkt-Schlüssel ab', () => {
  const root = flatRoot(`const PARAM_KEYS = ['alpha', 'statParams.trim'];
function setAtPath(obj, path, value) { obj[path] = value; }
`, `        requireEnum('key', key, PARAM_KEYS);\n        setAtPath(this.model, key, value);`);
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported.filter(r => /:(alpha|statParams\.trim)$/.test(r)), []);
});

test('unreachable_write: Wächter – ohne requireEnum bleibt die Wurzelzuweisung ungedeckt', () => {
  const root = flatRoot(`const PARAM_KEYS = ['alpha', 'power'];\n`, `        this.model[key] = value;`);
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported.filter(r => /:(alpha|power)$/.test(r)),
    ['unreachable_write:alpha', 'unreachable_write:power']);
});

test('unreachable_write: Wächter – ein konstanter Wert an der Model-Wurzel deckt NICHTS ab', () => {
  const root = flatRoot(`const PARAM_KEYS = ['alpha', 'power'];\n`,
    `        requireEnum('key', key, PARAM_KEYS);\n        this.model[key] = 42;`);
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported.filter(r => /:(alpha|power)$/.test(r)),
    ['unreachable_write:alpha', 'unreachable_write:power']);
});

/* ── Deklarierte Schlüssel eines generischen Setters (`keyof <Typedef>`) ──
   `setParam(key, value)` bündelt viele Eingaben unter einer Aktion. Ohne
   Deklaration standen Schlüsselmenge, Wertebereich und Beschreibung je
   Schlüssel an drei Stellen (`PARAM_KEYS`, `PARAM_CHECKS`, Prosa), und nichts
   verband sie. Mit `@param {keyof Params} key` liest der Generator die
   Typedef `Params` als die Schlüsselfläche der Aktion und prüft sie gegen
   die Laufzeitmengen. */

/** Ein Modul mit generischem Setter; `typedef`, `keys`, `checks` ersetzbar. */
function keyedVm({
  typedef = ` * @typedef {object} Params
 * @property {string} name der Name des Merkmals
 * @property {'0.2'|'0.15'} k1 der Anteil der Toleranz
 * @property {number} n die Anzahl`,
  keys = "['name', 'k1', 'n']",
  checks = `{
  name: (v) => requireText('value', v),
  k1: (v) => requireEnum('value', v, K1_OPTIONS),
  n: (v) => requireNumber('value', v),
}`,
  keyParamType = 'keyof Params',
} = {}) {
  const vm = TAGGED_VM.replace("/** @noagent */\n      cardClass(node) { return ''; },", `/**
       * Einen Parameter setzen.
       * @agent
       * @param {${keyParamType}} key welcher Parameter
       * @param {string} value der Wert
       * @returns {void}
       */
      setParam(key, value) {
        requireEnum('key', key, PARAM_KEYS);
        this.model.params[key] = PARAM_CHECKS[key](value);
      },`).replace('export default createModule', `/**
${typedef}
 */
export default createModule`);
  return `const PARAM_KEYS = ${keys};
const K1_OPTIONS = ['0.2', '0.15'];
const PARAM_CHECKS = ${checks};
${vm}`;
}

const KEYED_MODEL = `export class State {
  /** @type {object} die Parameter */
  params = { name: '', k1: '0.2', n: 0 };
  toJSON() { return { params: { ...this.params } }; }
}`;

function keyedModules(opts) {
  const root = fixture({ foo: { 'foo.js': keyedVm(opts), 'foo-model.js': KEYED_MODEL } });
  return collectAgentData(root).modules;
}

test('Schlüsselfläche: keyof Params liefert je Schlüssel Typ und Prosa an der Aktion', () => {
  const { foo } = keyedModules();
  assert.deepEqual(foo.reported, []);
  assert.deepEqual(foo.actions.setParam.keys, {
    name: { type: 'string', help: 'der Name des Merkmals' },
    k1: { type: "'0.2'|'0.15'", help: 'der Anteil der Toleranz' },
    n: { type: 'number', help: 'die Anzahl' },
  });
});

test('Schlüsselfläche: der Schlüsselparameter trägt in der Registry die Vereinigung der Schlüssel', () => {
  const { foo } = keyedModules();
  const key = foo.actions.setParam.params.find(p => p.name === 'key');
  assert.equal(key.type, "'name'|'k1'|'n'");
});

test('Schlüsselfläche: eine Aktion ohne keyof trägt kein keys-Feld', () => {
  const { foo } = keyedModules();
  assert.equal('keys' in foo.actions.setProblem, false);
});

test('Schlüsselfläche: eine nicht auffindbare Typedef ist ein Verstoß', () => {
  const { foo } = keyedModules({ keyParamType: 'keyof Missing' });
  assert.deepEqual(foo.reported, ['unresolved_key_typedef:setParam:Missing']);
});

test('Schlüsselfläche: weicht PARAM_KEYS von der Typedef ab, wird jeder abweichende Schlüssel gemeldet', () => {
  const { foo } = keyedModules({ keys: "['name', 'k1', 'extra']" });
  assert.deepEqual(foo.reported, ['key_set_mismatch:setParam:extra', 'key_set_mismatch:setParam:n']);
});

test('Schlüsselfläche: ohne auflösbare Laufzeitmenge ist die Schlüsselmenge ungeprüft — ein Verstoß', () => {
  const vm = keyedVm().replace("requireEnum('key', key, PARAM_KEYS);", "requireEnum('key', key, this.activeParams());");
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': KEYED_MODEL } });
  const { modules } = collectAgentData(root);
  assert.ok(modules.foo.reported.includes('unverified_key_set:setParam'), modules.foo.reported.join(', '));
});

test('Schlüsselfläche: ein requireEnum über die Elemente einer Liste prüft nicht den ganzen Wert', () => {
  // `enabled: string[]` wird elementweise gegen eine Menge geprüft. Das ist
  // keine Aussage über den Typ des Werts selbst und darf nicht gegen die
  // Typedef gehalten werden.
  const { foo } = keyedModules({
    typedef: ` * @typedef {object} Params
 * @property {string} name der Name des Merkmals
 * @property {'0.2'|'0.15'} k1 der Anteil der Toleranz
 * @property {string[]} n die gewählten Anteile`,
    checks: `{
  name: (v) => requireText('value', v),
  k1: (v) => requireEnum('value', v, K1_OPTIONS),
  n: (v) => { for (const m of v) requireEnum('m', m, K1_OPTIONS); return v; },
}`,
  });
  assert.deepEqual(foo.reported, []);
});

/** Der Viewmodel-Text mit `PARAM_KEYS` als benanntem Import statt lokaler Konstante. */
function importedKeysVm(specifier, importName = 'PARAM_KEYS') {
  const local = importName === 'PARAM_KEYS' ? 'PARAM_KEYS' : `${importName} as PARAM_KEYS`;
  return `import { ${local} } from '${specifier}';\n${keyedVm().replace("const PARAM_KEYS = ['name', 'k1', 'n'];\n", '')}`;
}

test('Schlüsselfläche: eine importierte Laufzeitmenge wird über den Import aufgelöst', () => {
  const root = fixture({ foo: {
    'foo.js': importedKeysVm('./foo-keys.js'),
    'foo-model.js': KEYED_MODEL,
    'foo-keys.js': "export const PARAM_KEYS = ['name', 'k1', 'n'];\n",
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, []);
});

test('Schlüsselfläche: ein umbenannter Import zählt wie der Originalname', () => {
  const root = fixture({ foo: {
    'foo.js': importedKeysVm('./foo-keys.js', 'KEYS'),
    'foo-model.js': KEYED_MODEL,
    'foo-keys.js': "export const KEYS = ['name', 'k1', 'n'];\n",
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, []);
});

test('Schlüsselfläche: weicht die importierte Menge von der Typedef ab, wird jeder abweichende Schlüssel gemeldet', () => {
  const root = fixture({ foo: {
    'foo.js': importedKeysVm('./foo-keys.js'),
    'foo-model.js': KEYED_MODEL,
    'foo-keys.js': "export const PARAM_KEYS = ['name', 'k1', 'extra'];\n",
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['key_set_mismatch:setParam:extra', 'key_set_mismatch:setParam:n']);
});

test('Schlüsselfläche: ein Import aus einem Paket ist nicht auflösbar — die Menge bleibt ungeprüft', () => {
  const root = fixture({ foo: {
    'foo.js': importedKeysVm('some-package'),
    'foo-model.js': KEYED_MODEL,
  } });
  const { modules } = collectAgentData(root);
  assert.ok(modules.foo.reported.includes('unverified_key_set:setParam'), modules.foo.reported.join(', '));
});

test('Schlüsselfläche: ein Wertebereich, der nicht zur Prüfung passt, ist ein Verstoß', () => {
  const { foo } = keyedModules({ typedef: ` * @typedef {object} Params
 * @property {string} name der Name
 * @property {'0.2'|'0.1'} k1 der Anteil
 * @property {string} n die Anzahl` });
  assert.deepEqual(foo.reported, ['key_value_mismatch:setParam:k1', 'key_value_mismatch:setParam:n']);
});

test('Schlüsselfläche: eine eigene Prüffunktion ist ein blinder Fleck, kein Verstoß', () => {
  const { foo } = keyedModules({ checks: `{
  name: (v) => requireText('value', v),
  k1: (v) => requireEnum('value', v, K1_OPTIONS),
  n: (v) => customCheck(v),
}` });
  assert.deepEqual(foo.reported, []);
});

test('Schlüsselfläche: requireBoolean passt zu boolean und nicht zu string', () => {
  const td = t => ` * @typedef {object} Params
 * @property {string} name der Name
 * @property {'0.2'|'0.15'} k1 der Anteil
 * @property {${t}} n der Schalter`;
  const checks = `{
  name: (v) => requireText('value', v),
  k1: (v) => requireEnum('value', v, K1_OPTIONS),
  n: (v) => requireBoolean('value', v),
}`;
  assert.deepEqual(keyedModules({ typedef: td('boolean'), checks }).foo.reported, []);
  assert.deepEqual(keyedModules({ typedef: td('string'), checks }).foo.reported, ['key_value_mismatch:setParam:n']);
});

test('Schlüsselfläche: requireNumericText passt zu string und nicht zu number', () => {
  const td = t => ` * @typedef {object} Params
 * @property {string} name der Name
 * @property {'0.2'|'0.15'} k1 der Anteil
 * @property {${t}} n die Eingabe`;
  const checks = `{
  name: (v) => requireText('value', v),
  k1: (v) => requireEnum('value', v, K1_OPTIONS),
  n: (v) => requireNumericText('value', v),
}`;
  assert.deepEqual(keyedModules({ typedef: td('string'), checks }).foo.reported, []);
  assert.deepEqual(keyedModules({ typedef: td('number'), checks }).foo.reported, ['key_value_mismatch:setParam:n']);
});

test('Schlüsselfläche: die Typedef wird auch gefunden, wenn vor derselben Anweisung noch ein JSDoc-Block folgt', () => {
  const vm = keyedVm().replace('const PARAM_KEYS =', `/**
 * @typedef {object} Params2
 * @property {string} name der Name des Merkmals
 * @property {'0.2'|'0.15'} k1 der Anteil der Toleranz
 * @property {number} n die Anzahl
 */

/** Die Schlüssel. */
const PARAM_KEYS =`).replace('{keyof Params}', '{keyof Params2}');
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': KEYED_MODEL } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, []);
  assert.deepEqual(Object.keys(modules.foo.actions.setParam.keys), ['name', 'k1', 'n']);
});

/* ── Ausgaben: eine Lesefläche, deren Feldtyp eine Typedef der Moduldatei ist ──
   `@property {Result|null} result` in `AgentRead` macht die Kennzahlen des
   Ergebnisses einzeln beschreibbar: der Generator legt `keys` (je Property
   Typ und Prosa) und `keysOf` (der Typedef-Name, aus dem der i18n-Schlüssel
   `types.<Typedef>.<property>` entsteht) an das Feld — verschachtelt, wo eine
   Property selbst eine Typedef ist, auch als Liste (`Detail[]`). */

const RESULT_VM = `/**
 * Foo module.
 * @agent
 */
import { createModule } from '../../core/template-module.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';

/**
 * @typedef {object} BiasTest
 * @property {number|null} p der p-Wert
 */

/**
 * @typedef {object} Detail
 * @property {number} value der Messwert
 */

/**
 * @typedef {object} Result
 * @property {number|null} Cg die Fähigkeit
 * @property {'pass'|'fail'} overall das Urteil
 * @property {BiasTest} biasTest der Test
 * @property {Detail[]} details die Einzelwerte
 */

/**
 * @typedef {object} AgentRead
 * @property {Result|null} result das Ergebnis
 * @property {Unknown[]} things etwas ohne Typedef
 * @property {string} name der Name
 */
export default createModule({
  config: { id: 'foo' },
  data(module, _t) {
    return {
      /**
       * Lesen.
       * @agent
       * @returns {AgentRead} alles
       */
      read() { return readAgentState('foo', { result: null, things: [], name: '' }); },
      /**
       * @agent
       * @param {string} text der Text
       * @returns {void}
       */
      setName(text) { this.model.name = text; },
    };
  },
});`;

function resultModules() {
  return collectAgentData(fixture({ foo: { 'foo.js': RESULT_VM } })).modules;
}

test('Ausgaben: ein Feld vom Typ einer Typedef trägt keys und keysOf, verschachtelt', () => {
  const { foo } = resultModules();
  const result = foo.fields.result;
  assert.equal(result.type, 'Result|null');
  assert.equal(result.keysOf, 'Result');
  assert.deepEqual(Object.keys(result.keys), ['Cg', 'overall', 'biasTest', 'details']);
  assert.deepEqual(result.keys.Cg, { type: 'number|null', help: 'die Fähigkeit' });
  assert.equal(result.keys.biasTest.keysOf, 'BiasTest');
  assert.deepEqual(result.keys.biasTest.keys, { p: { type: 'number|null', help: 'der p-Wert' } });
  assert.equal(result.keys.details.keysOf, 'Detail');
  assert.deepEqual(Object.keys(result.keys.details.keys), ['value']);
});

test('Ausgaben: ein Typname ohne Typedef in der Moduldatei bleibt ohne keys und ohne Befund', () => {
  const { foo } = resultModules();
  assert.equal('keys' in foo.fields.things, false);
  assert.equal('keys' in foo.fields.name, false);
  assert.deepEqual(foo.reported, []);
});

test('Ausgaben: die Schlüsselfläche eines generischen Setters nennt ihre Typedef (keysOf)', () => {
  const { foo } = keyedModules();
  assert.equal(foo.actions.setParam.keysOf, 'Params');
});

test('Ausgaben: eine eckig geklammerte Property ist optional, die anderen tragen kein optional', () => {
  const vm = RESULT_VM.replace(
    ' * @property {number|null} Cg die Fähigkeit',
    ' * @property {number|null} Cg die Fähigkeit\n * @property {number} [Cgk] nur bei zweiseitiger Toleranz',
  );
  const { modules } = collectAgentData(fixture({ foo: { 'foo.js': vm } }));
  const keys = modules.foo.fields.result.keys;
  assert.deepEqual(keys.Cgk, { type: 'number', help: 'nur bei zweiseitiger Toleranz', optional: true });
  assert.equal('optional' in keys.Cg, false);
});

test('Ausgaben: eine Map Object<string, T> trägt keys und keysOf ihrer Werttypedef', () => {
  const vm = RESULT_VM.replace(
    ' * @property {Detail[]} details die Einzelwerte',
    ' * @property {Detail[]} details die Einzelwerte\n'
    + ' * @property {Object<string, Detail>} byName je Name ein Einzelwert\n'
    + ' * @property {Object<string, Detail>|null} [byOther] je Name, manchmal leer\n'
    + ' * @property {Object<string, number>} means je Name der Mittelwert',
  );
  const { modules } = collectAgentData(fixture({ foo: { 'foo.js': vm } }));
  const keys = modules.foo.fields.result.keys;
  assert.equal(keys.byName.type, 'Object<string, Detail>');
  assert.equal(keys.byName.keysOf, 'Detail');
  assert.deepEqual(Object.keys(keys.byName.keys), ['value']);
  assert.equal(keys.byOther.keysOf, 'Detail');
  assert.equal(keys.byOther.optional, true);
  assert.equal('keys' in keys.means, false, 'eine Map über einen Grundtyp bleibt ohne keys');
  assert.deepEqual(modules.foo.reported, []);
});

test('Ausgaben: eine Typedef, die sich selbst enthält, bricht die Auflösung nicht', () => {
  const vm = RESULT_VM.replace(' * @property {number|null} p der p-Wert', ' * @property {number|null} p der p-Wert\n * @property {BiasTest} again zyklisch');
  const { modules } = collectAgentData(fixture({ foo: { 'foo.js': vm } }));
  const again = modules.foo.fields.result.keys.biasTest.keys.again;
  assert.equal(again.type, 'BiasTest');
  assert.equal('keys' in again, false, 'eine zweite Ebene derselben Typedef wird nicht aufgelöst');
});

const RECORD_MODEL = `/**
 * Eine Zeile, wie toJSON() sie liefert.
 * @typedef {object} Entry
 * @property {string} id  die Kennung
 * @property {Note[]} notes  die Notizen
 */

/**
 * @typedef {object} Note
 * @property {string} text  der Text
 */
export class State {
  /**
   * @type {Entry[]} die Zeilen
   * @agentBulk
   */
  entries = [];
  /** @type {Unknown[]} ohne Typedef */
  others = [];
  toJSON() { return { entries: this.entries, others: this.others }; }
}`;

test('Ausgaben: ein Model-Feld vom Typ einer Typedef der Model-Datei trägt keys und keysOf', () => {
  const { modules } = collectAgentData(fixture({ foo: { 'foo.js': CLEAN_VM, 'foo-model.js': RECORD_MODEL } }));
  const entries = modules.foo.fields.entries;
  assert.equal(entries.type, 'Entry[]');
  assert.equal(entries.bulk, true);
  assert.equal(entries.keysOf, 'Entry');
  assert.deepEqual(Object.keys(entries.keys), ['id', 'notes']);
  assert.deepEqual(entries.keys.id, { type: 'string', help: 'die Kennung' });
  assert.equal(entries.keys.notes.keysOf, 'Note');
  assert.deepEqual(Object.keys(entries.keys.notes.keys), ['text']);
});

test('Ausgaben: ein Model-Feld ohne passende Typedef bleibt ohne keys', () => {
  const { modules } = collectAgentData(fixture({ foo: { 'foo.js': CLEAN_VM, 'foo-model.js': RECORD_MODEL } }));
  assert.equal('keys' in modules.foo.fields.others, false);
  assert.deepEqual(modules.foo.fields.entries.help, 'die Zeilen');
});

// ── Teil-Viewmodels ─────────────────────────────

/**
 * Modul `foo` mit dem Teil-Viewmodel `draft` aus `viewmodel/draft.js`.
 * @param {string} draftBody  Quelltext von viewmodel/draft.js
 * @param {{ imports?: string, members?: string, html?: string|null, extra?: Record<string, string> }} [opts]
 */
function subVmFixture(draftBody, { imports = '', members = '', html = null, extra = {} } = {}) {
  const vm = `/**
 * Foo module.
 * @agent
 */
import { createModule } from '../../core/template-module.js';
import { State } from './foo-model.js';
import { DraftViewModel } from './viewmodel/draft.js';
${imports}
export default createModule({
  config: { id: 'foo' },
  Model: State,
  data(module, _t) {
    return {
      draft: new DraftViewModel({ t: _t }),
      cache: new Map(),
      collator: new Intl.Collator('de'),
      buffer: makeBuffer(),
      ${members}
      /**
       * Read the full state.
       * @agent
       * @returns {object} the state
       */
      read() { return {}; },
    };
  },
});`;
  const files = { 'foo.js': vm, 'foo-model.js': MODEL };
  if (html !== null) files['foo.html'] = html;
  return fixture({ foo: files }, { 'js/modules/foo/viewmodel/draft.js': draftBody, ...extra });
}

const DRAFT_VM = `export class DraftViewModel {
  constructor({ t }) {
    this._t = t;
    this.model = null;
  }
  /** @noagent lifecycle */
  attach({ model }) { this.model = model; }
  /**
   * Set the problem statement.
   * @agent
   * @param {string} text the problem statement
   * @returns {void}
   */
  setProblem(text) { this.model.problem = text; this.model.nodes = text; this.model.rows = text; }
  /** @noagent presentation */
  problemClass() { return {}; }
  _helper() {}
  static create() { return new DraftViewModel({}); }
}`;

const FROM_DRAFT = '@js/modules/foo/viewmodel/draft.js';

test('Teil-Viewmodel: Methoden werden zu Aktionen <teil>.<methode>; eingebaute Klassen und Fabriken bleiben Daten', () => {
  const { modules } = collectAgentData(subVmFixture(DRAFT_VM));
  assert.deepEqual(modules.foo.violations, []);
  assert.equal(modules.foo.available, true);
  assert.deepEqual(Object.keys(modules.foo.actions).sort(), ['draft.setProblem', 'read']);
  assert.deepEqual(modules.foo.actions['draft.setProblem'].params,
    [{ name: 'text', type: 'string', optional: false, help: 'the problem statement' }]);
});

test('Teil-Viewmodel: Befunde tragen das Präfix und die Datei der Klasse', () => {
  const body = DRAFT_VM
    .replace('/** @noagent presentation */\n  problemClass', 'problemClass')
    .replace('   * @param {string} text the problem statement\n', '');
  const { modules } = collectAgentData(subVmFixture(body));
  assert.deepEqual([...modules.foo.violations].sort(), [
    `missing_param:draft.setProblem.text${FROM_DRAFT}`,
    `unmarked_method:draft.problemClass${FROM_DRAFT}`,
  ]);
});

test('Teil-Viewmodel: eine Wurzelbindung x-model="model.…" zählt als abgedeckt, wenn eine @agent-Methode des Teils sie schreibt', () => {
  const { modules } = collectAgentData(subVmFixture(DRAFT_VM, { html: '<input x-model="model.problem">' }));
  assert.ok(!modules.foo.reported.includes('unreachable_write:problem'), modules.foo.reported.join(', '));
});

test('Teil-Viewmodel: importiert, aber keine auflösbare Klasse → unresolved_sub_viewmodel', () => {
  const { modules } = collectAgentData(subVmFixture(DRAFT_VM, {
    imports: "import { GhostViewModel } from './viewmodel/ghost.js';",
    members: 'ghost: new GhostViewModel(),',
  }));
  assert.ok(modules.foo.reported.includes('unresolved_sub_viewmodel:ghost'), modules.foo.reported.join(', '));
  assert.equal(modules.foo.available, false);
});

test('Teil-Viewmodel: eine Klasse mit extends → unresolved_sub_viewmodel', () => {
  const { modules } = collectAgentData(subVmFixture(DRAFT_VM, {
    imports: "import { ChildViewModel } from './viewmodel/child.js';",
    members: 'child: new ChildViewModel(),',
    extra: { 'js/modules/foo/viewmodel/child.js': 'export class BaseViewModel {}\nexport class ChildViewModel extends BaseViewModel {}' },
  }));
  assert.ok(modules.foo.reported.includes('unresolved_sub_viewmodel:child'), modules.foo.reported.join(', '));
});

test('Teil-Viewmodel: ein Teil-Viewmodel im Teil-Viewmodel → nested_sub_viewmodel; eingebaute Klassen und _-Felder nicht', () => {
  const body = DRAFT_VM
    .replace('export class DraftViewModel', "import { InnerViewModel } from './inner.js';\nexport class DraftViewModel")
    .replace('    this.model = null;\n', '    this.model = null;\n    this.inner = new InnerViewModel();\n    this.seen = new Set();\n    this._cache = new InnerViewModel();\n');
  const { modules } = collectAgentData(subVmFixture(body, {
    extra: { 'js/modules/foo/viewmodel/inner.js': 'export class InnerViewModel {}' },
  }));
  assert.deepEqual(modules.foo.reported.filter(c => c.startsWith('nested_sub_viewmodel:')), ['nested_sub_viewmodel:draft.inner']);
});

test('Teil-Viewmodel: eine Vorlagenbindung an <teil>.model.… ist ein Befund', () => {
  const { modules } = collectAgentData(subVmFixture(DRAFT_VM, {
    html: '<input :value="draft.model.problem" @input="draft.setProblem($event.target.value)">',
  }));
  assert.ok(modules.foo.reported.includes('sub_viewmodel_model_binding:draft.model.problem'), modules.foo.reported.join(', '));
});

test('Teil-Viewmodel: eine Methode help oder params kollidiert mit dem Hilfeschlüssel', () => {
  const body = DRAFT_VM.replace('/** @noagent presentation */\n  problemClass() { return {}; }', '/** @noagent */\n  help() { return {}; }');
  const { modules } = collectAgentData(subVmFixture(body));
  assert.ok(modules.foo.reported.includes(`sub_viewmodel_key_collision:draft.help${FROM_DRAFT}`), modules.foo.reported.join(', '));
  assert.ok(!('draft.help' in modules.foo.actions));
});

test('Teil-Viewmodel: keyof-Typedef und Prüfmenge stehen in der Datei der Klasse', () => {
  const body = `/**
 * @typedef {object} Fields
 * @property {string} title  the title
 * @property {string} hint  the hint
 */
const FIELD_KEYS = ['title', 'hint'];
function requireEnum() {}
export class DraftViewModel {
  /**
   * Set a field.
   * @agent
   * @param {keyof Fields} key which field
   * @param {string} value the text
   * @returns {void}
   */
  setField(key, value) { requireEnum('key', key, FIELD_KEYS); this.model[key] = value; }
  /**
   * Set the remaining fields.
   * @agent
   * @param {string} text the text
   * @returns {void}
   */
  setRest(text) { this.model.problem = text; this.model.nodes = text; this.model.rows = text; }
}`;
  const { modules } = collectAgentData(subVmFixture(body));
  assert.deepEqual(modules.foo.violations, []);
  const action = modules.foo.actions['draft.setField'];
  assert.equal(action.keysOf, 'Fields');
  assert.deepEqual(Object.keys(action.keys), ['title', 'hint']);
  assert.equal(action.params[0].type, "'title'|'hint'");
});

test('Teil-Viewmodel: ein DOM-Umweg in der Datei der Klasse trägt den Pfad', () => {
  const body = DRAFT_VM.replace('_helper() {}', '_helper(el) { el.innerHTML = this._t("x"); }');
  const { modules } = collectAgentData(subVmFixture(body));
  assert.ok(modules.foo.reported.some(c => /^dom_detour:innerHTML@js\/modules\/foo\/viewmodel\/draft\.js$/.test(c)),
    modules.foo.reported.join(', '));
});

const DECLARED_VM = (readBody) => `/**
 * Foo module.
 * @agent
 */
import { createModule } from '../../core/template-module.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { State } from './foo-model.js';

/**
 * Die Lesefläche.
 * @typedef {object} AgentRead
 * @property {string} title  der Titel
 * @property {number} count  die Anzahl
 */
export default createModule({
  config: { id: 'foo' },
  Model: State,
  data(module, _t) {
    return {
      /**
       * Read.
       * @agent
       * @param {object} [options] Auswahl
       * @returns {AgentRead} der Zustand
       */
      read(options) { ${readBody} },
      /**
       * @agent
       * @param {string} v - der Titel
       * @returns {void}
       */
      setTitle(v) { this.model.title = v; },
    };
  },
});`;
const DECL_MODEL = `export class State {
  /** @type {string} der Titel */
  title = '';
  toJSON() { return { title: this.title }; }
}`;

test('declared_not_returned: erklärter Schlüssel fehlt im read()-Rückgabewert', () => {
  const root = fixture({ foo: { 'foo.js': DECLARED_VM(`return readAgentState('foo', { ...this.model.toJSON() }, options);`), 'foo-model.js': DECL_MODEL } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['declared_not_returned:count']);
  assert.equal(modules.foo.available, false);
});

test('declared_not_returned: vollständig gelieferte Lesefläche ist befundfrei', () => {
  const root = fixture({ foo: { 'foo.js': DECLARED_VM(`return readAgentState('foo', { ...this.model.toJSON(), count: 1 }, options);`), 'foo-model.js': DECL_MODEL } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, []);
});

const TWO_TABLES_VM = (readBody) => DECLARED_VM('').replace(
  " * @property {string} title  der Titel\n * @property {number} count  die Anzahl\n",
  " * @property {Array<{x: number}>} a  [bulk] erste Tabelle\n * @property {Array<{y: number}>} b  [bulk] zweite Tabelle\n",
).replace('read(options) {  }', `read(options) { ${readBody} }`);
const TWO_TABLES_MODEL = `export class State {
  /** @type {Array<{x: number}>} erste Tabelle */
  a = [];
  /** @type {Array<{y: number}>} zweite Tabelle */
  b = [];
  toJSON() { return { a: this.a, b: this.b }; }
}`;

test('missing_bulk_columns: zwei Tabellenfelder, nur eines mit Schwesterfeld', () => {
  const root = fixture({ foo: { 'foo.js': TWO_TABLES_VM(`return readAgentState('foo', { ...this.model.toJSON(), aColumns: [{ name: 'x' }] }, options);`), 'foo-model.js': TWO_TABLES_MODEL } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['missing_bulk_columns:b']);
});

test('missing_bulk_columns: ein einziges Tabellenfeld braucht kein Schwesterfeld', () => {
  const root = fixture({ foo: { 'foo.js': TWO_TABLES_VM(`return readAgentState('foo', { a: [], b: [] }, options);`).replace(/ \* @property \{Array<\{y: number\}>\} b .*\n/, ''), 'foo-model.js': TWO_TABLES_MODEL.replace(/  \/\*\* @type \{Array<\{y: number\}>\}.*\n  b = \[\];\n/, '').replace(', b: this.b', '') } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, []);
});

test('unresolved_read_return: nicht auflösbarer read()-Rückgabewert ist eine gemeldete Blindstelle', () => {
  const root = fixture({ foo: { 'foo.js': DECLARED_VM(`return readAgentState('foo', build(), options);`), 'foo-model.js': DECL_MODEL } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unresolved_read_return']);
});

test('collectAgentData: eine anlegende @agent-Aktion mit @returns {void} ist ein Befund', () => {
  const vm = TAGGED_VM.replace(
    '       * @returns {boolean} whether it was accepted\n',
    '       * @returns {void}\n',
  ).replace('setProblem(text)', 'addProblem(text)');
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
  const { modules } = collectAgentData(root);
  assert.ok(modules.foo.violations.includes('void_creating_action:addProblem'));
});

test('collectAgentData: address/adder zählen nicht als anlegend', () => {
  const vm = TAGGED_VM.replace(
    '       * @returns {boolean} whether it was accepted\n',
    '       * @returns {void}\n',
  ).replace('setProblem(text)', 'address(text)');
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
  assert.ok(!collectAgentData(root).modules.foo.violations.some((v) => v.startsWith('void_creating_action')));
});

test('Teil-Viewmodel: eine anlegende Aktion mit @returns {void} ist ein Befund mit Teil-Präfix', () => {
  const body = DRAFT_VM.replace('setProblem(text)', 'addProblem(text)');
  const { modules } = collectAgentData(subVmFixture(body));
  assert.ok(modules.foo.violations.includes('void_creating_action:draft.addProblem'), modules.foo.violations.join(', '));
});

test('collectAgentData: eine @agent-Aktion delete… ist ein Befund — das Verb heißt remove…', () => {
  const vm = TAGGED_VM.replace('setProblem(text)', 'deleteProblem(text)');
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
  assert.ok(collectAgentData(root).modules.foo.violations.includes('delete_verb_action:deleteProblem'));
});

test('Teil-Viewmodel: eine Aktion delete… ist ein Befund mit Teil-Präfix', () => {
  const body = DRAFT_VM.replace('setProblem(text)', 'deleteProblem(text)');
  const { modules } = collectAgentData(subVmFixture(body));
  assert.ok(modules.foo.violations.includes('delete_verb_action:draft.deleteProblem'), modules.foo.violations.join(', '));
});

test('collectAgentData: deletedCount ist kein Löschverb', () => {
  const vm = TAGGED_VM.replace('setProblem(text)', 'deletedCount(text)');
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
  assert.ok(!collectAgentData(root).modules.foo.violations.some((v) => v.startsWith('delete_verb_action')));
});

test('void_creating_action: Promise<void>, undefined und Promise<undefined> zählen als nichts geliefert', () => {
  for (const ret of ['Promise<void>', 'undefined', 'Promise<undefined>']) {
    const vm = TAGGED_VM
      .replace('       * @returns {boolean} whether it was accepted\n', `       * @returns {${ret}}\n`)
      .replace('setProblem(text)', 'createProblem(text)');
    const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
    assert.ok(collectAgentData(root).modules.foo.violations.includes('void_creating_action:createProblem'), ret);
  }
});

test('void_creating_action: eine Ausnahme aus CREATING_VOID_EXEMPT bleibt befundfrei', () => {
  const vm = TAGGED_VM
    .replace('       * @returns {boolean} whether it was accepted\n', '       * @returns {void}\n')
    .replace("config: { id: 'foo' }", "config: { id: 'attribute-test' }")
    .replace('setProblem(text)', 'addRow(text)');
  const root = fixture({ 'attribute-test': { 'attribute-test.js': vm, 'foo-model.js': MODEL } });
  const entry = collectAgentData(root).modules['attribute-test'];
  assert.ok(!entry.violations.some((v) => v.startsWith('void_creating_action')), entry.violations.join(', '));
});

test('void_creating_action: jede Ausnahme trifft im echten Baum noch eine void-Anlegeaktion', () => {
  const appDir = join(import.meta.dirname, '..', '..');
  const { modules } = collectAgentData(appDir);
  for (const key of CREATING_VOID_EXEMPT) {
    const dot = key.indexOf('.');
    const action = modules[key.slice(0, dot)]?.actions?.[key.slice(dot + 1)];
    assert.ok(action, `Ausnahme ${key}: Aktion gibt es nicht mehr`);
    assert.ok(['void', 'undefined', 'Promise<void>', 'Promise<undefined>'].includes(String(action.returns).trim()),
      `Ausnahme ${key}: Aktion liefert jetzt ${action.returns} — Ausnahme streichen`);
  }
});

/** TAGGED_VM, dessen `setProblem` `text` mit `requireKnownId` gegen `source` prüft; `decl` steht auf Modulebene. */
function vmWithKnownIdCheck(decl, source) {
  return TAGGED_VM
    .replace("import { State } from './foo-model.js';",
      `import { State } from './foo-model.js';\nimport { requireKnownId } from '../../core/agent/agent-argcheck.js';\n${decl}`)
    .replace('setProblem(text) { this.model.problem = text; this.model.nodes = text; this.model.rows = text; return true; }',
      `setProblem(text) { requireKnownId('text', text, ${source}); return true; }`);
}

test('module_state_option_source: eine Wertemenge aus einem veränderlichen Modul-let ist ein Befund', () => {
  const root = fixture({ foo: { 'foo.js': vmWithKnownIdCheck('let _ids = [];', '_ids'), 'foo-model.js': MODEL } });
  assert.ok(collectAgentData(root).modules.foo.violations.includes('module_state_option_source:setProblem:text'));
});

test('module_state_option_source: auch über Methodenkette und lokalen Alias auf das let', () => {
  const vm = vmWithKnownIdCheck('let _ids = [];', 'ids').replace('requireKnownId(\'text\'', "const ids = _ids.map(x => x.id);\n requireKnownId('text'");
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
  assert.ok(collectAgentData(root).modules.foo.violations.includes('module_state_option_source:setProblem:text'));
});

test('module_state_option_source: eine Modul-const bleibt befundfrei', () => {
  const root = fixture({ foo: { 'foo.js': vmWithKnownIdCheck("const IDS = ['a', 'b'];", 'IDS'), 'foo-model.js': MODEL } });
  assert.ok(!collectAgentData(root).modules.foo.violations.some((v) => v.startsWith('module_state_option_source')));
});

test('module_state_option_source: Parameter gleichen Namens wie ein Modul-let wird nicht gemeldet', () => {
  const vm = vmWithKnownIdCheck('let ids = [];', 'ids').replace('setProblem(text)', 'setProblem(text, ids)');
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
  assert.ok(!collectAgentData(root).modules.foo.violations.some((v) => v.startsWith('module_state_option_source')));
});

test('module_state_option_source: ein lokales let gleichen Namens wie ein Modul-let wird nicht gemeldet', () => {
  const vm = vmWithKnownIdCheck('let ids = [];', 'ids').replace("requireKnownId('text'", "{ const { ids } = this.model; }\n let ids2 = 1; if (text) { var ids = ['a']; }\n requireKnownId('text'");
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
  assert.ok(!collectAgentData(root).modules.foo.violations.some((v) => v.startsWith('module_state_option_source')));
});

test('module_state_option_source: das let einer Mixin-Datei wird dem Mixin-Mitglied zugerechnet', () => {
  const mixin = `let _ids = [];\n` + MIXIN.replace('renameStep(name) { return true; }', "renameStep(name) { requireKnownId('name', name, _ids); return true; }");
  const root = fixture(
    { foo: { 'foo.js': vmWith('...mixConst,'), 'foo-model.js': MODEL } },
    { 'js/ui/mix.js': mixin },
  );
  assert.ok(collectAgentData(root).modules.foo.violations.some((v) => v.startsWith('module_state_option_source:renameStep:name')));
});

test('module_state_option_source: ein gleichnamiges let der Moduldatei wird dem Mixin nicht zugerechnet', () => {
  const mixin = MIXIN.replace('renameStep(name) { return true; }', "renameStep(name) { requireKnownId('name', name, _ids); return true; }");
  const vm = vmWith('...mixConst,').replace('export default', 'let _ids = [];\nexport default');
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } }, { 'js/ui/mix.js': mixin });
  assert.ok(!collectAgentData(root).modules.foo.violations.some((v) => v.startsWith('module_state_option_source')));
});

test('module_state_option_source: statische Wrapper Object.keys/Array.from/Object.values werden aufgelöst', () => {
  for (const source of ['Object.keys(_ids)', 'Array.from(_ids)', 'Object.values(_ids)']) {
    const root = fixture({ foo: { 'foo.js': vmWithKnownIdCheck('let _ids = [];', source), 'foo-model.js': MODEL } });
    assert.ok(collectAgentData(root).modules.foo.violations.includes('module_state_option_source:setProblem:text'), source);
  }
});

// --- setter_bypass_binding / hardcoded_param_bounds -------------------------

/** Viewmodel mit Setter für `problem`, damit nur die Element-Art entscheidet. */
function setterVm() {
  return TAGGED_VM.replace("/** @noagent */\n      cardClass(node) { return ''; },", `/**
       * @agent
       * @param {string} t
       * @returns {void}
       */
      setProblem(t) { this.model.problem = String(t ?? ''); },
      /** @noagent */
      cardClass(node) { return ''; },`);
}
const PROBLEM_MODEL = `export class State {
      /** @type {string} das Problem */
      problem = '';
      toJSON() { return { problem: this.problem }; }
    }`;

function reportedFor(html, vm = setterVm(), model = PROBLEM_MODEL) {
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': model, 'foo.html': html } });
  return collectAgentData(root).modules.foo.reported;
}

test('setter_bypass_binding: x-model auf einem select umgeht den Setter', () => {
  assert.deepEqual(reportedFor('<select x-model="model.problem"></select>'), ['setter_bypass_binding:problem']);
});

test('setter_bypass_binding: Textfelder sind ausgenommen', () => {
  assert.deepEqual(reportedFor('<input type="text" x-model="model.problem">'), []);
  assert.deepEqual(reportedFor('<input x-model="model.problem">'), []);
  assert.deepEqual(reportedFor('<textarea x-model="model.problem"></textarea>'), []);
});

test('setter_bypass_binding: > in Alpine-Ausdrücken und Pfeilfunktionen verfehlt das Element nicht', () => {
  const html = '<input type="checkbox" x-show="a > b" @click="items.forEach(i => i.on = true)" x-model="model.problem">';
  assert.deepEqual(reportedFor(html), ['setter_bypass_binding:problem']);
  // Ein vorangehendes Element mit > im Ausdruck darf den Typ nicht verschleppen.
  const html2 = '<input type="checkbox" x-show="a > b"><input x-model="model.problem">';
  assert.deepEqual(reportedFor(html2), []);
});

const NUMBER_VM = TAGGED_VM;
test('hardcoded_param_bounds: festes min/max neben onParamInput ist ein Befund', () => {
  const root = (html) => collectAgentData(fixture({ foo: {
    'foo.js': NUMBER_VM,
    'foo-model.js': PROBLEM_MODEL,
    'foo.html': html,
  } })).modules.foo.reported;
  assert.deepEqual(root('<input type="number" min="0" max="5" @change="onParamInput(\'k\', $event)">'), ['hardcoded_param_bounds:k']);
  assert.deepEqual(root('<input type="number" :min="paramMin(\'k\')" :max="paramMax(\'k\')" @change="onParamInput(\'k\', $event)">'), []);
  assert.deepEqual(root('<input type="number" x-show="a > b" min="0" @change="onParamInput(\'k\', $event)">'), ['hardcoded_param_bounds:k']);
});

test('hardcoded_param_bounds: dokumentierte Grenze — eigener Handler mit festem min/max wird NICHT gemeldet', () => {
  const reported = collectAgentData(fixture({ foo: {
    'foo.js': TAGGED_VM,
    'foo-model.js': PROBLEM_MODEL,
    'foo.html': '<input type="number" min="1" max="10" @change="fooChanged($event)"><input type="number" :min="0" max="3" @change="setX(1)">',
  } })).modules.foo.reported;
  assert.deepEqual(reported, []);
});

test('setter_bypass_binding: type= wird ohne Beachtung der Schreibweise gelesen, gebundenes :type zählt als Text', () => {
  assert.deepEqual(reportedFor('<input type="CHECKBOX" x-model="model.problem">'), ['setter_bypass_binding:problem']);
  assert.deepEqual(reportedFor('<input :type="kind" x-model="model.problem">'), []);
});

// ── unreachable_write geschärft: Sammlungen, Aliasse, Auswahl, Vorlagenmethoden, Baseline ──

/** Ein Viewmodel mit `read()` und den gegebenen Mitgliedern. */
const writeGateVm = (members, head = '') => `/**
 * Foo module.
 * @agent
 */
import { createModule } from '../../core/template-module.js';
import { State } from './foo-model.js';
${head}
export default createModule({
  config: { id: 'foo' },
  Model: State,
  data(module, _t) {
    return {
      /**
       * @agent
       * @returns {object} der Zustand
       */
      read() { return {}; },
      /**
       * @agent
       * @returns {void}
       */
      ping() {},
      ${members}
    };
  },
});
`;

/** Ein Model-Feld mit Typ und optionalem Hilfekommentar. */
const writeGateField = (name, type = 'string', comment = 'das Feld') => `/** @type {${type}} ${comment} */
  ${name} = null;`;

/** @returns {{ reported: string[], written: string[], entry: object, frozen: string[] }} */
function writeGateRun({ vm, fields, methods = '', html, baseline }) {
  const files = {
    'foo.js': vm,
    'foo-model.js': `export class State {
  ${fields.join('\n  ')}
  ${methods}
  toJSON() { return { ${fields.map(f => /^\S+ (\S+) =|\n\s*([\w$]+) =/.exec(f)[2]).map(n => `${n}: this.${n}`).join(', ')} }; }
}`,
  };
  if (html) files['foo.html'] = html;
  const result = collectAgentData(fixture({ foo: files }), baseline ? { baseline } : undefined);
  return {
    reported: result.modules.foo.reported,
    written: result.writtenFields.foo,
    entry: result.modules.foo,
    frozen: result.frozen?.foo ?? [],
  };
}

/** Eine `@agent`-Methode mit Parameter(n), JSDoc passend zur Signatur. */
const agentMethod = (signature, body) => {
  const params = /\(([^)]*)\)/.exec(signature)[1].split(',').map(p => p.trim()).filter(Boolean);
  return `/**
       * @agent
${params.map(p => `       * @param {any} ${p} - Wert`).join('\n')}
       * @returns {void}
       */
      ${signature} { ${body} },`;
};

test('Schreibweg: push aus einem Parameter deckt die Sammlung ab', () => {
  const { written, reported } = writeGateRun({
    vm: writeGateVm(agentMethod('pushItem(text)', 'this.model.items.push({ text });')),
    fields: [writeGateField('items', 'Array<object>')],
  });
  assert.deepEqual(written, ['items']);
  assert.deepEqual(reported, []);
});

test('Schreibweg: unshift und splice mit eingefügtem Wert decken ab, reines Entfernen nicht', () => {
  const run = (body) => writeGateRun({
    vm: writeGateVm(agentMethod('change(v)', body)),
    fields: [writeGateField('items', 'Array<object>')],
  }).written;
  assert.deepEqual(run('this.model.items.unshift(v);'), ['items']);
  assert.deepEqual(run('this.model.items.splice(0, 0, v);'), ['items']);
  assert.deepEqual(run('this.model.items.splice(v, 1);'), []);
});

test('Schreibweg: ein konstanter push-Wert oder eine unbekannte Sammelmethode deckt NICHT ab', () => {
  const run = (signature, body) => writeGateRun({
    vm: writeGateVm(agentMethod(signature, body)),
    fields: [writeGateField('items', 'Array<object>')],
  });
  const constant = run('pushItem()', 'this.model.items.push({ text: "" });');
  assert.deepEqual(constant.reported, ['unreachable_write:items']);
  assert.deepEqual(run('touch(v)', 'this.model.items.includes(v);').reported, ['unreachable_write:items']);
});

test('Schreibweg: Elementzuweisung aus einem Parameter deckt die Sammlung ab', () => {
  const run = (body) => writeGateRun({
    vm: writeGateVm(agentMethod('setAt(i, v)', body)),
    fields: [writeGateField('items', 'Array<object>')],
  }).written;
  assert.deepEqual(run('this.model.items[i] = v;'), ['items']);
  assert.deepEqual(run('this.model.items[i + 1] = v;'), ['items']);
  assert.deepEqual(run('this.model.items[i] = 1;'), []);
});

test('Schreibweg: ein Alias aus find deckt Sammlung und Elementfeld ab', () => {
  const { written, reported } = writeGateRun({
    vm: writeGateVm(agentMethod('setTitle(id, title)', 'const s = this.model.steps.find(x => x.id === id); s.title = title;')),
    fields: [writeGateField('steps', 'Array<object>')],
  });
  assert.deepEqual(written, ['steps', 'steps.title']);
  assert.deepEqual(reported, []);
});

test('Schreibweg: die weiteren Aliasformen filter()[0], [i] und die Sammlung selbst', () => {
  const run = (body) => writeGateRun({
    vm: writeGateVm(agentMethod('setTitle(i, title)', body)),
    fields: [writeGateField('steps', 'Array<object>')],
  }).written;
  assert.deepEqual(run('const s = this.model.steps.filter(x => x.ok)[0]; s.title = title;'), ['steps', 'steps.title']);
  assert.deepEqual(run('const s = this.model.steps[i]; s.title = title;'), ['steps', 'steps.title']);
  assert.deepEqual(run('const all = this.model.steps; all.push(title);'), ['steps']);
  assert.deepEqual(run('const all = this.model.steps; all[i] = title;'), ['steps']);
});

test('Schreibweg: ein Alias deckt NICHT ab bei Konstante, Überschattung oder unbekannter Herkunft', () => {
  const run = (body) => writeGateRun({
    vm: writeGateVm(agentMethod('setTitle(id, title)', body)),
    fields: [writeGateField('steps', 'Array<object>')],
  }).written;
  assert.deepEqual(run('const s = this.model.steps.find(x => x.id === id); s.title = "fest";'), []);
  assert.deepEqual(run('const s = lookup(id); s.title = title;'), []);
  assert.deepEqual(run('const s = this.model.steps.map(x => x.a); s.title = title;'), []);
  // Der Closure-Parameter `s` ist nicht der Alias …
  assert.deepEqual(run('const s = this.model.steps.find(x => x.id === id); others.forEach(s => { s.title = title; });'), []);
  // … die Blockbindung auch nicht …
  assert.deepEqual(run('const s = this.model.steps[0]; if (id) { const s = other(); s.title = title; }'), []);
  // … und auch nicht die Schleifenvariable.
  assert.deepEqual(run('const s = this.model.steps[0]; for (const s of others) { s.title = title; }'), []);
  // Innerhalb einer Closure bleibt der äußere Alias sichtbar.
  assert.deepEqual(run('const s = this.model.steps[0]; later(() => { s.title = title; });'), ['steps', 'steps.title']);
  // Ein Alias gilt erst in seinem Block, nicht danach.
  assert.deepEqual(run('if (id) { const s = this.model.steps[0]; } s.title = title;'), []);
});

test('Schreibweg: Sammlung und Alias eine Ebene tief in einer Model-Methode', () => {
  const push = writeGateRun({
    vm: writeGateVm(agentMethod('pushItem(text)', 'this.model.add(text);')),
    fields: [writeGateField('items', 'Array<object>')],
    methods: 'add(text) { this.items.push(text); }',
  });
  assert.deepEqual(push.written, ['items']);
  assert.deepEqual(push.reported, []);
  const alias = writeGateRun({
    vm: writeGateVm(agentMethod('setTitle(id, title)', 'this.model.rename(id, title);')),
    fields: [writeGateField('steps', 'Array<object>')],
    methods: 'rename(id, title) { const s = this.steps.find(x => x.id === id); s.title = title; }',
  });
  assert.deepEqual(alias.written, ['steps', 'steps.title']);
  // Zwei Ebenen bleiben außen vor, ebenso ein konstantes Argument.
  const deep = writeGateRun({
    vm: writeGateVm(agentMethod('pushItem(text)', 'this.model.add(text);')),
    fields: [writeGateField('items', 'Array<object>')],
    methods: 'add(text) { this._put(text); } _put(t) { this.items.push(t); }',
  });
  assert.deepEqual(deep.written, []);
  const constant = writeGateRun({
    vm: writeGateVm(agentMethod('pushItem(text)', 'this.model.add("fest");')),
    fields: [writeGateField('items', 'Array<object>')],
    methods: 'add(text) { this.items.push(text); }',
  });
  assert.deepEqual(constant.written, []);
});

test('Auswahl: ein Lesefeld ohne Schreibweg ist ein Befund, auch ohne x-model', () => {
  const { reported, entry } = writeGateRun({ vm: writeGateVm(''), fields: [writeGateField('note')] });
  assert.ok(reported.includes('unreachable_write:note'), reported.join(', '));
  assert.equal(entry.available, false);
});

test('Auswahl: [via: …] am Model-Feld und VIEW_FIELDS nehmen das Feld aus', () => {
  const via = writeGateRun({
    vm: writeGateVm(agentMethod('foo(v)', 'this.model.other = v;')),
    fields: [writeGateField('note', 'string', '[via: foo] die Notiz'), writeGateField('other')],
  });
  assert.deepEqual(via.reported, []);
  assert.deepEqual(via.entry.fields.note.via, ['foo']);
  assert.equal(via.entry.fields.note.help, 'die Notiz');
  const view = writeGateRun({
    vm: writeGateVm(''),
    fields: [writeGateField('note')],
    methods: "static VIEW_FIELDS = ['note'];",
  });
  assert.ok(!view.reported.includes('unreachable_write:note'), view.reported.join(', '));
});

test('Auswahl: ein Feld, von dem nur Unterpfade geschrieben werden, hat einen Schreibweg; eine x-model-Bindung auf das Ganze bleibt ein Befund', () => {
  const run = (html) => writeGateRun({
    vm: writeGateVm(agentMethod('setAlpha(v)', 'this.model.params.alpha = v;')),
    fields: [writeGateField('params', 'object')],
    html,
  }).reported;
  assert.deepEqual(run(undefined), []);
  assert.deepEqual(run('<input x-model="model.params">'), ['unreachable_write:params']);
});

test('Auswahl: `_`-Felder bleiben außen vor', () => {
  const { reported } = writeGateRun({
    vm: writeGateVm('/** @noagent */\n      go() { this.model._cache = 1; },'),
    fields: [],
    html: '<button @click="go()"></button>',
  });
  assert.deepEqual(reported, []);
});

/** Ein Viewmodel mit erklärter Lesefläche: Die Model-Auswahl fällt dort weg. */
const declaredVm = (members, property = '@property {string} other das Feld') => writeGateVm(members).replace(
  'export default createModule',
  `/**
 * @typedef {object} AgentRead
 * ${property}
 */
export default createModule`,
).replace('read() { return {}; }', 'read() { return { other: 1 }; }');

test('Auswahl: erklärte AgentRead-Felder ohne Setter sind kein Befund', () => {
  const { reported } = writeGateRun({ vm: declaredVm(''), fields: [writeGateField('other')] });
  assert.ok(!reported.some(c => c.startsWith('unreachable_write:')), reported.join(', '));
});

test('Vorlagenmethode: @noagent hinter @click, die ein Feld zuweist, ist ein Befund', () => {
  const toggle = '/** @noagent */\n      toggle() { this.model.flag = !this.model.flag; },';
  const fields = [writeGateField('flag', 'boolean'), writeGateField('other')];
  const run = (members, html) => writeGateRun({ vm: declaredVm(members), fields, html }).reported
    .filter(c => c.startsWith('unreachable_write:'));
  assert.deepEqual(run(toggle, '<button @click="toggle()"></button>'), ['unreachable_write:flag']);
  // Ohne Klammer und über die lange Schreibweise genauso.
  assert.deepEqual(run(toggle, '<button x-on:click.prevent="toggle"></button>'), ['unreachable_write:flag']);
  assert.deepEqual(run(toggle, '<select @change="toggle($event)"></select>'), ['unreachable_write:flag']);
  // Elementzuweisung zählt für die Sammlung.
  assert.deepEqual(run('/** @noagent */\n      toggle(i) { this.model.flag[i] = true; },', '<button @click="toggle(1)"></button>'), ['unreachable_write:flag']);
  // Nicht in der Vorlage: kein Befund.
  assert.deepEqual(run(toggle, '<button @click="other()"></button>'), []);
  // Nur gelesen statt geschrieben: kein Befund.
  assert.deepEqual(run('/** @noagent */\n      toggle() { return this.model.flag; },', '<button @click="toggle()"></button>'), []);
  // Eine @agent-Methode schreibt das Feld: kein Befund.
  assert.deepEqual(run(`${toggle}\n      ${agentMethod('setFlag(v)', 'this.model.flag = v;')}`, '<button @click="toggle()"></button>'), []);
  // Eine @agent-Methode hinter der Vorlage ist selbst der Schreibweg, keine Lücke.
  assert.deepEqual(run(agentMethod('setFlag(v)', 'this.model.flag = v;'), '<button @click="setFlag(1)"></button>'), []);
});

test('Baseline: ein Treffer landet in frozen statt reported, das Modul bleibt verfügbar', () => {
  const baseline = new Set(['foo unreachable_write:note']);
  const { reported, frozen, entry } = writeGateRun({ vm: writeGateVm(''), fields: [writeGateField('note')], baseline });
  assert.deepEqual(reported, []);
  assert.deepEqual(frozen, ['unreachable_write:note']);
  assert.equal(entry.available, true);
  assert.equal(entry.frozen, undefined, 'frozen gehört nicht in den Registry-Eintrag');
  // Eine Zeile eines anderen Moduls friert nichts ein.
  const other = writeGateRun({ vm: writeGateVm(''), fields: [writeGateField('note')], baseline: new Set(['bar unreachable_write:note']) });
  assert.deepEqual(other.reported, ['unreachable_write:note']);
  assert.deepEqual(other.frozen, []);
});

test('Baseline: nur unreachable_write wird eingefroren, fremde Codes bleiben offen', () => {
  const vm = writeGateVm('unmarkiert() {},');
  const probe = writeGateRun({ vm, fields: [writeGateField('note')] });
  const foreign = probe.reported.find(c => c.startsWith('unmarked_method:'));
  assert.ok(foreign, `Fixture soll unmarked_method melden: ${probe.reported}`);
  const { reported, frozen } = writeGateRun({
    vm, fields: [writeGateField('note')],
    baseline: new Set([`foo ${foreign}`, 'foo unreachable_write:note']),
  });
  assert.ok(reported.includes(foreign), 'der fremde Code bleibt offen');
  assert.deepEqual(frozen, ['unreachable_write:note']);
});

test('Baseline: frozen gelangt nicht in die erzeugte Registry', () => {
  const root = fixture({ foo: { 'foo.js': writeGateVm(''), 'foo-model.js': `export class State {
  ${writeGateField('note')}
  toJSON() { return { note: this.note }; }
}` } });
  const data = collectAgentData(root, { baseline: new Set(['foo unreachable_write:note']) });
  assert.deepEqual(data.frozen, { foo: ['unreachable_write:note'] });
  assert.ok(!renderAgentRegistryModule(data).includes('unreachable_write:note'));
});

// ── unreachable_write: Hilfsmethoden, die ein Sammlungselement liefern ──

const ITEM_BY_ID = `/** Das Element zur id. */
      _itemById(id) { return this.model.items.find(i => i.id === id); },`;

const FIND_NODE = `findNode(id, nodes = this.nodes) {
    for (const n of nodes) {
      if (n.id === id) return n;
      const found = this.findNode(id, n.children);
      if (found) return found;
    }
    return null;
  }`;

test('Schreibweg: eine private Hilfe, die ein Element liefert, trägt die Spur eine Ebene weit', () => {
  const { written, reported } = writeGateRun({
    vm: writeGateVm(`${agentMethod('setText(id, text)', 'this._itemById(id).text = text;')}\n      ${ITEM_BY_ID}`),
    fields: [writeGateField('items', 'Array<object>')],
  });
  assert.deepEqual(written, ['items', 'items.text']);
  assert.deepEqual(reported, []);
});

test('Schreibweg: eine rekursive Model-Methode, die ein Element liefert, bindet den Alias', () => {
  const { written, reported } = writeGateRun({
    vm: writeGateVm(agentMethod('setAnswer(id, text)', 'const node = this.model.findNode(id); node.answer = String(text);')),
    fields: [writeGateField('nodes', 'Array<object>')],
    methods: FIND_NODE,
  });
  assert.deepEqual(written, ['nodes', 'nodes.answer']);
  assert.deepEqual(reported, []);
});

test('Schreibweg: dieselbe Form gilt in der delegierten Model-Methode', () => {
  const { written } = writeGateRun({
    vm: writeGateVm(agentMethod('setAnswer(id, text)', 'this.model.answer(id, text);')),
    fields: [writeGateField('nodes', 'Array<object>')],
    methods: `${FIND_NODE}
  answer(id, text) { const node = this.findNode(id); node.answer = text; }`,
  });
  assert.deepEqual(written, ['nodes', 'nodes.answer']);
});

test('Schreibweg: Hilfen ohne Element oder ohne Parameterwert decken NICHT ab', () => {
  const run = (setBody, helper) => writeGateRun({
    vm: writeGateVm(`${agentMethod('setText(id, text)', setBody)}\n      /** Hilfe. */\n      ${helper}`),
    fields: [writeGateField('items', 'Array<object>')],
  }).reported;
  const finding = ['unreachable_write:items'];
  const set = 'this._pick(id).text = text;';
  // Konstanter Wert: Das Element ist bekannt, der Wert nicht vom Agenten.
  assert.deepEqual(run('this._pick(id).text = "";', '_pick(id) { return this.model.items.find(i => i.id === id); },'), finding);
  // Eine Kopie ist kein Element.
  assert.deepEqual(run(set, '_pick(id) { return { ...this.model.items.find(i => i.id === id) }; },'), finding);
  assert.deepEqual(run(set, '_pick(id) { return this.model.items.map(i => i)[id]; },'), finding);
  // Die Sammlung als Ganzes ist kein Element.
  assert.deepEqual(run(set, '_pick(id) { return this.model.items; },'), finding);
  // Zwei Ebenen: Die Spur reicht genau eine weit.
  assert.deepEqual(run(set, `_pick(id) { return this._pick2(id); },
      /** Hilfe. */
      _pick2(id) { return this.model.items.find(i => i.id === id); },`), finding);
  // Ein unbekannter Rückgabezweig schließt die ganze Hilfe.
  assert.deepEqual(run(set, '_pick(id) { if (id) return this.fallback; return this.model.items.find(i => i.id === id); },'), finding);
  // Eine Hilfe ohne Element: nur `null`.
  assert.deepEqual(run(set, '_pick(id) { return null; },'), finding);
  // Eine Hilfe außerhalb dieses Viewmodels.
  assert.deepEqual(run('this.other._pick(id).text = text;', '_pick(id) { return this.model.items.find(i => i.id === id); },'), finding);
});

test('Schreibweg: zwei Sammlungen in einer Hilfe ergeben keine Spur', () => {
  const { reported } = writeGateRun({
    vm: writeGateVm(`${agentMethod('setText(id, text)', 'this._pick(id).text = text;')}
      /** Hilfe. */
      _pick(id) { if (id) return this.model.a.find(i => i.id === id); return this.model.b.find(i => i.id === id); },`),
    fields: [writeGateField('a', 'Array<object>'), writeGateField('b', 'Array<object>')],
  });
  assert.deepEqual(reported, ['unreachable_write:a', 'unreachable_write:b']);
});

test('Schreibweg: Eine Neubindung in der Hilfe nimmt dem Namen die Spur', () => {
  const { reported } = writeGateRun({
    vm: writeGateVm(agentMethod('setText(id, text)', 'const node = this.model.findNode(id); node.answer = text;')),
    fields: [writeGateField('nodes', 'Array<object>')],
    methods: `findNode(id) {
    const n = this.nodes.find(x => x.id === id);
    if (id) { const n = makeOther(id); return n; }
    return n;
  }`,
  });
  assert.deepEqual(reported, ['unreachable_write:nodes']);
});

// ── Fix-Runde 1: Element-Zeiger sind kein Parameterwert, Vorlagenmethoden in Ausdrücken ──

/** Ein Lauf über ein Feld `steps` mit Element-Hilfen im Viewmodel und im Model. */
const pointerRun = (signature, body, modelMethods = '') => writeGateRun({
  vm: writeGateVm(`/** @noagent */
      pick(id) { return this.model.steps.find(x => x.id === id); },
      ${agentMethod(signature, body)}`),
  fields: [writeGateField('steps', 'Array<object>')],
  methods: `findStep(id) { return this.steps.find(x => x.id === id); }
  ${modelMethods}`,
}).written;

test('Element-Zeiger: Umschalten aus dem Element selbst wählt keinen Wert, in jeder Lieferform', () => {
  assert.deepEqual(pointerRun('flip(i)', 'const s = this.model.steps[i]; s.done = !s.done;'), []);
  assert.deepEqual(pointerRun('flip(i)', 'const list = this.model.steps; const s = list[i]; s.done = !s.done;'), []);
  assert.deepEqual(pointerRun('flip(id)', 'const s = this.pick(id); s.done = !s.done;'), []);
  assert.deepEqual(pointerRun('flip(id)', 'const s = this.model.findStep(id); s.done = !s.done;'), []);
  // Dieselbe Form über `.find` war schon vorher leer; beide Wege stimmen jetzt überein.
  assert.deepEqual(pointerRun('flip(id)', 'const s = this.model.steps.find(x => x.id === id); s.done = !s.done;'), []);
});

test('Element-Zeiger: Entfernen und Selbstkopie sind kein Parameterwert', () => {
  assert.deepEqual(pointerRun('drop(i, k)', 'const s = this.model.steps[i]; s.kids = s.kids.filter(x => x !== k);'), []);
  assert.deepEqual(pointerRun('copy(i)', 'const s = this.model.steps[i]; s.copy = s.title;'), []);
  assert.deepEqual(pointerRun('copy(i)', 'const s = this.model.steps[i]; const t = s.title; s.copy = t;'), []);
  assert.deepEqual(pointerRun('copy(i)', 'this.model.steps[i].copy = this.model.steps[i].title;'), []);
  assert.deepEqual(pointerRun('trim(i)', 'const s = this.model.steps[0]; s.kids = s.kids.slice(i);'), []);
  assert.deepEqual(pointerRun('dup(i)', 'const c = { ...this.model.steps[i] }; this.model.steps.push(c);'), []);
});

test('Element-Zeiger: das Durchreichen an eine Model-Methode bleibt ohne Parameterwert', () => {
  const put = 'put(x) { this.steps.push(x); }';
  assert.deepEqual(pointerRun('dup(i)', 'const s = this.model.steps[i]; this.model.put(s);', put), []);
  assert.deepEqual(pointerRun('dup(i)', 'this.model.put(this.model.steps[i]);', put), []);
  assert.deepEqual(pointerRun('dup(i)', 'const l = this.model.steps; this.model.put(l[i]);', put), []);
});

test('Element-Zeiger: Tausch und Verschieben ordnen nur um', () => {
  assert.deepEqual(pointerRun('swap(i, j)',
    'const a = this.model.steps[i]; this.model.steps[i] = this.model.steps[j]; this.model.steps[j] = a;'), []);
  assert.deepEqual(pointerRun('swap(i, j)',
    'const l = this.model.steps; const a = l[i]; l[i] = l[j]; l[j] = a;'), []);
  assert.deepEqual(pointerRun('move(i, j)',
    'const it = this.model.steps.splice(i, 1)[0]; this.model.steps.splice(j, 0, it);'), []);
});

test('Element-Zeiger: in der delegierten Model-Methode gilt dasselbe', () => {
  const via = (name, code) => pointerRun(`${name}(i, j)`, `this.model.${name}(i, j);`, `${name}(i, j) { ${code} }`);
  assert.deepEqual(via('flip', 'const s = this.steps[i]; s.done = !s.done;'), []);
  assert.deepEqual(via('flip', 'const s = this.findStep(i); s.done = !s.done;'), []);
  assert.deepEqual(via('cycle', "const C = ['a', 'b', 'c']; const s = this.findStep(i); const k = C.indexOf(s.v); s.v = C[(k + 1) % 3];"), []);
  assert.deepEqual(via('drop', 'const s = this.findStep(i); s.kids = s.kids.filter(x => x !== j);'), []);
  assert.deepEqual(via('swap', 'const a = this.steps[i]; this.steps[i] = this.steps[j]; this.steps[j] = a;'), []);
  assert.deepEqual(via('move', 'const it = this.steps.splice(i, 1)[0]; this.steps.splice(j, 0, it);'), []);
});

test('Element-Zeiger: ein echter Parameterwert über den Zeiger deckt weiter ab', () => {
  const both = ['steps', 'steps.title'];
  assert.deepEqual(pointerRun('setTitle(id, title)', 'const s = this.model.steps.find(x => x.id === id); s.title = title;'), both);
  assert.deepEqual(pointerRun('setTitle(id, data)', 'const s = this.model.steps.find(x => x.id === id); s.title = data.code;'), both);
  assert.deepEqual(pointerRun('setTitle(i, title)', 'const s = this.model.steps[i]; s.title = title;'), both);
  assert.deepEqual(pointerRun('setTitle(i, title)', 'const s = this.model.steps[i]; const t = title.trim(); s.title = t;'), both);
  assert.deepEqual(pointerRun('setTitle(id, title)', 'const s = this.pick(id); s.title = title;'), both);
  assert.deepEqual(pointerRun('setTitle(id, title)', 'const s = this.model.findStep(id); s.title = title;'), both);
  // Mischformen: Das Element liefert nur den Rest, der Wert kommt vom Parameter.
  assert.deepEqual(pointerRun('setTitle(i, title)', 'const s = this.model.steps[i]; s.title = `${s.title} ${title}`;'), both);
  assert.deepEqual(pointerRun('add(i, v)', 'const s = this.model.steps[i]; s.kids = [...s.kids, v];'), ['steps', 'steps.kids']);
  assert.deepEqual(pointerRun('add(i, v)', 'const c = { ...this.model.steps[i], title: v }; this.model.steps[i] = c;'), ['steps']);
  // Eine Tabelle außerhalb des Models, gewählt per Parameter, bleibt ein Parameterwert.
  assert.deepEqual(pointerRun('setKind(i, k)', "const C = ['a', 'b']; const s = this.model.steps[i]; s.kind = C[k];"), ['steps', 'steps.kind']);
  // Delegation mit Wert: Zeiger und Parameter nebeneinander.
  assert.deepEqual(pointerRun('setTitle(id, title)', 'this.model.setTitle(id, title);',
    'setTitle(id, title) { const s = this.findStep(id); s.title = title; }'), both);
  assert.deepEqual(pointerRun('setTitle(i, title)', 'const s = this.model.steps[i]; this.model.rename(s, title);',
    'rename(s, title) { s.title = title; this.steps.push(title); }'), ['steps']);
});

test('Vorlagenmethode: jede Ausdrucksform hinter dem Ereignis zählt', () => {
  const toggle = '/** @noagent */\n      toggle() { this.model.flag = !this.model.flag; },';
  const fields = [writeGateField('flag', 'boolean'), writeGateField('other')];
  const run = (html) => writeGateRun({ vm: declaredVm(toggle), fields, html }).reported
    .filter(c => c.startsWith('unreachable_write:'));
  const hit = ['unreachable_write:flag'];
  assert.deepEqual(run('<button @click="$event.stopPropagation(); toggle()"></button>'), hit);
  assert.deepEqual(run('<button @click="open && toggle()"></button>'), hit);
  assert.deepEqual(run('<button @click="foo(); toggle()"></button>'), hit);
  assert.deepEqual(run('<button @click="open ? toggle() : 0"></button>'), hit);
  assert.deepEqual(run('<button x-on:click.stop="!open || toggle()"></button>'), hit);
  assert.deepEqual(run('<button @click="\n  foo();\n  toggle();\n"></button>'), hit);
  assert.deepEqual(run("<button @click='foo(); toggle()'></button>"), hit);
  // Die Grenze: ein längerer Name oder ein fremder Empfänger ist nicht die Methode.
  for (const expr of ['toggleAll()', 'untoggle()', '$toggle()', 'toggle$()', 'obj.toggle()', 'foo(); obj.toggle()']) {
    assert.deepEqual(run(`<button @click="${expr}"></button>`), [], expr);
  }
  // Eine Bindung oder ein Text ist kein Ereignis.
  assert.deepEqual(run('<button :class="toggle()">toggle()</button>'), []);
});

test('Vorlagenmethode: eine @noagent-Methode eines Teil-Viewmodels zählt unter ihrem Pfadnamen', () => {
  const body = DRAFT_VM.replace('problemClass() { return {}; }', 'problemClass() { this.model.extra = 1; return {}; }');
  const reported = (html) => collectAgentData(subVmFixture(body, { html })).modules.foo.reported;
  assert.ok(reported('<button @click="draft.problemClass()"></button>').includes('unreachable_write:extra'));
  assert.ok(reported('<button @click="foo(); draft.problemClass()"></button>').includes('unreachable_write:extra'));
  // Der nackte Name ohne Empfänger ist eine andere Methode.
  assert.ok(!reported('<button @click="problemClass()"></button>').includes('unreachable_write:extra'));
  assert.ok(!reported('<button @click="other.draft.problemClass()"></button>').includes('unreachable_write:extra'));
});

test('Element-Zeiger: eine Pfad-Hilfe, die nur einen Model-Wert umkopiert, deckt NICHTS ab', () => {
  const root = fixture({ foo: {
    'foo.js': SET_AT_PATH + vmWithAgent(`${SET_WHOLE_PARAMS}
      /**
       * @agent
       * @param {string} key der Schlüssel
       * @returns {void}
       */
      reset(key) {
        requireEnum('key', key, KEYS);
        setAtPath(this.model.params, key, this.model.params[key]);
      },`),
    'foo-model.js': PARAMS_MODEL,
    'foo.html': PARAMS_HTML,
  } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreachable_write:params.alpha', 'unreachable_write:params.beta']);
});
