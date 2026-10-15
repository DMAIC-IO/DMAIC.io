import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { collectAgentData, renderAgentRegistryModule, collectDomDetours,
         readAgentReadTypedef } from './agent-data.mjs';
import { lookup, helpExists } from './agent-report.mjs';
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
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
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
    /**
     * Set the observed problem statement.
     * @agent
     * @param {string} text - the problem statement
     * @returns {void}
     */
    setProblem(text) {},
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
      setProblem(text) {},
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
  toJSON() { return { count: this.count }; }
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
  toJSON() { return { count: this.count }; }
}`;
  const root = fixture({ foo: { 'foo.js': CLEAN_VM, 'foo-model.js': model } });
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
  const root = fixture({ foo: { 'foo.js': CLEAN_VM, 'foo-model.js': model } });
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
  const root = fixture({ foo: { 'foo.js': CLEAN_VM, 'foo-model.js': model } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.violations, ['unresolved_base_class:C0']);
  assert.equal('deepest' in modules.foo.fields, false);
  assert.equal(modules.foo.fields.count.type, 'number');
});

test('readModelFields: a static class member is not a read field', () => {
  // `static VERSION` ist Schema-Metadatum der Klasse, kein Instanzzustand: es
  // steht in keinem `toJSON()` und würde der Registry ein Feld andichten, das
  // das Model nicht hält — genau der Widerspruch zu Spec §8, den die
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
      read(options) { return {}; },
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
  );
  const root = fixture({ bar: { 'bar.js': vm, 'bar-model.js': BAR_MODEL } });
  const { modules } = collectAgentData(root);

  assert.deepEqual(modules.bar.reported.filter(v => v.startsWith('invalid_bulk_kind')), []);
  assert.equal(modules.bar.available, true);
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
    ['sheets', 'activeSheetId', 'columns', 'rows', 'formulas']);
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

/** Alle `data-help-key`-Werte aus den Vorlagen eines Moduls. */
function helpKeysInTemplates(appDir, moduleId) {
  const dir = join(appDir, 'js', 'modules', moduleId);
  const keys = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.html')) continue;
    const html = readFileSync(join(dir, file), 'utf8');
    for (const m of html.matchAll(/data-help-key="([^"]+)"/g)) keys.push([file, m[1]]);
  }
  return keys;
}

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
  }
  assert.deepEqual(missing, [], `fehlende i18n-Schlüssel:\n${missing.join('\n')}`);
});

test('i18n-Tor: jeder data-help-key einer freigegebenen Vorlage löst in BEIDEN Sprachdateien auf', () => {
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
    for (const [file, key] of helpKeysInTemplates(appDir, id)) {
      checked += 1;
      // `context-help.js` fragt NUR dieses Literal (`i18n.exists(key)`) und
      // kennt keinen geteilten Rückfall — ein Tippfehler heißt: kein Knopf.
      for (const [lang, tree] of Object.entries(trees)) {
        if (lookup(tree, key) === undefined) broken.push(`${lang}: ${file} → ${key}`);
      }
    }
  }
  assert.ok(checked >= 2, `zu wenige Anker geprüft (${checked})`);
  assert.deepEqual(broken, [], `nicht auflösbare data-help-key:\n${broken.join('\n')}`);
});

/* Controller-Entscheid zu Review-Befund 2: das Tor darf NICHT den
   modulspezifischen `actions.read.help` verlangen. Der geteilte Rückfall
   (`modules.shared.<suffix>`) ist genau dafür da, dass nicht 72 Module
   denselben Satz in beide Sprachbäume kopieren, und Spec §8 Regel 1
   (docs/AGENT-INTERFACE.md) sagt ausdrücklich, dass fehlende Kontexthilfe
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

/* Lücke, die bis hierher offen war: der Nutzungsvertrag (`agent-usage.js`)
   liest seine Sätze mit festen Schlüsseln aus dem i18n-Baum, und KEIN Tor
   hat je nachgesehen, ob es sie dort gibt. Der Unit-Test prüft gegen eine
   Fixture-Tabelle, dieses Modul hatte keine `usage`-Zusicherung, und
   `agent-surface.spec.js` prüft nur `typeof result.usage.intro === 'string'`
   — ein fehlender Schlüssel käme als Schlüsselname selbst durch (`i18n.t`
   gibt den Schlüssel zurück), in GENAU EINER Sprache, unbemerkt. Die
   Schlüsselliste wird aus dem Quelltext gelesen, nicht abgeschrieben: eine
   neu ergänzte Zeile in `agent-usage.js` ist damit automatisch mitgeprüft. */
test('i18n-Tor: jeder Schlüssel, den agent-usage.js liest, steht in BEIDEN Sprachdateien', async () => {
  const appDir = join(import.meta.dirname, '..', '..');
  // Die Schlüsselliste kommt aus dem AUSGEFÜHRTEN `buildUsage`, nicht aus
  // einer Abschrift und nicht aus einem Regex über den Quelltext: eine
  // Sonde-i18n markiert jeden Wert, den der Vertrag wirklich nachschlägt.
  // Ein Regex hinge an der Zitierweise — vier Zeilen auf Backticks
  // umgeschrieben, und das Tor deckte still die Hälfte des Vertrags ab.
  const { buildUsage } = await import('../../js/core/agent/agent-usage.js');
  const usage = buildUsage({ t: (key) => `@@${key}` });
  const keys = Object.values(usage)
    .filter(v => typeof v === 'string' && v.startsWith('@@'))
    .map(v => v.slice(2));
  assert.equal(keys.length, 10,
    `agent-usage.js liest ${keys.length} i18n-Schlüssel, erwartet 10 — kam einer `
    + 'dazu oder weg, gehört die Zahl hier angepasst (und der Schlüssel in beide Sprachbäume)');
  assert.deepEqual([...new Set(keys)].sort(), [...keys].sort(), 'doppelter usage-Schlüssel');

  const trees = {
    de: JSON.parse(readFileSync(join(appDir, 'i18n', 'de.json'), 'utf8')),
    en: JSON.parse(readFileSync(join(appDir, 'i18n', 'en.json'), 'utf8')),
  };
  const missing = [];
  for (const key of keys) {
    for (const [lang, tree] of Object.entries(trees)) {
      if (lookup(tree, key) === undefined) missing.push(`${lang}: ${key}`);
    }
  }
  assert.deepEqual(missing, [], `fehlende Nutzungsvertrags-Schlüssel:\n${missing.join('\n')}`);
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
  assert.match(hits[0], /^dom_detour:innerHTML@/);
});

test('collectDomDetours erkennt dataset mit Klammerzugriff', () => {
  const hits = collectDomDetours(sourceOf(`function mark(el) { el.dataset['state'] = 'on'; }`));
  assert.equal(hits.length, 1);
  assert.match(hits[0], /^dom_detour:dataset\.state@/);
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
  const root = fixture({ foo: { 'foo.js': TAGGED_VM, 'foo-model.js': `export class State {
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
  const root = fixture({ foo: { 'foo.js': TAGGED_VM, 'foo-model.js': `export class State {
    /** @type {string} der Titel */
    title = '';
    toJSON() { return { title: this.title, _schema: 3 }; }
  }` } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, []);
});

