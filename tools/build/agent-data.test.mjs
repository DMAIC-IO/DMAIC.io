import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { collectAgentData, renderAgentRegistryModule, collectDomDetours } from './agent-data.mjs';
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
  const vm = 'import { State } from "./bar-model.js"; export default createModule({ config: { id: "bar" }, Model: State, data(module) { return { ...renderMethods }; } });';
  const root = fixture({ bar: { 'bar.js': vm, 'bar-model.js': 'export class State {}' } });
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
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.violations, ['unresolvable_data_literal']);
  assert.equal(modules.foo.available, false);
  assert.deepEqual(modules.foo.actions, {});
});

test('collectAgentData: a missing data() literal on an UNTAGGED module does not block the build', () => {
  const vm = 'import { State } from "./bar-model.js"; export default createModule({ config: { id: "bar" }, Model: State, data(module) { return build(module); } });';
  const root = fixture({ bar: { 'bar.js': vm, 'bar-model.js': 'export class State {}' } });
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
     * Append a step.
     * @agent
     * @param {string} title - the step title
     * @returns {void} nothing
     */
    addStep(title) {},
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
  assert.deepEqual(Object.keys(modules.foo.actions).sort(), ['addStep', 'read', 'setProblem']);
  assert.deepEqual(modules.foo.actions.addStep.params, [
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
  assert.deepEqual(modules.foo.violations, ['unmarked_method:init@js/ui/mix.js:12']);
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
  assert.ok('addStep' in modules.foo.actions);
});

test('collectAgentData: a member of the module overrides the mixin member of the same name', () => {
  const vm = vmWith(`...mixFactory(module, { mountPicker() {} }),
      /**
       * @agent
       * @param {string} title - the local title
       * @returns {string} the id
       */
      addStep(title) { return 'x'; },`);
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } }, { 'js/ui/mix.js': MIXIN });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.violations, []);
  assert.equal(modules.foo.actions.addStep.returns, 'string');
  assert.equal(modules.foo.actions.addStep.params[0].help, 'the local title');
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
  };
}`;
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.violations, []);
  assert.deepEqual(Object.keys(modules.foo.actions), ['read']);
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
    };
  },
});`;

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
    type: 'any[][]', help: 'the measured rows', bulk: true,
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
// nicht gibt, widerspricht Spec §8 direkt.

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
}`;
  const root = fixture({ foo: { 'foo.js': CLEAN_VM, 'foo-model.js': model } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.violations, ['unresolved_base_class:ns.Base']);
  assert.equal(modules.foo.fields.count.type, 'number');
});

test('readModelFields: a mixin factory as base class is reported, not resolved', () => {
  const model = `export class State extends withSteps(Base) {
  /** @type {number} the own counter */
  count = 0;
}`;
  const root = fixture({ foo: { 'foo.js': CLEAN_VM, 'foo-model.js': model } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.violations, ['unresolved_base_class:withSteps(Base)']);
});

test('readModelFields: a class that extends ITSELF terminates', () => {
  const model = `export class State extends State {
  /** @type {number} the own counter */
  count = 0;
}`;
  const root = fixture({ foo: { 'foo.js': CLEAN_VM, 'foo-model.js': model } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.fields, {
    count: { type: 'number', help: 'the own counter', bulk: false },
  });
  assert.deepEqual(modules.foo.violations, []);
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
}`;
  const root = fixture({ foo: { 'foo.js': CLEAN_VM, 'foo-model.js': model } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.violations, ['unresolved_base_class:C0']);
  assert.equal('deepest' in modules.foo.fields, false);
  assert.equal(modules.foo.fields.count.type, 'number');
});