test('unreadable_state_key: JSON.parse(JSON.stringify({…})) wird entpackt', () => {
  const root = fixture({ foo: { 'foo.js': TAGGED_VM, 'foo-model.js': `export class State {
    /** @type {string} der Titel */
    title = '';
    toJSON() { return JSON.parse(JSON.stringify({ title: this.title, hidden: 1 })); }
  }` } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreadable_state_key:hidden']);
});

test('unreadable_state_key: eine lokale Variable wird verfolgt', () => {
  const root = fixture({ foo: { 'foo.js': TAGGED_VM, 'foo-model.js': `export class State {
    /** @type {string} der Titel */
    title = '';
    toJSON() { const out = { title: this.title, hidden: 1 }; return out; }
  }` } });
  const { modules } = collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreadable_state_key:hidden']);
});

test('unresolvable_tojson: ein Spread im Rückgabeobjekt ist eine Blindstelle', () => {
  const root = fixture({ foo: { 'foo.js': TAGGED_VM, 'foo-model.js': `export class State {
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
  const root = fixture({ foo: { 'foo.js': TAGGED_VM, 'foo-model.js': `export class Base {
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
  const root = fixture({ foo: { 'foo.js': TAGGED_VM, 'foo-model.js': `export class State {
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
  const root = fixture({ foo: { 'foo.js': TAGGED_VM, 'foo-model.js': `export class State {
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
    'foo.js': TAGGED_VM,
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
    'foo.js': TAGGED_VM,
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
    'foo.js': TAGGED_VM,
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
  // parameterloses `clear()`/`changed()` ist kein Setter im Sinn von E2.
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
    'foo.js': TAGGED_VM,
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
  const vm = TAGGED_VM.replace("/** @noagent */\n      cardClass(node) { return ''; },", `/**
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
    'foo.js': TAGGED_VM,
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
  const root = fixture({ foo: { 'foo.js': TAGGED_VM, 'foo-model.js': `export class Base {
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
  // E1: die Spaltenmenge aus E3 wird mit requireKnownId geprüft. Ein Gate,
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
export default createModule`),
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
      },`);
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
export default createModule`),
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

test('unreachable_write: eine Pfad-Hilfe mit konstantem Wert deckt NICHTS ab (A-I3)', () => {
  const root = fixture({ foo: {
    'foo.js': SET_AT_PATH + vmWithAgent(`/**
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
    'foo.js': SET_AT_PATH + vmWithAgent(`/**
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
