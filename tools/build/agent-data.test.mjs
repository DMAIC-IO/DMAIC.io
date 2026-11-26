import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { collectAgentData, renderAgentRegistryModule, collectDomDetours, CREATING_VOID_EXEMPT,
         readAgentReadTypedef, readDerivedReturns } from './agent-data.mjs';
import { readHelpTables, lookup, helpExists, helpKeys, STRUCTURE_JARGON, typedefHelpSuffixes } from './agent-report.mjs';
import { helpKeysInTemplates, helpKeysInScripts, helpKeysInSharedSources,
  BOUND_HELP_KEY_FAMILIES } from './help-anchors.mjs';
import ts from 'typescript';
import { CONVERTED_MODULES } from './converted-modules.mjs';
import { readViewmodelCommands } from './module-gates.mjs';

/**
 * Die Hilfetabellen, in denen ein Anker nachschlägt: Vorlagen unter
 * `resources/` lesen auch die Texte unter `resources/i18n` ihres Moduls —
 * ein Modul, das seine neue Form neben der alten aufbaut, bringt sie dort
 * mit, bevor es in CONVERTED_MODULES steht. Die übrigen Vorlagen lesen wie
 * die Laufzeit.
 * @param {string} appDir
 * @returns {(file: string) => Record<string, object>}
 */
function helpTablesFor(appDir) {
  const base = readHelpTables(appDir);
  const dir = join(appDir, 'js', 'modules');
  const own = readdirSync(dir).filter((id) => !CONVERTED_MODULES.includes(id) && existsSync(join(dir, id, 'resources', 'i18n')));
  const withResources = own.length ? readHelpTables(appDir, [...CONVERTED_MODULES, ...own]) : base;
  return (file) => (file.startsWith('resources/') ? withResources : base);
}

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

test('collectAgentData: untagged module is listed but not available, without violations', async () => {
  const root = fixture({ qux: { 'qux.js': 'export default createModule({ config: { id: "qux" }, data() { return { nope() {} }; } });', 'qux-model.js': MODEL } });
  const { modules, coverage } = await collectAgentData(root);
  assert.equal(modules.qux.tagged, false);
  assert.equal(modules.qux.available, false);
  assert.deepEqual(modules.qux.violations, []);
  assert.deepEqual(coverage, { total: 1, available: 0 });
});

test('collectAgentData: tagged module with complete marks is available', async () => {
  const root = fixture({ foo: { 'foo.js': TAGGED_VM, 'foo-model.js': MODEL } });
  const { modules, coverage } = await collectAgentData(root);
  assert.equal(modules.foo.tagged, true);
  assert.deepEqual(modules.foo.violations, []);
  assert.equal(modules.foo.available, true);
  assert.deepEqual(coverage, { total: 1, available: 1 });
});

test('collectAgentData: only @agent methods become actions', async () => {
  const root = fixture({ foo: { 'foo.js': TAGGED_VM, 'foo-model.js': MODEL } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(Object.keys(modules.foo.actions).sort(), ['read', 'setProblem']);
});

test('collectAgentData: params and returns are extracted with type and help', async () => {
  const root = fixture({ foo: { 'foo.js': TAGGED_VM, 'foo-model.js': MODEL } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.actions.setProblem.params, [
    { name: 'text', type: 'string', optional: false, help: 'the problem statement' },
  ]);
  assert.equal(modules.foo.actions.setProblem.returns, 'boolean');
  assert.equal(modules.foo.actions.read.help, 'Read the full state.');
});

test('collectAgentData: non-function properties and _-prefixed methods need no mark', async () => {
  const root = fixture({ foo: { 'foo.js': TAGGED_VM, 'foo-model.js': MODEL } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.violations, []);
  assert.equal('maxLevel' in modules.foo.actions, false);
  assert.equal('_private' in modules.foo.actions, false);
});

test('collectAgentData: an unmarked public method on a TAGGED module is a violation', async () => {
  const vm = TAGGED_VM.replace('/** @noagent */\n      cardClass(node) { return \'\'; },', 'cardClass(node) { return \'\'; },');
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.violations, ['unmarked_method:cardClass']);
  assert.equal(modules.foo.available, false);
});

test('collectAgentData: an @agent method missing @param is a violation', async () => {
  const vm = TAGGED_VM.replace('       * @param {string} text - the problem statement\n', '');
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.violations, ['missing_param:setProblem.text']);
});

test('collectAgentData: an @agent method missing @returns is a violation', async () => {
  const vm = TAGGED_VM.replace('       * @returns {boolean} whether it was accepted\n', '');
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.violations, ['missing_returns:setProblem']);
});

test('collectAgentData: model fields carry type, help and the bulk mark; _-fields are dropped', async () => {
  const root = fixture({ foo: { 'foo.js': TAGGED_VM, 'foo-model.js': MODEL } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.fields.problem, { type: 'string', help: 'the observed problem statement', bulk: false });
  assert.equal(modules.foo.fields.rows.bulk, true);
  assert.equal('_idCounter' in modules.foo.fields, false);
});

test('collectAgentData: a module without a model file still yields an entry with empty fields', async () => {
  const root = fixture({ foo: { 'foo.js': TAGGED_VM } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.fields, {});
});

test('collectAgentData: directories without <id>.js are skipped', async () => {
  const root = fixture({ foo: { 'foo.js': TAGGED_VM }, notamodule: { 'readme.md': '' } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(Object.keys(modules), ['foo']);
});

/** Parse a JS snippet the way collectAgentData does. */
function sourceOf(code) {
  return ts.createSourceFile('x.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
}

test('collectDomDetours: innerHTML write is a detour', async () => {
  const hits = collectDomDetours(sourceOf('function f(el) { el.innerHTML = "<b>x</b>"; }'));
  assert.equal(hits.length, 1);
  assert.match(hits[0], /^dom_detour:innerHTML$/);
});

test('collectDomDetours: outerHTML write is a detour', async () => {
  assert.equal(collectDomDetours(sourceOf('function f(el) { el.outerHTML = ""; }')).length, 1);
});

test('collectDomDetours: dataset write is a detour and names the key', async () => {
  const hits = collectDomDetours(sourceOf('function f(el) { el.dataset.orgId = "7"; }'));
  assert.equal(hits.length, 1);
  assert.match(hits[0], /^dom_detour:dataset\.orgId$/);
});

test('collectDomDetours: a dataset READ is not a detour', async () => {
  assert.deepEqual(collectDomDetours(sourceOf('function f(el) { return el.dataset.orgId; }')), []);
});

test('collectDomDetours: uncontrolled-input buffers are NOT detours', async () => {
  // The prevailing idiom in this codebase: commit to the model, then
  // normalise the input display. 52/72 modules do this legitimately.
  const code = 'function f(el) { el.value = ""; el.textContent = "3.14"; el.checked = true; }';
  assert.deepEqual(collectDomDetours(sourceOf(code)), []);
});

test('collectDomDetours: presentation writes are NOT detours', async () => {
  const code = 'function f(el) { el.style.height = "0px"; el.classList.add("x"); el.scrollTop = 0; }';
  assert.deepEqual(collectDomDetours(sourceOf(code)), []);
});

test('collectAgentData: a DOM detour counts as a violation on a TAGGED module', async () => {
  const vm = TAGGED_VM.replace('      maxLevel: 5,', `      /** @noagent */
      paint(el) { el.innerHTML = ""; },
      maxLevel: 5,`);
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
  const { modules } = await collectAgentData(root);
  assert.equal(modules.foo.available, false);
  assert.ok(modules.foo.violations.some(v => v.startsWith('dom_detour:innerHTML')),
    `expected a dom_detour violation, got ${JSON.stringify(modules.foo.violations)}`);
});

test('collectAgentData: a DOM detour on an UNTAGGED module is reported but not a violation', async () => {
  const vm = 'export default createModule({ config: { id: "qux" }, data() { return { paint(el) { el.innerHTML = ""; } }; } });';
  const root = fixture({ qux: { 'qux.js': vm } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.qux.violations, []);
  assert.ok(modules.qux.reported.some(v => v.startsWith('dom_detour:innerHTML')));
});

test('renderAgentRegistryModule emits a data-only module', async () => {
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

test('renderAgentRegistryModule is deterministic (sorted keys)', async () => {
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

test('collectAgentData: a spread in the data() literal is a violation (mixin methods are invisible)', async () => {
  const vm = TAGGED_VM.replace('      maxLevel: 5,', `      ...chartModuleLifecycle(module),
      maxLevel: 5,`);
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.violations, ['unresolved_spread:chartModuleLifecycle(module)']);
  assert.equal(modules.foo.available, false);
});

test('collectAgentData: a multi-line spread expression is reported on one line', async () => {
  const vm = TAGGED_VM.replace('      maxLevel: 5,', `      ...draggablePopout(
        module,
      ),
      maxLevel: 5,`);
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.violations, ['unresolved_spread:draggablePopout( module, )']);
});

test('collectAgentData: a spread on an UNTAGGED module is reported but not a violation', async () => {
  const vm = 'import { State } from "./qux-model.js"; export default createModule({ config: { id: "qux" }, Model: State, data(module) { return { ...renderMethods }; } });';
  const root = fixture({ qux: { 'qux.js': vm, 'qux-model.js': 'export class State { toJSON() { return {}; } }' } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.qux.violations, []);
  assert.deepEqual(modules.qux.reported, ['unresolved_spread:renderMethods']);
});

test('collectAgentData: a data() without a return literal is a violation, not silence', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.violations, ['unresolvable_data_literal']);
  assert.equal(modules.foo.available, false);
  assert.deepEqual(modules.foo.actions, {});
});

test('collectAgentData: a missing data() literal on an UNTAGGED module does not block the build', async () => {
  const vm = 'import { State } from "./qux-model.js"; export default createModule({ config: { id: "qux" }, Model: State, data(module) { return build(module); } });';
  const root = fixture({ qux: { 'qux.js': vm, 'qux-model.js': 'export class State { toJSON() { return {}; } }' } });
  const { modules, coverage } = await collectAgentData(root);
  assert.deepEqual(modules.qux.violations, []);
  assert.deepEqual(modules.qux.reported, ['unresolvable_data_literal']);
  assert.deepEqual(coverage, { total: 1, available: 0 });
});

test('collectAgentData: ein Viewmodel in view-Form verlangt keine Marken', async () => {
  const vm = `/**
 * Foo module.
 * @agent
 */
import { State } from './foo-model.js';
export default createModule({
  config: { id: 'foo' },
  Model: State,
  view(ctx) {
    return {
      get label() { return 'x'; },
      addFromDraft(col) { this.model.addItem({ col }); },
    };
  },
});`;
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': 'export class State { toJSON() { return {}; } }' } });
  const { modules } = await collectAgentData(root);
  const codes = [...modules.foo.violations, ...(modules.foo.reported ?? [])];
  assert.equal(codes.some((c) => c.startsWith('unmarked_method') || c === 'unresolvable_data_literal'), false, codes.join('\n'));
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

test('collectAgentData: a spread of an imported factory call resolves its methods', async () => {
  const root = fixture(
    { foo: { 'foo.js': vmWith('...mixFactory(module, { mountPicker() {} }),'), 'foo-model.js': MODEL } },
    { 'js/ui/mix.js': MIXIN },
  );
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.violations, []);
  assert.deepEqual(Object.keys(modules.foo.actions).sort(), ['pushStep', 'read', 'setProblem']);
  assert.deepEqual(modules.foo.actions.pushStep.params, [
    { name: 'title', type: 'string', optional: false, help: 'the step title' },
  ]);
  assert.equal(modules.foo.available, true);
});

test('collectAgentData: the config object handed to a factory contributes no members', async () => {
  // `mountPicker` ist ein Argument, das die Fabrik VERBRAUCHT — es landet nicht
  // auf dem Viewmodel und darf daher weder Aktion noch Verstoß werden.
  const root = fixture(
    { foo: { 'foo.js': vmWith('...mixFactory(module, { mountPicker() {} }),'), 'foo-model.js': MODEL } },
    { 'js/ui/mix.js': MIXIN },
  );
  const { modules } = await collectAgentData(root);
  assert.equal('mountPicker' in modules.foo.actions, false);
  assert.deepEqual(modules.foo.reported.filter(v => v.includes('mountPicker')), []);
});

test('collectAgentData: an unmarked mixin method is a violation that names its origin', async () => {
  const mixin = MIXIN.replace('    /** @noagent */\n    init()', '    init()');
  const root = fixture(
    { foo: { 'foo.js': vmWith('...mixFactory(module, { mountPicker() {} }),'), 'foo-model.js': MODEL } },
    { 'js/ui/mix.js': mixin },
  );
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.violations, ['unmarked_method:init@js/ui/mix.js']);
});

test('collectAgentData: a spread of an imported object constant resolves its methods', async () => {
  const root = fixture(
    { foo: { 'foo.js': vmWith('...mixConst,'), 'foo-model.js': MODEL } },
    { 'js/ui/mix.js': MIXIN },
  );
  const { modules } = await collectAgentData(root);
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

test('collectAgentData: a spread of a local constant holding a factory call resolves', async () => {
  // Das Muster von process-map: `const _core = chainViewMixin(…)` im `data()`,
  // danach `..._core` plus Aufrufe von `_core.x.call(this)`.
  const vm = vmWith('..._core,').replace('  data(module, _t) {\n    return {',
    '  data(module, _t) {\n    const _core = mixFactory(module, { mountPicker() {} });\n    return {');
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } }, { 'js/ui/mix.js': MIXIN });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.violations, []);
  assert.ok('pushStep' in modules.foo.actions);
});

test('collectAgentData: a member of the module overrides the mixin member of the same name', async () => {
  const vm = vmWith(`...mixFactory(module, { mountPicker() {} }),
      /**
       * @agent
       * @param {string} title - the local title
       * @returns {string} the id
       */
      pushStep(title) { return 'x'; },`);
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } }, { 'js/ui/mix.js': MIXIN });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.violations, []);
  assert.equal(modules.foo.actions.pushStep.returns, 'string');
  assert.equal(modules.foo.actions.pushStep.params[0].help, 'the local title');
});

test('collectAgentData: a data() that names a local function resolves its return literal', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.violations, []);
  assert.deepEqual(Object.keys(modules.foo.actions), ['read', 'setProblem']);
});

test('collectAgentData: a nested spread inside a mixin resolves too', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.violations, []);
  assert.ok('dropStep' in modules.foo.actions);
});

test('collectAgentData: a self-referential mixin terminates instead of looping', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.equal('paint' in modules.foo.actions, false);
  assert.deepEqual(modules.foo.violations, []);
});

test('collectAgentData: a spread whose source stays unresolvable is still reported', async () => {
  const root = fixture({ foo: { 'foo.js': vmWith('...fromNowhere(module),', ''), 'foo-model.js': MODEL } });
  const { modules } = await collectAgentData(root);
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

test('readModelFields: a subclass inherits the fields of its imported base class', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.fields.title, { type: 'string', help: 'the base title', bulk: false });
  assert.deepEqual(modules.foo.fields.count, { type: 'number', help: 'the own counter', bulk: false });
});

test('readModelFields: an own field overrides the same-named base field', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.fields.title, { type: 'number', help: 'the own title', bulk: false });
  // Ohne diese zweite Zusicherung wäre der Test auch dann grün, wenn die
  // Basisklasse überhaupt nicht gelesen würde.
  assert.equal(modules.foo.fields.flag.type, 'boolean');
});

test('readModelFields: two-step inheritance collects all three levels', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.equal(modules.foo.fields.a.help, 'from A');
  assert.equal(modules.foo.fields.b.help, 'from B');
  assert.equal(modules.foo.fields.c.help, 'from C');
});

test('readModelFields: a base class in the SAME file is resolved, and the subclass still wins', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.fields.title, { type: 'number', help: 'the own title', bulk: false });
  assert.equal(modules.foo.fields.flag.type, 'boolean');
});

test('readModelFields: an annotated constructor assignment becomes a field', async () => {
  const model = `export class State {
  constructor() {
    /** @type {Array<object>} ordered chain of steps */
    this.steps = [];
  }
}`;
  const root = fixture({ foo: { 'foo.js': CLEAN_VM, 'foo-model.js': model } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.fields.steps, {
    type: 'Array<object>', help: 'ordered chain of steps', bulk: false,
  });
});

test('readModelFields: a constructor assignment WITHOUT @type is not a field', async () => {
  const model = `export class State {
  constructor() {
    /** just a cache */
    this.cache = null;
    this.other = 1;
  }
}`;
  const root = fixture({ foo: { 'foo.js': CLEAN_VM, 'foo-model.js': model } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.fields, {});
});

test('readModelFields: an annotated _-prefixed constructor assignment is not a field', async () => {
  const model = `export class State {
  constructor() {
    /** @type {number} private counter */
    this._idCounter = 0;
  }
}`;
  const root = fixture({ foo: { 'foo.js': CLEAN_VM, 'foo-model.js': model } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.fields, {});
});

test('readModelFields: an annotated this-assignment in another METHOD is not a field', async () => {
  const model = `export class State {
  reset() {
    /** @type {string} view buffer */
    this.buffer = '';
  }
}`;
  const root = fixture({ foo: { 'foo.js': CLEAN_VM, 'foo-model.js': model } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.fields, {});
});

test('readModelFields: an annotated this-assignment in a CALLBACK inside the constructor is not a field', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(Object.keys(modules.foo.fields), ['steps']);
});

test('readModelFields: @agentBulk on a constructor assignment is carried over', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.fields.rows, {
    type: 'any[][]', help: 'the measured rows', bulk: true, bulkKind: 'table',
  });
});

test('readModelFields: a cycle in the extends chain terminates', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.equal(modules.foo.fields.n.help, 'from state');
  assert.equal(modules.foo.fields.s.help, 'from base');
});

test('readModelFields: an unresolvable base class is reported, and hard only with the module tag', async () => {
  const model = `export class State extends Nowhere {
  /** @type {number} the own counter */
  count = 0;
}`;
  const soft = fixture({ foo: { 'foo.js': UNTAGGED_VM, 'foo-model.js': model } });
  const softResult = (await collectAgentData(soft)).modules.foo;
  assert.deepEqual(softResult.violations, []);
  assert.ok(softResult.reported.includes('unresolved_base_class:Nowhere'),
    `expected unresolved_base_class, got ${JSON.stringify(softResult.reported)}`);
  // Die eigenen Felder bleiben trotzdem erhalten — ein unauflösbarer Vorfahr
  // macht die Klasse nicht unlesbar.
  assert.equal(softResult.fields.count.type, 'number');

  const hard = fixture({ foo: { 'foo.js': CLEAN_VM, 'foo-model.js': model } });
  const hardResult = (await collectAgentData(hard)).modules.foo;
  assert.ok(hardResult.violations.includes('unresolved_base_class:Nowhere'));
  assert.equal(hardResult.available, false);
});

// ── Fix-Runde 1: die Model-Wurzel kommt aus `Model:` ─────────────────────
// Vorher mischte readModelFields ALLE Klassen der Model-Datei. Mit den
// Konstruktor-Zuweisungen wurde daraus ein echter Fehler: `rest-api` behauptete
// die Felder der Hilfsklasse `Endpoint` (`headers`, `mappings`), die auf dem
// Model-Objekt nicht existieren. Eine Registry, die Felder behauptet, die es
// nicht gibt, widerspricht dem Grundsatz „die Lesefläche IST die persistierte Form“.

test('readModelFields: a helper class in the model file contributes NOTHING', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(Object.keys(modules.foo.fields), ['endpoints']);
});

test('readModelFields: a SUBCLASS of the model in the same file does not leak into the read surface', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.fields, {
    title: { type: 'string', help: 'the real title', bulk: false },
  });
});

test('readModelFields: a missing Model member is reported, not silently empty', async () => {
  const vm = CLEAN_VM.replace('  Model: State,\n', '');
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.fields, {});
  assert.ok(modules.foo.violations.includes('unresolvable_model_class'),
    `got ${JSON.stringify(modules.foo.violations)}`);
});

test('readModelFields: a computed Model value is reported as unresolvable', async () => {
  const vm = CLEAN_VM.replace('  Model: State,', '  Model: makeModel(),');
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.violations, ['unresolvable_model_class']);
});

test('readModelFields: a Model name that resolves to something other than a class is reported', async () => {
  const vm = CLEAN_VM
    .replace(`import { State } from './foo-model.js';`, 'const State = { steps: [] };')
    .replace(' * @agent\n', '');
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.fields, {});
  assert.deepEqual(modules.foo.reported, ['unresolved_model_class:State']);
  assert.deepEqual(modules.foo.violations, []);     // ohne Modul-Tag berichtend
});

test('readModelFields: the shorthand `{ Model }` names the class too', async () => {
  const vm = CLEAN_VM.replace('  Model: State,', '  Model,').replace('{ State }', '{ State as Model }');
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
  const { modules } = await collectAgentData(root);
  assert.equal(modules.foo.fields.problem.type, 'string');
  assert.deepEqual(modules.foo.violations, []);
});

test('readModelFields: a non-identifier extends clause is reported, not resolved', async () => {
  const model = `export class State extends ns.Base {
  /** @type {number} the own counter */
  count = 0;
  toJSON() { return { count: this.count }; }
}`;
  const root = fixture({ foo: { 'foo.js': COUNT_VM, 'foo-model.js': model } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.violations, ['unresolved_base_class:ns.Base']);
  assert.equal(modules.foo.fields.count.type, 'number');
});

test('readModelFields: a mixin factory as base class is reported, not resolved', async () => {
  const model = `export class State extends withSteps(Base) {
  /** @type {number} the own counter */
  count = 0;
  toJSON() { return { count: this.count }; }
}`;
  const root = fixture({ foo: { 'foo.js': COUNT_VM, 'foo-model.js': model } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.violations, ['unresolved_base_class:withSteps(Base)']);
});

test('readModelFields: a class that extends ITSELF terminates AND is reported', async () => {
  // Der Abstieg endet weiterhin am Pfadschutz (keine Rekursion, die eigenen
  // Felder bleiben) — aber nicht mehr still: `class State extends State` ist
  // zur Laufzeit ein Wurf und damit ein Autorenfehler, kein Randfall.
  const model = `export class State extends State {
  /** @type {number} the own counter */
  count = 0;
  toJSON() { return { count: this.count }; }
}`;
  const root = fixture({ foo: { 'foo.js': COUNT_VM, 'foo-model.js': model } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.fields, {
    count: { type: 'number', help: 'the own counter', bulk: false },
  });
  assert.deepEqual(modules.foo.violations, ['self_inheriting_class:State']);
});

test('readModelFields: an extends chain beyond the depth limit is reported as a blind spot', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.violations, ['unresolved_base_class:C0']);
  assert.equal('deepest' in modules.foo.fields, false);
  assert.equal(modules.foo.fields.count.type, 'number');
});

test('readModelFields: a static class member is not a read field', async () => {
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
  const { modules } = await collectAgentData(root);
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
import { State } from './qux-model.js';

/**
 * Die Agenten-Lesefläche dieses Moduls.
 * @typedef {object} AgentRead
 * @property {string} activeSheetId  id of the active sheet
 * @property {any[][]} rows  [bulk] every data row of the active sheet
 */
export default createModule({
  config: { id: 'qux' },
  Model: State,
  data(module, _t) {
    return {
      /**
       * @agent
       * @param {object} [options] field/row selection
       * @returns {AgentRead} the agent-facing read surface
       */
      read(options) { return readAgentState('qux', { activeSheetId: '', rows: [] }, options); },
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

test('collectAgentData: an AgentRead typedef REPLACES the model fields', async () => {
  const root = fixture({ qux: { 'qux.js': AGENT_READ_VM, 'qux-model.js': BAR_MODEL } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(Object.keys(modules.qux.fields), ['activeSheetId', 'rows']);
  assert.equal(modules.qux.fields.activeSheetId.type, 'string');
  assert.equal(modules.qux.fields.activeSheetId.help, 'id of the active sheet');
  assert.equal(modules.qux.fields.activeSheetId.derived, true);
});

test('collectAgentData: the [bulk] sentinel marks a bulk field and leaves the help clean', async () => {
  const root = fixture({ qux: { 'qux.js': AGENT_READ_VM, 'qux-model.js': BAR_MODEL } });
  const { modules } = await collectAgentData(root);
  assert.equal(modules.qux.fields.rows.bulk, true);
  assert.equal(modules.qux.fields.rows.help, 'every data row of the active sheet');
  assert.equal(modules.qux.fields.activeSheetId.bulk, false);
});

test('collectAgentData: [bulk] heisst table, [bulk:tree] heisst tree, ohne Marke steht nichts da', async () => {
  // Das Sentinel trug bisher nur „ja/nein". Welchen Umfangs-Deskriptor ein
  // Massenfeld bekommt (Zeilen+Spalten oder Knoten+Tiefe), stand nirgends —
  // ein Baum wurde als Tabelle beschrieben.
  const vm = AGENT_READ_VM.replace(
    ' * @property {any[][]} rows  [bulk] every data row of the active sheet\n',
    ' * @property {any[][]} rows  [bulk] every data row of the active sheet\n'
    + ' * @property {object[]} nodes  [bulk:tree] the question tree\n',
  );
  const root = fixture({ qux: { 'qux.js': vm, 'qux-model.js': BAR_MODEL } });
  const { modules } = await collectAgentData(root);
  const fields = modules.qux.fields;

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

test('collectAgentData: bulkKind am Model-Feld — @agentBulk tree gegen @agentBulk', async () => {
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
  const { modules } = await collectAgentData(root);

  assert.equal(modules.foo.fields.nodes.bulk, true);
  assert.equal(modules.foo.fields.nodes.bulkKind, 'tree');
  assert.equal(modules.foo.fields.rows.bulkKind, 'table');
  assert.equal('bulkKind' in modules.foo.fields.problem, false);
});

test('collectAgentData: eine unbekannte Massendaten-Art im Typedef ist ein Verstoß', async () => {
  // `agent-contract.js` sichert `'table'|'tree'` zu, der Generator prüfte es
  // nicht: `[bulk:graph]` kam durch, und zur Laufzeit partitionierten die
  // beiden Prädikate in `projectReadState` dann unterschiedlich — das Feld
  // wurde als Tabelle BESCHRIEBEN, zählte aber nicht als Tabelle, und beide
  // Massenfelder bekamen die globalen Spalten.
  const vm = AGENT_READ_VM.replace('[bulk] every data row', '[bulk:graph] every data row');
  const root = fixture({ qux: { 'qux.js': vm, 'qux-model.js': BAR_MODEL } });
  const { modules } = await collectAgentData(root);

  assert.ok(modules.qux.violations.includes('invalid_bulk_kind:rows:graph'),
    `erwartet invalid_bulk_kind:rows:graph, bekam ${JSON.stringify(modules.qux.violations)}`);
  assert.equal(modules.qux.available, false);
});

test('collectAgentData: eine unbekannte Massendaten-Art am Model-Feld ist ein Verstoß, einzeilig', async () => {
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
  const { modules } = await collectAgentData(root);

  assert.ok(modules.foo.violations.includes('invalid_bulk_kind:rows:die Zeilen'),
    `erwartet invalid_bulk_kind:rows:die Zeilen, bekam ${JSON.stringify(modules.foo.violations)}`);
  assert.ok(modules.foo.violations.every(v => !v.includes('\n')),
    `Verstoßcodes sind zeilenfrei: ${JSON.stringify(modules.foo.violations)}`);
});

test('collectAgentData: table und tree sind erlaubt und melden nichts — die Prüfung weist nicht zu viel ab', async () => {
  const vm = AGENT_READ_VM.replace(
    ' * @property {any[][]} rows  [bulk] every data row of the active sheet\n',
    ' * @property {any[][]} rows  [bulk] every data row of the active sheet\n'
    + ' * @property {object[]} nodes  [bulk:tree] the question tree\n',
  ).replace('rows: [] }', 'rows: [], nodes: [] }');
  const root = fixture({ qux: { 'qux.js': vm, 'qux-model.js': BAR_MODEL } });
  const { modules } = await collectAgentData(root);

  assert.deepEqual(modules.qux.reported.filter(v => v.startsWith('invalid_bulk_kind')), []);
  assert.equal(modules.qux.available, true);
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

test('collectAgentData: @agentOmit am Model-Feld landet als omit im Feldschema', async () => {
  const root = fixture({ foo: { 'foo.js': TAGGED_VM, 'foo-model.js': OMIT_MODEL } });
  const { modules } = await collectAgentData(root);

  assert.deepEqual(modules.foo.fields.images.omit, ['inScope[].dataUrl', 'outScope[].dataUrl']);
  assert.equal(modules.foo.fields.images.help, 'image galleries');
  assert.equal('omit' in modules.foo.fields.problem, false, 'ohne Marke steht kein omit');
  assert.deepEqual(modules.foo.reported.filter(v => v.includes('omit')), []);
});

test('collectAgentData: [omit:…] im Typedef, vor oder nach [bulk], hält die Hilfe sauber', async () => {
  for (const sentinels of ['[bulk] [omit:[][].image]', '[omit:[][].image] [bulk]']) {
    const root = fixture({ qux: { 'qux.js': cellsVm(sentinels), 'qux-model.js': BAR_MODEL } });
    const { modules } = await collectAgentData(root);
    const cells = modules.qux.fields.cells;

    assert.equal(cells.bulk, true, sentinels);
    assert.equal(cells.bulkKind, 'table', sentinels);
    assert.deepEqual(cells.omit, ['[][].image'], sentinels);
    assert.equal(cells.help, 'the 3x3 cells', sentinels);
    assert.deepEqual(modules.qux.reported.filter(v => v.includes('omit')), [], sentinels);
  }
  const root = fixture({ qux: { 'qux.js': AGENT_READ_VM, 'qux-model.js': BAR_MODEL } });
  assert.equal('omit' in (await collectAgentData(root)).modules.qux.fields.rows, false);
});

test('collectAgentData: ein Auslassungspfad gegen die Grammatik ist invalid_omit_path', async () => {
  const cases = [
    ['@agentOmit', 'invalid_omit_path:images:'],
    ['@agentOmit inScope[]', 'invalid_omit_path:images:inScope[]'],
    ['@agentOmit inScope..dataUrl', 'invalid_omit_path:images:inScope..dataUrl'],
    ['@agentOmit []', 'invalid_omit_path:images:[]'],
  ];
  for (const [tag, code] of cases) {
    const root = fixture({ foo: { 'foo.js': TAGGED_VM, 'foo-model.js': omitModel(tag) } });
    const { modules } = await collectAgentData(root);
    assert.ok(modules.foo.violations.includes(code), `${tag}: erwartet ${code}, bekam ${JSON.stringify(modules.foo.violations)}`);
    assert.equal(modules.foo.available, false, tag);
  }
});

test('collectAgentData: Auslassungspfade mit {} und führendem Punkt sind gültig, eine offene Klammer nicht', async () => {
  for (const tag of ['@agentOmit {}', '@agentOmit .a{}', '@agentOmit []{}', '@agentOmit .a[].b{}']) {
    const root = fixture({ foo: { 'foo.js': TAGGED_VM, 'foo-model.js': omitModel(tag, 'object') } });
    const { modules } = await collectAgentData(root);
    assert.deepEqual(modules.foo.violations.filter(v => v.includes('omit')), [], tag);
  }
  const root = fixture({ foo: { 'foo.js': TAGGED_VM, 'foo-model.js': omitModel('@agentOmit {', 'object') } });
  assert.ok((await collectAgentData(root)).modules.foo.violations.includes('invalid_omit_path:images:{'));
});

test('collectAgentData: ein Pfad, der nicht zum Typ passt, ist omit_path_mismatch', async () => {
  const cases = [
    [omitModel('@agentOmit inScope.dataUrl'), 'omit_path_mismatch:images:inScope.dataUrl'],
    [omitModel('@agentOmit gallery[].dataUrl'), 'omit_path_mismatch:images:gallery[].dataUrl'],
    [omitModel('@agentOmit inScope[].dataUrl', '{inScope:string, outScope:string}'), 'omit_path_mismatch:images:inScope[].dataUrl'],
  ];
  for (const [model, code] of cases) {
    const root = fixture({ foo: { 'foo.js': TAGGED_VM, 'foo-model.js': model } });
    const { modules } = await collectAgentData(root);
    assert.ok(modules.foo.violations.includes(code), `erwartet ${code}, bekam ${JSON.stringify(modules.foo.violations)}`);
  }
  const root = fixture({ qux: { 'qux.js': cellsVm('[bulk] [omit:[].image]'), 'qux-model.js': BAR_MODEL } });
  assert.ok((await collectAgentData(root)).modules.qux.violations.includes('omit_path_mismatch:cells:[].image'));
});

test('collectAgentData: ein nicht auflösbarer Typ widerlegt keinen Pfad', async () => {
  for (const type of ['object', 'any', 'Gallery', '{a: string}|{b: string}', '{x: object}']) {
    const root = fixture({ foo: { 'foo.js': TAGGED_VM, 'foo-model.js': omitModel('@agentOmit x.y', type) } });
    const { modules } = await collectAgentData(root);
    assert.deepEqual(modules.foo.reported.filter(v => v.includes('omit')), [], type);
  }
});

test('collectAgentData: a module with an AgentRead typedef is available without a model class', async () => {
  // Kein `Model:`-Mitglied → readModelFields würde `unresolvable_model_class`
  // melden. Mit deklarierter Lesefläche ist das Model irrelevant.
  const noModel = AGENT_READ_VM.replace('  Model: State,\n', '');
  const root = fixture({ qux: { 'qux.js': noModel, 'qux-model.js': BAR_MODEL } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.qux.violations, []);
  assert.equal(modules.qux.available, true);
});

test('readAgentReadTypedef: returns null when the module declares none', async () => {
  const sf = ts.createSourceFile('x.js', TAGGED_VM, ts.ScriptTarget.ESNext, true);
  assert.equal(readAgentReadTypedef(sf), null);
});

const TRAILING_AGENT_READ_VM = `/**
 * Bar module.
 * @agent
 */
import { createModule } from '../../core/template-module.js';
import { State } from './qux-model.js';

export default createModule({
  config: { id: 'qux' },
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

test('readAgentReadTypedef: a typedef block NOT attached to a statement (trailing at end of file) is not found', async () => {
  const sf = ts.createSourceFile('x.js', TRAILING_AGENT_READ_VM, ts.ScriptTarget.ESNext, true);
  assert.equal(readAgentReadTypedef(sf), null);
});

test('collectAgentData: a trailing, unattached AgentRead typedef falls back to the Model-derived fields', async () => {
  const root = fixture({ qux: { 'qux.js': TRAILING_AGENT_READ_VM, 'qux-model.js': BAR_MODEL } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(Object.keys(modules.qux.fields), ['sheets']);
  assert.equal('derived' in modules.qux.fields.sheets, false);
});

const VIA_VM = (via) => TAGGED_VM.replace('export default createModule', `/**
 * @typedef {object} AgentRead
 * @property {string} problem  [via: ${via}] die Problemstellung
 */
export default createModule`);

test('readAgentReadTypedef: [via: a, b] wird gelesen und aus der Hilfe entfernt', async () => {
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

test('readAgentReadTypedef: [via:] steht mit [bulk] in beliebiger Reihenfolge', async () => {
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

test('collectAgentData: [via:] mit unbekannter Aktion meldet unknown_via_action', async () => {
  const root = fixture({ foo: { 'foo.js': VIA_VM('nope'), 'foo-model.js': MODEL } });
  const { modules } = await collectAgentData(root);
  assert.ok(modules.foo.violations.includes('unknown_via_action:problem:nope'));
});

test('collectAgentData: [via:] mit echter Aktion meldet nichts', async () => {
  const root = fixture({ foo: { 'foo.js': VIA_VM('setProblem'), 'foo-model.js': MODEL } });
  const { modules } = await collectAgentData(root);
  assert.equal(modules.foo.violations.includes('unknown_via_action:problem:setProblem'), false);
  assert.deepEqual(modules.foo.fields.problem.via, ['setProblem']);
});

test('readAgentReadTypedef: [omit:…] und [via:…] stehen in beliebiger Reihenfolge', async () => {
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

test('readAgentReadTypedef: [via:] erlaubt Teil-Viewmodel-Namen mit Punkt', async () => {
  const sf = sourceOf(`
/**
 * @typedef {object} AgentRead
 * @property {object[]} f  [via: part.add, other] x
 */
export default 1;
`);
  assert.deepEqual(readAgentReadTypedef(sf).f.via, ['part.add', 'other']);
});

test('collectAgentData: eine @noagent-Methode in [via:] ist eine unbekannte Aktion', async () => {
  const root = fixture({ foo: { 'foo.js': VIA_VM('cardClass'), 'foo-model.js': MODEL } });
  const { modules } = await collectAgentData(root);
  assert.ok(modules.foo.violations.includes('unknown_via_action:problem:cardClass'));
});

test('collectAgentData: ein missratenes [via …] meldet invalid_via statt still Prosa zu sein', async () => {
  for (const bad of ['', ' a b', ' : x']) {
    const vm = TAGGED_VM.replace('export default createModule', `/**
 * @typedef {object} AgentRead
 * @property {string} problem  [via${bad}] die Problemstellung
 */
export default createModule`);
    const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
    assert.ok((await collectAgentData(root)).modules.foo.violations.includes('invalid_via:problem'), `[via${bad}]`);
  }
  const bad2 = VIA_VM('a b');
  const root = fixture({ foo: { 'foo.js': bad2, 'foo-model.js': MODEL } });
  assert.ok((await collectAgentData(root)).modules.foo.violations.includes('invalid_via:problem'));
});

test('collectAgentData: die beschriebenen Schreibwege stehen neben den Einträgen, nicht darin', async () => {
  const root = fixture({ foo: { 'foo.js': VIA_VM('setProblem'), 'foo-model.js': MODEL } });
  const data = await collectAgentData(root);
  assert.equal('writtenFields' in data.modules.foo, false);
  assert.ok(Array.isArray(data.writtenFields.foo));
});

test('die erzeugte Registry trägt keine Berichtsfelder', async () => {
  const root = fixture({ foo: { 'foo.js': VIA_VM('setProblem'), 'foo-model.js': MODEL } });
  assert.equal(renderAgentRegistryModule(await collectAgentData(root)).includes('writtenFields'), false);
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

test('collectAgentData: a module tag with zero @agent actions is a violation', async () => {
  const root = fixture({ empty: { 'empty.js': TAGGED_NO_ACTIONS, 'empty-model.js': BAR_MODEL } });
  const { modules } = await collectAgentData(root);
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

test('collectAgentData: a module whose ONLY action is read() is still a violation', async () => {
  const root = fixture({ empty: { 'empty.js': TAGGED_ONLY_READ, 'empty-model.js': BAR_MODEL } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(Object.keys(modules.empty.actions), ['read']);
  // `no_read_action` ist erfüllt — die erste Hürde muss trotzdem greifen,
  // sonst sind die beiden Codes redundant statt orthogonal.
  assert.ok(!modules.empty.violations.includes('no_read_action'));
  assert.ok(modules.empty.violations.includes('module_tag_without_actions'));
  assert.equal(modules.empty.available, false);
});

test('collectAgentData: a released module without a read() action is a violation', async () => {
  const noRead = TAGGED_VM.replace(/\/\*\*\n\s+\* Read the full state\.\n\s+\* @agent\n\s+\* @returns \{object\} the state\n\s+\*\/\n\s+read\(\) \{ return \{\}; \},\n/, '');
  const root = fixture({ foo: { 'foo.js': noRead, 'foo-model.js': MODEL } });
  const { modules } = await collectAgentData(root);
  assert.ok(modules.foo.violations.includes('no_read_action'));
  assert.equal(modules.foo.available, false);
});

test('collectAgentData: both new hurdles are only REPORTED on an untagged module', async () => {
  const root = fixture({
    empty: { 'empty.js': TAGGED_NO_ACTIONS.replace(' * @agent\n', ''), 'empty-model.js': BAR_MODEL },
  });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.empty.violations, []);
  assert.ok(modules.empty.reported.includes('module_tag_without_actions'));
  assert.ok(modules.empty.reported.includes('no_read_action'));
});

test('collectAgentData: the released pilot modules are available in the real tree', async () => {
  // Der echte Baum, nicht ein Fixture: dieser Fall ist das Tor, das eine
  // Freigabe festhält. Er wächst mit jedem freigegebenen Pilotmodul.
  const appDir = join(import.meta.dirname, '..', '..');
  const { modules, coverage } = await collectAgentData(appDir);
  for (const id of ['five-why', 'worksheet']) {
    assert.deepEqual(modules[id].violations, [], `${id} hat Verstöße`);
    assert.equal(modules[id].available, true, `${id} ist nicht freigegeben`);
    assert.ok('read' in modules[id].actions, `${id} hat kein read()`);
  }
  // Ein umgestelltes Modul bekommt nur den Platzhalter; seine Fläche entsteht
  // zur Laufzeit aus dem Schema (siehe viewmodel-Test des Moduls).
  assert.deepEqual(modules['hypothesis-test'].violations, [], 'hypothesis-test hat Verstöße');
  assert.equal(modules['hypothesis-test'].available, true, 'hypothesis-test ist nicht freigegeben');
  assert.ok(coverage.available >= 3);
});

test('collectAgentData: hypothesis-test ist umgestellt und trägt den Eintrag aus dem Schema', async () => {
  const appDir = join(import.meta.dirname, '..', '..');
  const { modules } = await collectAgentData(appDir);
  const e = modules['hypothesis-test'];
  assert.equal(e.schema, true);
  assert.equal(e.fields.alpha.type, 'number');
  assert.equal(e.fields.result.derived, true);
  assert.ok('read' in e.actions);
});

test('collectAgentData: die Vorschau-Adapter des doe-planner stehen nicht auf der Agentenfläche', async () => {
  // Rollen des datagrid-Widgets, nur für das Raster (`agentWrite: false` an
  // einem Parameter); ein Agent schreibt über setPreviewCell/setPreviewCells.
  const appDir = join(import.meta.dirname, '..', '..');
  const adapters = ['previewSetCells', 'previewPasteBlock', 'previewClearRange', 'previewFillRange', 'previewContextMenu', 'previewExport'];
  const vmFile = join(appDir, 'js', 'modules', 'doe-planner', 'viewmodel', 'viewmodel.js');
  const read = readViewmodelCommands(readFileSync(vmFile, 'utf8'), vmFile);
  for (const name of adapters) assert.equal(read[name]?.agentHidden, true, `${name} ist nicht als agentHidden gelesen`);
  const { modules } = await collectAgentData(appDir);
  const actions = modules['doe-planner'].actions;
  for (const name of adapters) assert.ok(!(name in actions), `${name} steht auf der Agentenfläche`);
  assert.ok('setPreviewCell' in actions && 'setPreviewCells' in actions, 'die Modell-Kommandos der Vorschau bleiben');
});

test('collectAgentData: morphological-box nennt seine Invarianten in Deklarationsreihenfolge', async () => {
  const appDir = join(import.meta.dirname, '..', '..');
  const { modules } = await collectAgentData(appDir);
  assert.deepEqual(modules['morphological-box'].invariants,
    ['uniqueIds', 'validConflicts', 'validPicks', 'activeConcept']);
});

test('collectAgentData: worksheet declares its read surface, rows are bulk', async () => {
  const appDir = join(import.meta.dirname, '..', '..');
  const { modules } = await collectAgentData(appDir);
  assert.deepEqual(Object.keys(modules.worksheet.fields),
    ['sheets', 'sheetId', 'rowCount', 'columns', 'rows', 'formulas']);
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

test('i18n-Tor: die geteilte Statistiktabelle liefert ihre Anker-Schlüssel an die Tore', async () => {
  const appDir = join(import.meta.dirname, '..', '..');
  const keys = helpKeysInSharedSources(appDir).map(([, k]) => k);
  assert.ok(keys.includes('modules.shared.types.Stats.mean'), keys.join(', '));
  assert.ok(keys.includes('modules.shared.types.SeriesStats.name'), keys.join(', '));
});

test('i18n-Tor: jede Aktion, jeder Parameter und jedes Feld eines freigegebenen Moduls hat einen Schlüssel in BEIDEN Sprachdateien', async () => {
  const appDir = join(import.meta.dirname, '..', '..');
  const { modules } = await collectAgentData(appDir);
  const trees = readHelpTables(appDir);
  const released = Object.entries(modules).filter(([, m]) => m.available === true);
  assert.ok(released.length >= 1, 'kein freigegebenes Modul — das Tor prüfte nichts');

  const missing = [];
  for (const [id, entry] of released) {
    for (const [action, def] of Object.entries(entry.actions)) {
      for (const [lang, tree] of Object.entries(trees)) {
        const helpKey = def.helpKey ?? `actions.${action}.help`;
        if (!helpExists(tree, id, helpKey)) {
          missing.push(`${lang}: modules.${id}.${helpKey}`);
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

test('i18n-Tor: jeder Anker-Schlüssel (Vorlage, Modul-JS, geteilter Baustein) löst in BEIDEN Sprachdateien auf', async () => {
  const appDir = join(import.meta.dirname, '..', '..');
  const { modules } = await collectAgentData(appDir);
  const trees = readHelpTables(appDir);
  const tablesOf = helpTablesFor(appDir);
  const broken = [];
  let checked = 0;
  for (const [id, entry] of Object.entries(modules)) {
    if (entry.available !== true) continue;
    for (const [file, key] of [...helpKeysInTemplates(appDir, id), ...helpKeysInScripts(appDir, id)]) {
      checked += 1;
      // `context-help.js` fragt NUR dieses Literal (`i18n.exists(key)`) und
      // kennt keinen geteilten Rückfall — ein Tippfehler heißt: kein Knopf.
      for (const [lang, tree] of Object.entries(tablesOf(file))) {
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

test('i18n-Tor: ein verankerter Satz (Vorlage, Modul-JS, geteilter Baustein) enthält keinen Strukturjargon', async () => {
  // Doppelnutzen: der Satz am Label ist derselbe, den der Agent liest. Wer
  // Alt hält, prüft damit die Agentenbeschreibung — das geht nur, wenn sie
  // für Menschen geschrieben ist. Die Struktur steht im JSDoc-Typ.
  const appDir = join(import.meta.dirname, '..', '..');
  const { modules } = await collectAgentData(appDir);
  const trees = readHelpTables(appDir);
  const tablesOf = helpTablesFor(appDir);
  const jargon = [];
  for (const [id, entry] of Object.entries(modules)) {
    if (entry.available !== true) continue;
    for (const [file, key] of [...helpKeysInTemplates(appDir, id), ...helpKeysInScripts(appDir, id)]) {
      for (const [lang, tree] of Object.entries(tablesOf(file))) {
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
  const trees = readHelpTables(appDir);
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
test('i18n-Tor: der read-Hilfetext jedes freigegebenen Moduls löst über die dokumentierte Kette auf', async () => {
  const appDir = join(import.meta.dirname, '..', '..');
  const { modules } = await collectAgentData(appDir);
  const trees = readHelpTables(appDir);
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

test('i18n-Tor: ein modulspezifischer read-Hilfetext gewinnt vor dem geteilten', async () => {
  // Der geteilte Rückfall (`modules.shared.actions.read.help`) ist additiv: der
  // Modulschlüssel gewinnt weiterhin. Dieser Fall hält am echten Baum fest,
  // dass Module mit eigenem Text ihn über die Kette behalten — ohne ein
  // bestimmtes Modul zu nennen, dessen Text bei der Umstellung umzieht.
  const appDir = join(import.meta.dirname, '..', '..');
  const { de } = readHelpTables(appDir);
  const shared = lookup(de, 'modules.shared.actions.read.help');
  assert.ok(shared);
  assert.ok(lookup(de, 'modules.shared.actions.read.params.options'));
  const own = Object.keys(de.modules).filter((id) => id !== 'shared'
    && ![undefined, shared].includes(lookup(de, `modules.${id}.actions.read.help`)));
  assert.ok(own.length > 0, 'kein Modul mit eigenem read-Hilfetext — dieser Fall prüft nichts');
  for (const id of own) {
    const resolved = helpKeys(id, 'actions.read.help').map((k) => lookup(de, k)).find(Boolean);
    assert.equal(resolved, lookup(de, `modules.${id}.actions.read.help`), id);
  }
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
    await import(join(appDir, 'js', 'modules', 'hypothesis-test', 'domain', 'model.js'));
  const html = readFileSync(
    join(appDir, 'js', 'modules', 'hypothesis-test', 'resources', 'view.html'), 'utf8');

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

  assert.deepEqual(attrValues('data-arg-category'), [...CATEGORIES]);
  assert.deepEqual(attrValues('data-arg-test-type'), [...TEST_TYPES]);
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

test('collectDomDetours erkennt += auf innerHTML', async () => {
  const hits = collectDomDetours(sourceOf(`function render(el) { el.innerHTML += '<b>x</b>'; }`));
  assert.equal(hits.length, 1);
  assert.match(hits[0], /^dom_detour:innerHTML$/);
});

test('collectDomDetours sieht ??=, ||=, &&= und -=', async () => {
  for (const op of ['??=', '||=', '&&=', '-=']) {
    const hits = collectDomDetours(sourceOf(`el.dataset.k ${op} 'x';`));
    assert.deepEqual(hits, ['dom_detour:dataset.k'], op);
  }
});

test('collectDomDetours meldet dieselbe Eigenschaft einmal', async () => {
  assert.deepEqual(collectDomDetours(sourceOf(`el.innerHTML = 'a';\nel.innerHTML = 'b';`)), ['dom_detour:innerHTML']);
});

test('collectDomDetours erkennt dataset mit Klammerzugriff', async () => {
  const hits = collectDomDetours(sourceOf(`function mark(el) { el.dataset['state'] = 'on'; }`));
  assert.equal(hits.length, 1);
  assert.match(hits[0], /^dom_detour:dataset\.state$/);
});

test('eine Hilfsklasse in der Model-Datei mischt ihre Felder nicht unter', async () => {
  // Punkt (b) der Härtung: sieht behoben aus. Der Test hält die Korrektur.
  const root = fixture({
    foo: {
      'foo.js': `/**\n * Foo.\n * @agent\n */\nimport { State } from './foo-model.js';\ncreateModule({ id: 'foo', Model: State });`,
      'foo-model.js': `export class Helper {\n  /** @type {string} nicht die Lesefläche */\n  secret = '';\n}\nexport class State {\n  /** @type {string} der Titel */\n  title = '';\n}`,
    },
  });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(Object.keys(modules.foo.fields), ['title']);
});

test('ein geklammerter Funktionswert gilt als Methode, nicht als Daten', async () => {
  const root = fixture({
    foo: {
      'foo.js': `/**\n * Foo.\n * @agent\n */\ncreateModule({ id: 'foo', data() { return {\n  /**\n   * Tut etwas.\n   * @agent\n   * @returns {void} nichts\n   */\n  doIt: (() => {}),\n}; } });`,
    },
  });
  const { modules } = await collectAgentData(root);
  assert.ok(Object.prototype.hasOwnProperty.call(modules.foo.actions, 'doIt'),
    'der geklammerte Funktionswert wurde stumm übersprungen');
});

test('ein Verstoßcode eines vererbten Mitglieds trägt keine Zeilennummer', async () => {
  const root = fixture({
    foo: { 'foo.js': `/**\n * Foo.\n * @agent\n */\nimport { mix } from '../../ui/mix.js';\ncreateModule({ id: 'foo', data() { return { ...mix() }; } });` },
  }, { 'js/ui/mix.js': `export function mix() { return { unmarkiert() {} }; }` });
  const { modules } = await collectAgentData(root);
  const code = modules.foo.reported.find(c => c.startsWith('unmarked_method:unmarkiert'));
  assert.equal(code, 'unmarked_method:unmarkiert@js/ui/mix.js');
});

test('class State extends State wird gemeldet, nicht still terminiert', async () => {
  const root = fixture({
    foo: {
      'foo.js': `/**\n * Foo.\n * @agent\n */\nimport { State } from './foo-model.js';\ncreateModule({ id: 'foo', Model: State });`,
      'foo-model.js': `export class State extends State {\n  /** @type {string} der Titel */\n  title = '';\n}`,
    },
  });
  const { modules } = await collectAgentData(root);
  assert.ok(modules.foo.violations.some(v => v.startsWith('self_inheriting_class:')),
    `kein Befund: ${JSON.stringify(modules.foo.violations)}`);
});

test('calculator führt alle neun Modellfelder aus dem Schema, ohne die Setter der Altform', async () => {
  const appDir = join(import.meta.dirname, '..', '..');
  const { modules } = await collectAgentData(appDir);
  const calc = modules.calculator;
  assert.equal(calc.schema, true);
  assert.deepEqual(Object.keys(calc.fields).sort(),
    ['angleMode', 'dataset', 'expression', 'lastResult', 'lsl', 'memory', 'mode', 'ssDataset', 'usl']);
  assert.equal(calc.fields.lsl.type, 'number|null');
  for (const name of ['setAngleMode', 'setMemory', 'setLsl', 'setUsl', 'toggleAngle']) {
    assert.ok(!Object.hasOwn(calc.actions, name), name);
  }
});

test('unreadable_state_key: ein persistierter Schlüssel ohne Lesefeld ist ein Befund', async () => {
  const root = fixture({ foo: { 'foo.js': TITLE_VM, 'foo-model.js': `export class State {
    /** @type {string} der Titel */
    title = '';
    toJSON() { return { title: this.title, hidden: 'weg' }; }
  }` } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreadable_state_key:hidden']);
  // tagged⇒hard: der Befund blockiert tatsächlich die Freigabe, nicht nur `reported`.
  assert.ok(modules.foo.violations.includes('unreadable_state_key:hidden'));
  assert.equal(modules.foo.available, false);
});

test('unreadable_state_key: ein _-präfigierter persistierter Schlüssel wird NICHT gemeldet', async () => {
  const root = fixture({ foo: { 'foo.js': TITLE_VM, 'foo-model.js': `export class State {
    /** @type {string} der Titel */
    title = '';
    toJSON() { return { title: this.title, _schema: 3 }; }
  }` } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, []);
});

test('unreadable_state_key: JSON.parse(JSON.stringify({…})) wird entpackt', async () => {
  const root = fixture({ foo: { 'foo.js': TITLE_VM, 'foo-model.js': `export class State {
    /** @type {string} der Titel */
    title = '';
    toJSON() { return JSON.parse(JSON.stringify({ title: this.title, hidden: 1 })); }
  }` } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreadable_state_key:hidden']);
});

test('unreadable_state_key: eine lokale Variable wird verfolgt', async () => {
  const root = fixture({ foo: { 'foo.js': TITLE_VM, 'foo-model.js': `export class State {
    /** @type {string} der Titel */
    title = '';
    toJSON() { const out = { title: this.title, hidden: 1 }; return out; }
  }` } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreadable_state_key:hidden']);
});

test('unresolvable_tojson: ein Spread im Rückgabeobjekt ist eine Blindstelle', async () => {
  const root = fixture({ foo: { 'foo.js': TITLE_VM, 'foo-model.js': `export class State {
    /** @type {string} der Titel */
    title = '';
    toJSON() { return { ...this.base(), title: this.title }; }
  }` } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unresolvable_tojson']);
});

test('ein erklärtes AgentRead-Typedef setzt das Gate aus', async () => {
  const root = fixture({ qux: { 'qux.js': AGENT_READ_VM, 'qux-model.js': BAR_MODEL } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.qux.reported, []);
});

test('geerbtes toJSON wird gefunden', async () => {
  const root = fixture({ foo: { 'foo.js': TITLE_VM, 'foo-model.js': `export class Base {
    toJSON() { return { title: this.title, hidden: 1 }; }
  }
  export class State extends Base {
    /** @type {string} der Titel */
    title = '';
  }` } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreadable_state_key:hidden']);
});

test('unresolvable_tojson: eine nicht-const lokale Variable (let, neu zugewiesen) ist eine Blindstelle', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unresolvable_tojson']);
});

test('unresolvable_tojson: mehr als eine return-Anweisung ist eine Blindstelle', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unresolvable_tojson']);
});

test('unreachable_write: eine x-model-Bindung ohne @agent-Setter ist ein Befund', async () => {
  const root = fixture({ foo: {
    'foo.js': TAGGED_VM,
    'foo-model.js': `export class State {
      /** @type {string} der Titel */
      title = '';
      toJSON() { return { title: this.title }; }
    }`,
    'foo.html': '<input x-model="model.title">',
  } });
  const { modules } = await collectAgentData(root);
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

test('viewFields: Liste kommt in die Registry, das Feld fällt aus der Lesefläche', async () => {
  const root = fixture({ foo: { 'foo.js': viewVm(), 'foo-model.js': viewModel("static VIEW_FIELDS = ['activeTab'];") } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.viewFields, ['activeTab']);
  assert.ok(!Object.hasOwn(modules.foo.fields, 'activeTab'));
  assert.ok(Object.hasOwn(modules.foo.fields, 'title'));
  assert.deepEqual(modules.foo.reported, [], 'auch kein unreadable_state_key');
});

test('viewFields: ohne Deklaration kein Schlüssel', async () => {
  const root = fixture({ foo: { 'foo.js': viewVm(), 'foo-model.js': viewModel('') } });
  assert.equal((await collectAgentData(root)).modules.foo.viewFields, undefined);
});

test('unresolved_view_fields: kein Literal, oder Pfad gegen die Grammatik', async () => {
  for (const decl of ['static VIEW_FIELDS = makeList();', "static VIEW_FIELDS = ['a[]'];", "static VIEW_FIELDS = ['a..b'];"]) {
    const root = fixture({ foo: { 'foo.js': viewVm(), 'foo-model.js': `const makeList = () => [];\n${viewModel(decl)}` } });
    assert.ok((await collectAgentData(root)).modules.foo.reported.includes('unresolved_view_fields'), decl);
  }
});

test('view_field_not_persisted: erstes Segment fehlt in toJSON()', async () => {
  const root = fixture({ foo: { 'foo.js': viewVm(), 'foo-model.js': viewModel("static VIEW_FIELDS = ['activeTab', 'gibtEsNicht[].x'];") } });
  assert.deepEqual((await collectAgentData(root)).modules.foo.reported, ['view_field_not_persisted:gibtEsNicht[].x']);
});

test('view_field_declared: Feld steht im AgentRead-Typedef, auch verschachtelt', async () => {
  const typedef = `/**
 * @typedef {object} AgentRead
 * @property {string} activeTab  der Reiter
 * @property {Array<{ id: string, collapsed: boolean }>} risks  die Risiken
 */
`;
  const vm = viewVm({ typedef, readBody: "return readAgentState('foo', { activeTab: 'a', risks: [] }, options);" });
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js':
    viewModel("static VIEW_FIELDS = ['activeTab', 'risks[].collapsed'];\n  risks = [];", 'activeTab: this.activeTab, title: this.title, risks: this.risks') } });
  const { reported } = (await collectAgentData(root)).modules.foo;
  assert.ok(reported.includes('view_field_declared:activeTab'));
  assert.ok(reported.includes('view_field_declared:risks[].collapsed'));
});

test('view_field_agent_write: parametergetrieben ist ein Befund, die Folgeschreibung nicht', async () => {
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
  assert.deepEqual((await collectAgentData(hit)).modules.foo.reported, ['view_field_agent_write:activeTab']);
  const clean = fixture({ foo: { 'foo.js': viewVm({ extra: consequence }), 'foo-model.js': modelText } });
  assert.deepEqual((await collectAgentData(clean)).modules.foo.reported, []);
});

/**
 * Ein Modul mit den Ansichtsfeldern `activeTab` und `selected`,
 * das nur die übergebene @agent-Methode zusätzlich trägt.
 * @param {string} signature  z. B. `pick(id)`
 * @param {string} body  der Methodenkörper
 * @param {{ modelMembers?: string, views?: string[] }} [options]
 * @returns {string[]} die Befunde zu den Ansichtsfeldern
 */
const viewWriteFindings = async (signature, body, { modelMembers = '', views = ['selected'] } = {}) => {
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
  return (await collectAgentData(root)).modules.foo.reported.filter(code => code.startsWith('view_field_'));
};

test('view_field_agent_write: ein Aufruf trennt die Herkunft vom Parameter', async () => {
  assert.deepEqual(await viewWriteFindings('add(type)', 'const q = make(type); this.model.selected = q.id;'), []);
});

test('view_field_agent_write: der Parameter selbst ist ein Befund', async () => {
  assert.deepEqual(await viewWriteFindings('pick(id)', 'this.model.selected = id;'), ['view_field_agent_write:selected']);
});

test('view_field_agent_write: ein reiner Alias des Parameters ist ein Befund', async () => {
  assert.deepEqual(await viewWriteFindings('pick(id)', 'const x = id; this.model.selected = x;'), ['view_field_agent_write:selected']);
});

test('view_field_agent_write: die Prüfung sieht zwei Model-Ebenen tief', async () => {
  const modelMembers = 'set(a) { this._put(a); }\n  _put(b) { this.selected = b; }';
  assert.deepEqual(await viewWriteFindings('pick(id)', 'this.model.set(id);', { modelMembers }), ['view_field_agent_write:selected']);
});

test('view_field_agent_write: ein Aliaspfad trifft das Element-Ansichtsfeld', async () => {
  assert.deepEqual(
    await viewWriteFindings('pick(id, v)', 'const s = this.model.items.find(i => i.id === id); s.open = v;', { views: ['items[].open'] }),
    ['view_field_agent_write:items[].open']);
});

test('view_field_agent_write: weitere Formen, die aus dem Parameter stammen', async () => {
  const hit = ['view_field_agent_write:selected'];
  assert.deepEqual(await viewWriteFindings('pick(id)', 'this.model.selected = id.value;'), hit, 'Eigenschaftszugriff');
  assert.deepEqual(await viewWriteFindings('pick(id)', 'const x = id.value; const y = x; this.model.selected = y;'), hit, 'Kette');
  assert.deepEqual(await viewWriteFindings('pick(id)', 'this.model.selected = (id);'), hit, 'Klammern');
  assert.deepEqual(await viewWriteFindings('pick(id)', 'this.model.set(id.value);', { modelMembers: 'set(a) { const c = a; this.selected = c; }' }), hit, 'Alias im Model');
  assert.deepEqual(await viewWriteFindings('pick(id, v)', 'this.model.open(id, v);', {
    views: ['items[].open'], modelMembers: 'open(id, v) { const s = this.items.find(i => i.id === id); s.open = v; }',
  }), ['view_field_agent_write:items[].open'], 'Aliaspfad im Model');
});

test('view_field_agent_write: was die Herkunft trennt, ist kein Befund', async () => {
  assert.deepEqual(await viewWriteFindings('pick(id)', 'const q = new Thing(id); this.model.selected = q.id;'), [], 'new');
  assert.deepEqual(await viewWriteFindings('pick(id)', 'const q = { id }; this.model.selected = q.id;'), [], 'Objektliteral');
  assert.deepEqual(await viewWriteFindings('pick(id)', 'this.model.selected = make(id);'), [], 'Aufruf rechts');
  assert.deepEqual(await viewWriteFindings('pick(id)', 'this.model.selected = id ? id : null;'), [], 'Bedingung');
  assert.deepEqual(await viewWriteFindings('pick(id)', 'this.model.selected = id || null;'), [], 'Operator');
  assert.deepEqual(await viewWriteFindings('pick(id)', "this.model.selected = requireText('id', make(id));"), [], 'Prüfer um einen fremden Aufruf');
  assert.deepEqual(await viewWriteFindings('pick(id)', "this.model.selected = this.requireText('id', id);"), [], 'Prüfer als Methode');
  assert.deepEqual(await viewWriteFindings('pick(id)', "this.model.selected = requirements(id);"), [], 'nur der Name beginnt gleich');
  assert.deepEqual(await viewWriteFindings('pick(id)', "const q = requireThing(make(id)); this.model.selected = q;"), [], 'Alias eines Prüfers ohne direkten Wert');
  assert.deepEqual(await viewWriteFindings('pick(id)', 'this.model.set(make(id));', { modelMembers: 'set(a) { this.selected = a; }' }), [], 'Aufruf als Argument');
  assert.deepEqual(await viewWriteFindings('pick(id)', 'this.model.set(id);', { modelMembers: 'set(a) { const q = make(a); this.selected = q.id; }' }), [], 'Aufruf im Model');
  assert.deepEqual(await viewWriteFindings('pick(id)', 'const s = this.model.items.find(i => i.id === id); this.model.selected = s.id;'), [], 'Wert aus der Sammlung');
  assert.deepEqual(await viewWriteFindings('pick(id)', '[1].forEach(id => { this.model.selected = id; });'), [], 'verdeckter Name');
});

test('view_field_agent_write: Prüfer und Typwandlung geben den Parameter zurück', async () => {
  const hit = ['view_field_agent_write:selected'];
  assert.deepEqual(await viewWriteFindings('pick(id)', "this.model.selected = requireText('id', id);"), hit, 'Prüfer rechts');
  assert.deepEqual(await viewWriteFindings('pick(id)', "const x = requireId('id', id); this.model.selected = x;"), hit, 'Prüfer als Alias');
  assert.deepEqual(await viewWriteFindings('pick(id)', "this.model.selected = requireEnum('id', id, IDS);"), hit, 'Prüfer mit Menge');
  for (const wrap of ['String', 'Number', 'Boolean']) {
    assert.deepEqual(await viewWriteFindings('pick(id)', `this.model.selected = ${wrap}(id);`), hit, wrap);
  }
  assert.deepEqual(await viewWriteFindings('pick(id)', "this.model.set(requireText('id', id));", { modelMembers: 'set(a) { this.selected = a; }' }), hit, 'als Argument');
  assert.deepEqual(await viewWriteFindings('pick(id)', 'this.model.set(id);', { modelMembers: 'set(a) { const c = String(a); this.selected = c; }' }), hit, 'im Model');
});

test('view_field_agent_write: ein Alias im Block zählt nur dort', async () => {
  const hit = ['view_field_agent_write:selected'];
  assert.deepEqual(await viewWriteFindings('pick(id)', 'if (id) { const x = id; this.model.selected = x; }'), hit, 'Block');
  assert.deepEqual(await viewWriteFindings('pick(id)', 'const a = id; if (id) { const b = a.v; if (b) { const c = b; this.model.selected = c; } }'), hit, 'verschachtelt');
  assert.deepEqual(await viewWriteFindings('pick(id)', '[1].forEach(() => { const x = id; this.model.selected = x; });'), hit, 'Closure');
  assert.deepEqual(await viewWriteFindings('pick(id)', 'if (id) { const x = id; this.model.set(x); }', { modelMembers: 'set(a) { this.selected = a; }' }), hit, 'Delegation');
  assert.deepEqual(await viewWriteFindings('pick(id)', 'this.model.set(id);', { modelMembers: 'set(a) { if (a) { const c = a; this.selected = c; } }' }), hit, 'im Model');
  assert.deepEqual(await viewWriteFindings('pick(id)', 'if (id) { const x = make(id); this.model.selected = x; }'), [], 'Aufruf im Block');
  assert.deepEqual(await viewWriteFindings('pick(id)', 'const x = id; if (id) { const x = make(id); this.model.selected = x; }'), [], 'Neubindung im Block');
  assert.deepEqual(await viewWriteFindings('pick(id)', 'if (id) { const x = id; } if (!id) { this.model.selected = x; }'), [], 'außerhalb des Blocks');
});

test('view_field_agent_write: ein Mutator mit dem Parameter ist eine Schreibung', async () => {
  const hit = ['view_field_agent_write:selected'];
  assert.deepEqual(await viewWriteFindings('pick(id)', 'this.model.selected.push(id);'), hit, 'direkt');
  assert.deepEqual(await viewWriteFindings('pick(id)', 'this.model.add(id);', { modelMembers: 'add(a) { this.selected.push(a); }' }), hit, 'über das Model');
});

test('writtenFields: ein Block-Alias bleibt in der weiten Menge ungesehen', async () => {
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
  assert.ok(!(await collectAgentData(root)).writtenFields.foo.includes('selected'));
});

test('view_field_agent_write: die dritte Model-Ebene bleibt ungesehen', async () => {
  const modelMembers = 'one(a) { this.two(a); }\n  two(b) { this.three(b); }\n  three(c) { this.selected = c; }';
  assert.deepEqual(await viewWriteFindings('pick(id)', 'this.model.one(id);', { modelMembers }), []);
});

test('view_field_agent_write: writtenFields bleibt die weite Menge', async () => {
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
  assert.ok((await collectAgentData(root)).writtenFields.foo.includes('selected'));
});

test('view_field_declared: reiner Typedef-Name nennt seine Schlüssel', async () => {
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
  assert.ok((await collectAgentData(root)).modules.foo.reported.includes('view_field_declared:selected.open'));
});

test('unresolvable_tojson: mit VIEW_FIELDS auch bei erklärter Lesefläche, und nur einmal', async () => {
  const typedef = `/**
 * @typedef {object} AgentRead
 * @property {string} title  der Titel
 */
`;
  const declaredVm = viewVm({ typedef, readBody: "return readAgentState('foo', { title: '' }, options);" });
  const spreadModel = (fields) => viewModel(fields, '...this.base(), title: this.title');
  const count = async (vm, model) => (await collectAgentData(fixture({ foo: { 'foo.js': vm, 'foo-model.js': model } })))
    .modules.foo.reported.filter(code => code === 'unresolvable_tojson').length;
  assert.equal(await count(declaredVm, spreadModel("static VIEW_FIELDS = ['activeTab'];")), 1, 'erklärt, mit Liste');
  assert.equal(await count(viewVm(), spreadModel("static VIEW_FIELDS = ['activeTab'];")), 1, 'abgeleitet, keine Doppelung');
  assert.equal(await count(declaredVm, spreadModel('')), 0, 'erklärt, ohne Liste bleibt es still');
});

test('Ansichtsfelder: keine Ausnahme bleibt offen bei einer Vorlagenbindung', async () => {
  const root = fixture({ foo: {
    'foo.js': viewVm(),
    'foo-model.js': viewModel("static VIEW_FIELDS = ['activeTab'];"),
    'foo.html': '<select x-model="model.activeTab"></select>',
  } });
  assert.deepEqual((await collectAgentData(root)).modules.foo.reported, []);
});

test('unreachable_write: eine direkte Zuweisung in einer @agent-Methode deckt ab', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, []);
});

test('unreachable_write: eine Zuweisung in einer @noagent-Methode deckt NICHT ab', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreachable_write:title']);
});

test('unreachable_write: Elementbindungen und Puffer lösen nichts aus', async () => {
  const root = fixture({ foo: {
    'foo.js': TITLE_VM,
    'foo-model.js': `export class State {
      /** @type {string} der Titel */
      title = '';
      toJSON() { return { title: this.title }; }
    }`,
    'foo.html': '<input x-model="step.title"><input x-model="draft">',
  } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, []);
});

test('template_model_call: ein direkter model.*-Aufruf aus der Vorlage ist ein Befund', async () => {
  const root = fixture({ foo: {
    'foo.js': TITLE_VM,
    'foo-model.js': `export class State {
      /** @type {string} der Titel */
      title = '';
      toJSON() { return { title: this.title }; }
    }`,
    'foo.html': '<button @click="model.removeTitle()">',
  } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['template_model_call:removeTitle']);
  // tagged⇒hard: genauso blockierend wie `unreachable_write`, nicht nur `reported`.
  assert.ok(modules.foo.violations.includes('template_model_call:removeTitle'));
  assert.equal(modules.foo.available, false);
});

test('template_model_call: ein Ereignismodifikator verdeckt den model.*-Aufruf nicht (W1-4)', async () => {
  const root = fixture({ foo: {
    'foo.js': TITLE_VM,
    'foo-model.js': `export class State {
      /** @type {string} der Titel */
      title = '';
      toJSON() { return { title: this.title }; }
    }`,
    'foo.html': '<button @click.stop.prevent="model.removeTitle()">',
  } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['template_model_call:removeTitle']);
  assert.ok(modules.foo.violations.includes('template_model_call:removeTitle'));
  assert.equal(modules.foo.available, false);
});

test('unreachable_write: eine Delegation an eine zuweisende Model-Methode deckt ab', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, []);
});

test('unreachable_write: eine Delegation an eine Model-Methode, die das Feld NICHT zuweist, deckt NICHT ab', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreachable_write:title']);
});

test('unreachable_write: eine Delegation an eine nicht auflösbare Model-Methode deckt NICHT ab (fail closed)', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreachable_write:title']);
});

test('unreachable_write: eine parameterlose @agent-Methode deckt NICHT ab, auch wenn eine Model-Methode zuweist (Review-Fund, Fix-Runde 3)', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreachable_write:title']);
  assert.equal(modules.foo.available, false);
});

test('unreachable_write: eine direkte Zuweisung einer Konstante deckt NICHT ab (kein Parameterfluss)', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreachable_write:title']);
});

test('unreachable_write: eine Delegation deckt ab, wenn der Wert über eine lokale Zwischenvariable aus dem Parameter fließt', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, []);
});

test('unreachable_write: eine Model-Methode, die an eine weitere Methode delegiert, deckt NICHT ab (nur eine Delegationsebene)', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreachable_write:title']);
});

test('unreachable_write: eine direkte `this.<feld>`-Zuweisung am Viewmodel (ohne `.model`) deckt NICHT ab', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreachable_write:title']);
});

test('unreachable_write: eine nicht auflösbare Model-Klasse lässt eine Delegation NICHT als Abdeckung zählen (fail closed)', async () => {
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
  const { modules } = await collectAgentData(root);
  // Vollständige Gleichheit statt nur `includes` (Review-Fund, Fix-Runde 4):
  // sonst hätte eine Regression, die `unreachable_write:title` zusätzlich
  // zu einem FALSCH angenommenen Treffer meldete, diesen Test nicht rot
  // gemacht. `unresolvable_model_class` steht ebenfalls drin — das ist der
  // erwartete, separate Befund über die Lesefläche, den `readModelFields`
  // für dieselbe nicht auflösbare `Model:`-Angabe sowieso schon meldet.
  assert.deepEqual(modules.foo.reported, ['unresolvable_model_class', 'unreachable_write:title']);
});

test('unreachable_write: ein Objektliteral-Schlüssel, der zufällig wie der Parameter heißt, beweist KEINEN Parameterfluss', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreachable_write:title']);
});

test('unreachable_write: ein Closure-Parameter, der den Methodenparameter überschattet, deckt NICHT ab', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreachable_write:title']);
});

test('unreachable_write: eine blockweit neu gebundene lokale Variable überschattet den Methodenparameter', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreachable_write:title']);
});

test('unreachable_write: eine verschachtelte Bindung ohne Setter ist ein Befund', async () => {
  const root = fixture({ foo: {
    'foo.js': WHOLE_PARAMS_VM,
    'foo-model.js': `export class State {
      /** @type {object} die Parameter */
      params = { alpha: '' };
      toJSON() { return { params: { alpha: this.params.alpha } }; }
    }`,
    'foo.html': '<input x-model="model.params.alpha">',
  } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreachable_write:params.alpha']);
  assert.equal(modules.foo.available, false);
});

test('unreachable_write: eine verschachtelte Zuweisung aus einem Parameter deckt ab', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, []);
  assert.equal(modules.foo.available, true);
});

test('unreachable_write: ein dynamischer Schlüssel deckt genau die geprüfte Menge ab', async () => {
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
  const { modules } = await collectAgentData(root);
  // alpha und beta sind abgedeckt, gamma NICHT — es steht nicht in PARAM_KEYS.
  assert.deepEqual(modules.foo.reported, ['unreachable_write:params.gamma']);
});

test('unreachable_write: ein Schlüssel mit Punkt deckt die zweite Ebene ab', async () => {
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
  const { modules } = await collectAgentData(root);
  // `tolerance.USL` steht nicht in PARAM_KEYS — genau dieses Feld bleibt offen.
  assert.deepEqual(modules.foo.reported, ['unreachable_write:params.tolerance.USL']);
});

test('unreachable_write: ein dynamischer Schlüssel ohne auflösbare Menge deckt NICHTS ab', async () => {
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
  const { modules } = await collectAgentData(root);
  // Fail closed: ohne geprüfte Schlüsselmenge ist nicht entscheidbar, welche
  // Felder der Agent wirklich treffen kann.
  assert.deepEqual(modules.foo.reported, ['unreachable_write:params.alpha']);
});

test('unreachable_write: eine Pfad-Hilfe, die nur LIEST, deckt NICHTS ab (Review-Fund)', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreachable_write:params.alpha']);
  assert.equal(modules.foo.available, false);
});

test('unreachable_write: eine Pfeilfunktions-Pfad-Hilfe deckt ab, eine gleichnamige Klasse NICHT', async () => {
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
  assert.deepEqual((await collectAgentData(arrow)).modules.foo.reported, []);

  const asClass = fixture({ foo: {
    'foo.js': `const PARAM_KEYS = ['alpha'];
class setAtPath { constructor(obj, path, value) { this.obj = obj; } }
${vm}`,
    'foo-model.js': model,
    'foo.html': html,
  } });
  assert.deepEqual((await collectAgentData(asClass)).modules.foo.reported, ['unreachable_write:params.alpha']);
});

test('unreachable_write: ein zweimal gebundener Pfad ist EIN Befund, nicht zwei', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreachable_write:params.alpha']);
});

test('unresolvable_tojson: eine Pfeilfunktions-toJSON als Klassenfeld wird nicht als MethodDeclaration erkannt und klettert nicht zur Basisklasse', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unresolvable_tojson']);
});

test('undeclared_option_source: eine zustandsabhängige Menge über einen lokalen Namen ist ein Befund', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['undeclared_option_source:answer:opt']);
});

test('undeclared_option_source: eine eingewickelte Menge wird am inneren Zugriff benannt', async () => {
  // Die Form der Altform von unit-converter — `Object.keys(this.model.unitKeys())`.
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['undeclared_option_source:setUnit:unitKey']);
});

test('undeclared_option_source: auch requireKnownId zählt', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['undeclared_option_source:setColumn:key']);
});

test('undeclared_option_source: eine Konstante als Wertemenge ist kein Befund', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, []);
});

test('undeclared_option_source: ein deklariertes Lesefeld desselben Namens genügt', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, []);
});

test('undeclared_option_source: eine _-präfixierte Menge ist kein Befund', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, []);
});

test('undeclared_option_source: ein parametrisierter Aufruf ist kein Befund', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, []);
});

test('undeclared_option_source: die Projektion eines deklarierten Feldes ist kein Befund', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, []);
});

test('undeclared_option_source: die Projektion eines nicht deklarierten Namens ist ein Befund', async () => {
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
  const { modules } = await collectAgentData(root);
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

test('undeclared_option_source: ein Elementzugriff ohne Lesefeld ist ein Befund (A-I1)', async () => {
  const root = fixture({ foo: {
    'foo.js': vmWithAgent(SET_COLUMN_ELEMENT_ACCESS),
    'foo-model.js': CHOSEN_MODEL,
  } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['undeclared_option_source:setColumn:ref']);
});

test('undeclared_option_source: ein Elementzugriff mit Lesefeld ist kein Befund (A-I1)', async () => {
  const root = fixture({ foo: {
    'foo.js': vmWithAgent(SET_COLUMN_ELEMENT_ACCESS).replace('export default createModule', `/**
 * @typedef {object} AgentRead
 * @property {string} chosen  die Wahl
 * @property {object} pickableColumns  die wählbaren Spalten je Platz
 */
export default createModule`).replace('read() { return {}; }', "read() { return readAgentState('foo', {chosen: '', pickableColumns: {}}); }"),
    'foo-model.js': CHOSEN_MODEL,
  } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, []);
});

test('undeclared_option_source: eine Alias-Kette über zwei Stufen wird verfolgt', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['undeclared_option_source:pick:v']);
});

test('undeclared_option_source: eine .filter-Projektion eines nicht deklarierten Namens ist ein Befund', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['undeclared_option_source:pick:v']);
});

test('undeclared_option_source: bares this.model als Menge ist kein Befund (blinder Fleck)', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, []);
});

test('undeclared_option_source: zwei Prüfungen derselben Menge sind EIN Befund', async () => {
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
  const { modules } = await collectAgentData(root);
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

test('unreachable_write: eine Pfad-Hilfe mit konstantem Wert deckt NICHTS ab (A-I3)', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreachable_write:params.alpha', 'unreachable_write:params.beta']);
});

test('unreachable_write: ein überschatteter Schlüssel deckt NICHTS ab (A-M2)', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreachable_write:params.alpha', 'unreachable_write:params.beta']);
});

test('unreachable_write: ein überschatteter Schlüssel an einer Pfad-Hilfe deckt NICHTS ab (A-M2)', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreachable_write:params.alpha', 'unreachable_write:params.beta']);
});

test('unreachable_write: eine Pfad-Hilfe mit Parameterwert deckt die geprüfte Menge ab', async () => {
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
  const { modules } = await collectAgentData(root);
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

test('unreachable_write: eine Direktzuweisung an der Model-Wurzel deckt die geprüften Schlüssel ab', async () => {
  const root = flatRoot(`const PARAM_KEYS = ['alpha', 'power'];\n`,
    `        requireEnum('key', key, PARAM_KEYS);\n        this.model[key] = value;`);
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported.filter(r => /:(alpha|power)$/.test(r)), []);
});

test('unreachable_write: eine importierte Pfad-Hilfe deckt die geprüfte Menge ab', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, []);
});

test('unreachable_write: eine importierte Hilfe, die nur LIEST, deckt NICHTS ab', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.notDeepEqual(modules.foo.reported, []);
});

test('unreachable_write: eine Pfad-Hilfe an der Model-Wurzel deckt Punkt-Schlüssel ab', async () => {
  const root = flatRoot(`const PARAM_KEYS = ['alpha', 'statParams.trim'];
function setAtPath(obj, path, value) { obj[path] = value; }
`, `        requireEnum('key', key, PARAM_KEYS);\n        setAtPath(this.model, key, value);`);
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported.filter(r => /:(alpha|statParams\.trim)$/.test(r)), []);
});

test('unreachable_write: Wächter – ohne requireEnum bleibt die Wurzelzuweisung ungedeckt', async () => {
  const root = flatRoot(`const PARAM_KEYS = ['alpha', 'power'];\n`, `        this.model[key] = value;`);
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported.filter(r => /:(alpha|power)$/.test(r)),
    ['unreachable_write:alpha', 'unreachable_write:power']);
});

test('unreachable_write: Wächter – ein konstanter Wert an der Model-Wurzel deckt NICHTS ab', async () => {
  const root = flatRoot(`const PARAM_KEYS = ['alpha', 'power'];\n`,
    `        requireEnum('key', key, PARAM_KEYS);\n        this.model[key] = 42;`);
  const { modules } = await collectAgentData(root);
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

async function keyedModules(opts) {
  const root = fixture({ foo: { 'foo.js': keyedVm(opts), 'foo-model.js': KEYED_MODEL } });
  return (await collectAgentData(root)).modules;
}

test('Schlüsselfläche: keyof Params liefert je Schlüssel Typ und Prosa an der Aktion', async () => {
  const { foo } = await keyedModules();
  assert.deepEqual(foo.reported, []);
  assert.deepEqual(foo.actions.setParam.keys, {
    name: { type: 'string', help: 'der Name des Merkmals' },
    k1: { type: "'0.2'|'0.15'", help: 'der Anteil der Toleranz' },
    n: { type: 'number', help: 'die Anzahl' },
  });
});

test('Schlüsselfläche: der Schlüsselparameter trägt in der Registry die Vereinigung der Schlüssel', async () => {
  const { foo } = await keyedModules();
  const key = foo.actions.setParam.params.find(p => p.name === 'key');
  assert.equal(key.type, "'name'|'k1'|'n'");
});

test('Schlüsselfläche: eine Aktion ohne keyof trägt kein keys-Feld', async () => {
  const { foo } = await keyedModules();
  assert.equal('keys' in foo.actions.setProblem, false);
});

test('Schlüsselfläche: eine nicht auffindbare Typedef ist ein Verstoß', async () => {
  const { foo } = await keyedModules({ keyParamType: 'keyof Missing' });
  assert.deepEqual(foo.reported, ['unresolved_key_typedef:setParam:Missing']);
});

test('Schlüsselfläche: weicht PARAM_KEYS von der Typedef ab, wird jeder abweichende Schlüssel gemeldet', async () => {
  const { foo } = await keyedModules({ keys: "['name', 'k1', 'extra']" });
  assert.deepEqual(foo.reported, ['key_set_mismatch:setParam:extra', 'key_set_mismatch:setParam:n']);
});

test('Schlüsselfläche: ohne auflösbare Laufzeitmenge ist die Schlüsselmenge ungeprüft — ein Verstoß', async () => {
  const vm = keyedVm().replace("requireEnum('key', key, PARAM_KEYS);", "requireEnum('key', key, this.activeParams());");
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': KEYED_MODEL } });
  const { modules } = await collectAgentData(root);
  assert.ok(modules.foo.reported.includes('unverified_key_set:setParam'), modules.foo.reported.join(', '));
});

test('Schlüsselfläche: ein requireEnum über die Elemente einer Liste prüft nicht den ganzen Wert', async () => {
  // `enabled: string[]` wird elementweise gegen eine Menge geprüft. Das ist
  // keine Aussage über den Typ des Werts selbst und darf nicht gegen die
  // Typedef gehalten werden.
  const { foo } = await keyedModules({
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

test('Schlüsselfläche: eine importierte Laufzeitmenge wird über den Import aufgelöst', async () => {
  const root = fixture({ foo: {
    'foo.js': importedKeysVm('./foo-keys.js'),
    'foo-model.js': KEYED_MODEL,
    'foo-keys.js': "export const PARAM_KEYS = ['name', 'k1', 'n'];\n",
  } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, []);
});

test('Schlüsselfläche: ein umbenannter Import zählt wie der Originalname', async () => {
  const root = fixture({ foo: {
    'foo.js': importedKeysVm('./foo-keys.js', 'KEYS'),
    'foo-model.js': KEYED_MODEL,
    'foo-keys.js': "export const KEYS = ['name', 'k1', 'n'];\n",
  } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, []);
});

test('Schlüsselfläche: weicht die importierte Menge von der Typedef ab, wird jeder abweichende Schlüssel gemeldet', async () => {
  const root = fixture({ foo: {
    'foo.js': importedKeysVm('./foo-keys.js'),
    'foo-model.js': KEYED_MODEL,
    'foo-keys.js': "export const PARAM_KEYS = ['name', 'k1', 'extra'];\n",
  } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['key_set_mismatch:setParam:extra', 'key_set_mismatch:setParam:n']);
});

test('Schlüsselfläche: ein Import aus einem Paket ist nicht auflösbar — die Menge bleibt ungeprüft', async () => {
  const root = fixture({ foo: {
    'foo.js': importedKeysVm('some-package'),
    'foo-model.js': KEYED_MODEL,
  } });
  const { modules } = await collectAgentData(root);
  assert.ok(modules.foo.reported.includes('unverified_key_set:setParam'), modules.foo.reported.join(', '));
});

test('Schlüsselfläche: ein Wertebereich, der nicht zur Prüfung passt, ist ein Verstoß', async () => {
  const { foo } = await keyedModules({ typedef: ` * @typedef {object} Params
 * @property {string} name der Name
 * @property {'0.2'|'0.1'} k1 der Anteil
 * @property {string} n die Anzahl` });
  assert.deepEqual(foo.reported, ['key_value_mismatch:setParam:k1', 'key_value_mismatch:setParam:n']);
});

test('Schlüsselfläche: eine eigene Prüffunktion ist ein blinder Fleck, kein Verstoß', async () => {
  const { foo } = await keyedModules({ checks: `{
  name: (v) => requireText('value', v),
  k1: (v) => requireEnum('value', v, K1_OPTIONS),
  n: (v) => customCheck(v),
}` });
  assert.deepEqual(foo.reported, []);
});

test('Schlüsselfläche: requireBoolean passt zu boolean und nicht zu string', async () => {
  const td = t => ` * @typedef {object} Params
 * @property {string} name der Name
 * @property {'0.2'|'0.15'} k1 der Anteil
 * @property {${t}} n der Schalter`;
  const checks = `{
  name: (v) => requireText('value', v),
  k1: (v) => requireEnum('value', v, K1_OPTIONS),
  n: (v) => requireBoolean('value', v),
}`;
  assert.deepEqual((await keyedModules({ typedef: td('boolean'), checks })).foo.reported, []);
  assert.deepEqual((await keyedModules({ typedef: td('string'), checks })).foo.reported, ['key_value_mismatch:setParam:n']);
});

test('Schlüsselfläche: requireNumericText passt zu string und nicht zu number', async () => {
  const td = t => ` * @typedef {object} Params
 * @property {string} name der Name
 * @property {'0.2'|'0.15'} k1 der Anteil
 * @property {${t}} n die Eingabe`;
  const checks = `{
  name: (v) => requireText('value', v),
  k1: (v) => requireEnum('value', v, K1_OPTIONS),
  n: (v) => requireNumericText('value', v),
}`;
  assert.deepEqual((await keyedModules({ typedef: td('string'), checks })).foo.reported, []);
  assert.deepEqual((await keyedModules({ typedef: td('number'), checks })).foo.reported, ['key_value_mismatch:setParam:n']);
});

test('Schlüsselfläche: die Typedef wird auch gefunden, wenn vor derselben Anweisung noch ein JSDoc-Block folgt', async () => {
  const vm = keyedVm().replace('const PARAM_KEYS =', `/**
 * @typedef {object} Params2
 * @property {string} name der Name des Merkmals
 * @property {'0.2'|'0.15'} k1 der Anteil der Toleranz
 * @property {number} n die Anzahl
 */

/** Die Schlüssel. */
const PARAM_KEYS =`).replace('{keyof Params}', '{keyof Params2}');
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': KEYED_MODEL } });
  const { modules } = await collectAgentData(root);
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

async function resultModules() {
  return (await collectAgentData(fixture({ foo: { 'foo.js': RESULT_VM } }))).modules;
}

test('Ausgaben: ein Feld vom Typ einer Typedef trägt keys und keysOf, verschachtelt', async () => {
  const { foo } = await resultModules();
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

test('Ausgaben: ein Typname ohne Typedef in der Moduldatei bleibt ohne keys und ohne Befund', async () => {
  const { foo } = await resultModules();
  assert.equal('keys' in foo.fields.things, false);
  assert.equal('keys' in foo.fields.name, false);
  assert.deepEqual(foo.reported, []);
});

test('Ausgaben: die Schlüsselfläche eines generischen Setters nennt ihre Typedef (keysOf)', async () => {
  const { foo } = await keyedModules();
  assert.equal(foo.actions.setParam.keysOf, 'Params');
});

test('Ausgaben: eine eckig geklammerte Property ist optional, die anderen tragen kein optional', async () => {
  const vm = RESULT_VM.replace(
    ' * @property {number|null} Cg die Fähigkeit',
    ' * @property {number|null} Cg die Fähigkeit\n * @property {number} [Cgk] nur bei zweiseitiger Toleranz',
  );
  const { modules } = await collectAgentData(fixture({ foo: { 'foo.js': vm } }));
  const keys = modules.foo.fields.result.keys;
  assert.deepEqual(keys.Cgk, { type: 'number', help: 'nur bei zweiseitiger Toleranz', optional: true });
  assert.equal('optional' in keys.Cg, false);
});

test('Ausgaben: eine Map Object<string, T> trägt keys und keysOf ihrer Werttypedef', async () => {
  const vm = RESULT_VM.replace(
    ' * @property {Detail[]} details die Einzelwerte',
    ' * @property {Detail[]} details die Einzelwerte\n'
    + ' * @property {Object<string, Detail>} byName je Name ein Einzelwert\n'
    + ' * @property {Object<string, Detail>|null} [byOther] je Name, manchmal leer\n'
    + ' * @property {Object<string, number>} means je Name der Mittelwert',
  );
  const { modules } = await collectAgentData(fixture({ foo: { 'foo.js': vm } }));
  const keys = modules.foo.fields.result.keys;
  assert.equal(keys.byName.type, 'Object<string, Detail>');
  assert.equal(keys.byName.keysOf, 'Detail');
  assert.deepEqual(Object.keys(keys.byName.keys), ['value']);
  assert.equal(keys.byOther.keysOf, 'Detail');
  assert.equal(keys.byOther.optional, true);
  assert.equal('keys' in keys.means, false, 'eine Map über einen Grundtyp bleibt ohne keys');
  assert.deepEqual(modules.foo.reported, []);
});

test('Ausgaben: eine Typedef, die sich selbst enthält, bricht die Auflösung nicht', async () => {
  const vm = RESULT_VM.replace(' * @property {number|null} p der p-Wert', ' * @property {number|null} p der p-Wert\n * @property {BiasTest} again zyklisch');
  const { modules } = await collectAgentData(fixture({ foo: { 'foo.js': vm } }));
  const again = modules.foo.fields.result.keys.biasTest.keys.again;
  assert.equal(again.type, 'BiasTest');
  assert.equal('keys' in again, false, 'eine zweite Ebene derselben Typedef wird nicht aufgelöst');
});

test('Ausgaben: eine Typedef als import()-Alias wird in der Quelldatei aufgelöst, auch verschachtelt', async () => {
  const vm = RESULT_VM
    .replace(/\/\*\*\n \* @typedef \{object\} BiasTest[\s\S]*?@property \{Detail\[\]\} details die Einzelwerte\n \*\/\n/,
      "/** @typedef {import('./present.js').Result} Result */\n");
  const present = `/** @typedef {import('./numbers.js').BiasTest} BiasTest */

/**
 * @typedef {object} Result
 * @property {number|null} Cg die Fähigkeit
 * @property {BiasTest} biasTest der Test
 */
export {};`;
  const numbers = `/**
 * @typedef {object} BiasTest
 * @property {number|null} p der p-Wert
 */
export {};`;
  const { modules } = await collectAgentData(fixture({ foo: { 'foo.js': vm, 'present.js': present, 'numbers.js': numbers } }));
  const result = modules.foo.fields.result;
  assert.equal(result.keysOf, 'Result');
  assert.deepEqual(Object.keys(result.keys), ['Cg', 'biasTest']);
  assert.equal(result.keys.biasTest.keysOf, 'BiasTest');
  assert.deepEqual(result.keys.biasTest.keys, { p: { type: 'number|null', help: 'der p-Wert' } });
  assert.deepEqual(modules.foo.reported, []);
});

test('Ausgaben: ein Alias-Zyklus über zwei Dateien bricht die Auflösung nicht', async () => {
  const vm = RESULT_VM
    .replace(/\/\*\*\n \* @typedef \{object\} Result[\s\S]*?@property \{Detail\[\]\} details die Einzelwerte\n \*\/\n/,
      "/** @typedef {import('./a.js').Result} Result */\n");
  const a = "/** @typedef {import('./b.js').Result} Result */\nexport {};";
  const b = "/** @typedef {import('./a.js').Result} Result */\nexport {};";
  const { modules } = await collectAgentData(fixture({ foo: { 'foo.js': vm, 'a.js': a, 'b.js': b } }));
  assert.equal('keys' in modules.foo.fields.result, false, 'ein Zyklus löst keine Schlüssel auf');
});

test('Ausgaben: ein Selbst-Alias bricht die Auflösung nicht', async () => {
  const vm = RESULT_VM
    .replace(/\/\*\*\n \* @typedef \{object\} Result[\s\S]*?@property \{Detail\[\]\} details die Einzelwerte\n \*\/\n/,
      "/** @typedef {import('./a.js').Result} Result */\n");
  const a = "/** @typedef {import('./a.js').Result} Result */\nexport {};";
  const { modules } = await collectAgentData(fixture({ foo: { 'foo.js': vm, 'a.js': a } }));
  assert.equal('keys' in modules.foo.fields.result, false, 'ein Selbst-Alias löst keine Schlüssel auf');
});

test('Ausgaben: eine Alias-Kette gleichen Namens über zwei Dateien ist kein Zyklus', async () => {
  const vm = RESULT_VM
    .replace(/\/\*\*\n \* @typedef \{object\} Result[\s\S]*?@property \{Detail\[\]\} details die Einzelwerte\n \*\/\n/,
      "/** @typedef {import('./a.js').Result} Result */\n");
  const a = "/** @typedef {import('./b.js').Result} Result */\nexport {};";
  const b = `/**
 * @typedef {object} Result
 * @property {number} n die Zahl
 */
export {};`;
  const { modules } = await collectAgentData(fixture({ foo: { 'foo.js': vm, 'a.js': a, 'b.js': b } }));
  const result = modules.foo.fields.result;
  assert.equal(result.keysOf, 'Result');
  assert.deepEqual(result.keys, { n: { type: 'number', help: 'die Zahl' } });
});

/* Ein umgestelltes Modul: das Domänenmodell wird geladen (es importiert
   core/model.js über die file://-URL der echten Datei — ein Temp-Verzeichnis
   löst keinen relativen Kernpfad auf), das Viewmodel statisch gelesen. */
const CORE_MODEL_URL = pathToFileURL(join(import.meta.dirname, '..', '..', 'js', 'core', 'model.js')).href;
const MODEL_WITH_COMMAND = `import { defineModel, command, text, number, boolean } from '${CORE_MODEL_URL}';
export const State = defineModel({
  fields: { title: text() },
  view: { zoom: number({ default: 1 }) },
  commands: {
    rename: command({ params: { title: text() }, returns: boolean(), run({ title }) { this.title = title; return true; } }),
  },
});
`;
const VM_WITH_COMPUTED = `import { createModule, command, asyncTask } from '../../core/template-module.js';
import { State } from '../domain/model.js';
export default createModule({
  Model: State,
  commands: {
    reset: command({ params: {}, run() {} }),
    pick: command({ params: { id: true }, run() {} }),
  },
  asyncTasks: {
    compute: asyncTask({ params: { n: true }, run() {} }),
    warm: asyncTask({ auto: true, run() {} }),
  },
  view: () => ({ computed: { total() { return 1; }, rows() { return []; } } }),
});
`;

test('umgestelltes Modul: Kommandos, computed und Tasks im Eintrag', async () => {
  const root = fixture({}, {
    'js/modules/demo/module.js': "export default { id: 'demo', load: () => null };",
    'js/modules/demo/domain/model.js': MODEL_WITH_COMMAND,
    'js/modules/demo/viewmodel/viewmodel.js': VM_WITH_COMPUTED,
  });
  const { modules, writtenFields } = await collectAgentData(root, { converted: ['demo'] });
  const e = modules.demo;
  assert.deepEqual(Object.keys(e.actions).sort(), ['compute', 'compute.cancel', 'pick', 'read', 'rename', 'reset']);
  assert.deepEqual([e.tagged, e.available, e.schema, e.violations, e.reported], [true, true, true, [], []]);
  assert.equal(e.fields.total, undefined, 'ein computed ist kein Lesefeld');
  assert.equal(e.fields.rows, undefined);
  assert.notEqual(e.fields.title.derived, true);
  assert.equal(e.fields.title.type, 'string');
  assert.deepEqual(e.viewFields, ['zoom']);
  assert.deepEqual(e.actions.rename.keys, { title: { type: 'string', help: '' } });
  assert.equal(e.actions.rename.target, 'model');
  assert.deepEqual(e.actions.pick.keys, { id: { type: 'unknown', help: '' } });
  assert.equal(e.actions.pick.target, 'viewmodel');
  assert.deepEqual(e.actions.compute.keys, { n: { type: 'unknown', help: '' } });
  assert.deepEqual(e.asyncTasks.map((t) => [t.name, t.auto]), [['compute', false], ['warm', true]]);
  assert.deepEqual(writtenFields.demo, []);
});

test('typedefKeys: Vereinigung nennt die Schlüssel aller Glieder, optional wo nicht überall', async () => {
  const types = `/**
 * @typedef {object} Ok
 * @property {'ok'} status der Zustand
 * @property {number} p der p-Wert
 */
/**
 * @typedef {object} No
 * @property {'insufficient'} status der Zustand
 * @property {string} reason der Grund
 */
/** @typedef {Ok|No} Both */
export {};
`;
  const model = MODEL_WITH_COMMAND.replace('export const State = defineModel({',
    "export const State = defineModel({\n  derived: {\n    /** @returns {import('./a.js').Both} */\n    total() { return 1; },\n    rows() { return []; },\n  },\n  derivedBulk: ['rows'],")
  const root = fixture({}, {
    'js/modules/demo/module.js': "export default { id: 'demo', load: () => null };",
    'js/modules/demo/domain/model.js': model,
    'js/modules/demo/viewmodel/viewmodel.js': VM_WITH_COMPUTED,
    'js/modules/demo/domain/a.js': types,
  });
  const { modules } = await collectAgentData(root, { converted: ['demo'] });
  const total = modules.demo.fields.total;
  assert.equal(total.derived, true);
  assert.equal(total.keysOf, 'Both');
  assert.equal(total.keys.status.optional, undefined);
  assert.equal(total.keys.status.type, "'ok'|'insufficient'");
  assert.equal(total.keys.p.optional, true);
  assert.equal(total.keys.reason.optional, true);
  assert.equal(modules.demo.fields.rows.keys, undefined);
});

const MODEL_WITH_DERIVED = `import { defineModel, number } from '${CORE_MODEL_URL}';
/**
 * @typedef {object} Foo
 * @property {number} mean der Mittelwert
 * @property {Bar} spread die Streuung
 */
/**
 * @typedef {object} Bar
 * @property {number|null} sd die Standardabweichung
 */
export const State = defineModel({
  fields: { n: number({ default: 1 }) },
  derived: {
    /** @returns {Foo} die Kennzahlen */
    stats() { return { mean: this.n, spread: { sd: null } }; },
    rows() { return []; },
  },
  derivedBulk: ['rows'],
});
`;

test('readDerivedReturns: die @returns-Typen der Methoden unter derived', () => {
  assert.deepEqual([...readDerivedReturns(MODEL_WITH_DERIVED)], [['stats', 'Foo']]);
  assert.deepEqual([...readDerivedReturns('export const S = defineModel({ fields: {} });')], []);
});

test('umgestelltes Modul: derived aus dem Model mit Schlüsselbaum aus seiner Typedef', async () => {
  const root = fixture({}, {
    'js/modules/demo/module.js': "export default { id: 'demo', load: () => null };",
    'js/modules/demo/domain/model.js': MODEL_WITH_DERIVED,
    'js/modules/demo/viewmodel/viewmodel.js': VM_WITH_COMPUTED,
  });
  const { modules } = await collectAgentData(root, { converted: ['demo'] });
  const { stats, rows, total } = modules.demo.fields;
  assert.equal(stats.derived, true);
  assert.equal(stats.keysOf, 'Foo');
  assert.deepEqual(Object.keys(stats.keys), ['mean', 'spread']);
  assert.deepEqual(stats.keys.mean, { type: 'number', help: 'der Mittelwert' });
  assert.equal(stats.keys.spread.keysOf, 'Bar');
  assert.deepEqual(stats.keys.spread.keys, { sd: { type: 'number|null', help: 'die Standardabweichung' } });
  assert.deepEqual([rows.bulk, rows.bulkKind, rows.derived], [true, 'table', true]);
  assert.equal(total, undefined, 'ein computed ist kein Lesefeld');
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

test('Ausgaben: ein Model-Feld vom Typ einer Typedef der Model-Datei trägt keys und keysOf', async () => {
  const { modules } = await collectAgentData(fixture({ foo: { 'foo.js': CLEAN_VM, 'foo-model.js': RECORD_MODEL } }));
  const entries = modules.foo.fields.entries;
  assert.equal(entries.type, 'Entry[]');
  assert.equal(entries.bulk, true);
  assert.equal(entries.keysOf, 'Entry');
  assert.deepEqual(Object.keys(entries.keys), ['id', 'notes']);
  assert.deepEqual(entries.keys.id, { type: 'string', help: 'die Kennung' });
  assert.equal(entries.keys.notes.keysOf, 'Note');
  assert.deepEqual(Object.keys(entries.keys.notes.keys), ['text']);
});

test('Ausgaben: ein Model-Feld ohne passende Typedef bleibt ohne keys', async () => {
  const { modules } = await collectAgentData(fixture({ foo: { 'foo.js': CLEAN_VM, 'foo-model.js': RECORD_MODEL } }));
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

test('Teil-Viewmodel: Methoden werden zu Aktionen <teil>.<methode>; eingebaute Klassen und Fabriken bleiben Daten', async () => {
  const { modules } = await collectAgentData(subVmFixture(DRAFT_VM));
  assert.deepEqual(modules.foo.violations, []);
  assert.equal(modules.foo.available, true);
  assert.deepEqual(Object.keys(modules.foo.actions).sort(), ['draft.setProblem', 'read']);
  assert.deepEqual(modules.foo.actions['draft.setProblem'].params,
    [{ name: 'text', type: 'string', optional: false, help: 'the problem statement' }]);
});

test('Teil-Viewmodel: Befunde tragen das Präfix und die Datei der Klasse', async () => {
  const body = DRAFT_VM
    .replace('/** @noagent presentation */\n  problemClass', 'problemClass')
    .replace('   * @param {string} text the problem statement\n', '');
  const { modules } = await collectAgentData(subVmFixture(body));
  assert.deepEqual([...modules.foo.violations].sort(), [
    `missing_param:draft.setProblem.text${FROM_DRAFT}`,
    `unmarked_method:draft.problemClass${FROM_DRAFT}`,
  ]);
});

test('Teil-Viewmodel: eine Wurzelbindung x-model="model.…" zählt als abgedeckt, wenn eine @agent-Methode des Teils sie schreibt', async () => {
  const { modules } = await collectAgentData(subVmFixture(DRAFT_VM, { html: '<input x-model="model.problem">' }));
  assert.ok(!modules.foo.reported.includes('unreachable_write:problem'), modules.foo.reported.join(', '));
});

test('Teil-Viewmodel: importiert, aber keine auflösbare Klasse → unresolved_sub_viewmodel', async () => {
  const { modules } = await collectAgentData(subVmFixture(DRAFT_VM, {
    imports: "import { GhostViewModel } from './viewmodel/ghost.js';",
    members: 'ghost: new GhostViewModel(),',
  }));
  assert.ok(modules.foo.reported.includes('unresolved_sub_viewmodel:ghost'), modules.foo.reported.join(', '));
  assert.equal(modules.foo.available, false);
});

test('Teil-Viewmodel: eine Klasse mit extends → unresolved_sub_viewmodel', async () => {
  const { modules } = await collectAgentData(subVmFixture(DRAFT_VM, {
    imports: "import { ChildViewModel } from './viewmodel/child.js';",
    members: 'child: new ChildViewModel(),',
    extra: { 'js/modules/foo/viewmodel/child.js': 'export class BaseViewModel {}\nexport class ChildViewModel extends BaseViewModel {}' },
  }));
  assert.ok(modules.foo.reported.includes('unresolved_sub_viewmodel:child'), modules.foo.reported.join(', '));
});

test('Teil-Viewmodel: ein Teil-Viewmodel im Teil-Viewmodel → nested_sub_viewmodel; eingebaute Klassen und _-Felder nicht', async () => {
  const body = DRAFT_VM
    .replace('export class DraftViewModel', "import { InnerViewModel } from './inner.js';\nexport class DraftViewModel")
    .replace('    this.model = null;\n', '    this.model = null;\n    this.inner = new InnerViewModel();\n    this.seen = new Set();\n    this._cache = new InnerViewModel();\n');
  const { modules } = await collectAgentData(subVmFixture(body, {
    extra: { 'js/modules/foo/viewmodel/inner.js': 'export class InnerViewModel {}' },
  }));
  assert.deepEqual(modules.foo.reported.filter(c => c.startsWith('nested_sub_viewmodel:')), ['nested_sub_viewmodel:draft.inner']);
});

test('Teil-Viewmodel: eine Vorlagenbindung an <teil>.model.… ist ein Befund', async () => {
  const { modules } = await collectAgentData(subVmFixture(DRAFT_VM, {
    html: '<input :value="draft.model.problem" @input="draft.setProblem($event.target.value)">',
  }));
  assert.ok(modules.foo.reported.includes('sub_viewmodel_model_binding:draft.model.problem'), modules.foo.reported.join(', '));
});

test('Teil-Viewmodel: eine Methode help oder params kollidiert mit dem Hilfeschlüssel', async () => {
  const body = DRAFT_VM.replace('/** @noagent presentation */\n  problemClass() { return {}; }', '/** @noagent */\n  help() { return {}; }');
  const { modules } = await collectAgentData(subVmFixture(body));
  assert.ok(modules.foo.reported.includes(`sub_viewmodel_key_collision:draft.help${FROM_DRAFT}`), modules.foo.reported.join(', '));
  assert.ok(!('draft.help' in modules.foo.actions));
});

test('Teil-Viewmodel: keyof-Typedef und Prüfmenge stehen in der Datei der Klasse', async () => {
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
  const { modules } = await collectAgentData(subVmFixture(body));
  assert.deepEqual(modules.foo.violations, []);
  const action = modules.foo.actions['draft.setField'];
  assert.equal(action.keysOf, 'Fields');
  assert.deepEqual(Object.keys(action.keys), ['title', 'hint']);
  assert.equal(action.params[0].type, "'title'|'hint'");
});

test('Teil-Viewmodel: ein DOM-Umweg in der Datei der Klasse trägt den Pfad', async () => {
  const body = DRAFT_VM.replace('_helper() {}', '_helper(el) { el.innerHTML = this._t("x"); }');
  const { modules } = await collectAgentData(subVmFixture(body));
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

test('declared_not_returned: erklärter Schlüssel fehlt im read()-Rückgabewert', async () => {
  const root = fixture({ foo: { 'foo.js': DECLARED_VM(`return readAgentState('foo', { ...this.model.toJSON() }, options);`), 'foo-model.js': DECL_MODEL } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['declared_not_returned:count']);
  assert.equal(modules.foo.available, false);
});

test('declared_not_returned: vollständig gelieferte Lesefläche ist befundfrei', async () => {
  const root = fixture({ foo: { 'foo.js': DECLARED_VM(`return readAgentState('foo', { ...this.model.toJSON(), count: 1 }, options);`), 'foo-model.js': DECL_MODEL } });
  const { modules } = await collectAgentData(root);
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

test('missing_bulk_columns: zwei Tabellenfelder, nur eines mit Schwesterfeld', async () => {
  const root = fixture({ foo: { 'foo.js': TWO_TABLES_VM(`return readAgentState('foo', { ...this.model.toJSON(), aColumns: [{ name: 'x' }] }, options);`), 'foo-model.js': TWO_TABLES_MODEL } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['missing_bulk_columns:b']);
});

test('missing_bulk_columns: ein einziges Tabellenfeld braucht kein Schwesterfeld', async () => {
  const root = fixture({ foo: { 'foo.js': TWO_TABLES_VM(`return readAgentState('foo', { a: [], b: [] }, options);`).replace(/ \* @property \{Array<\{y: number\}>\} b .*\n/, ''), 'foo-model.js': TWO_TABLES_MODEL.replace(/ {2}\/\*\* @type \{Array<\{y: number\}>\}.*\n {2}b = \[\];\n/, '').replace(', b: this.b', '') } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, []);
});

test('missing_bulk_columns: table()-Felder (TableData) brauchen kein Schwesterfeld', async () => {
  const vm = TWO_TABLES_VM(`return readAgentState('foo', { a: [], b: [] }, options);`)
    .replace('{Array<{x: number}>} a', '{TableData} a').replace('{Array<{y: number}>} b', '{TableData} b');
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': TWO_TABLES_MODEL } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, []);
});

test('unresolved_read_return: nicht auflösbarer read()-Rückgabewert ist eine gemeldete Blindstelle', async () => {
  const root = fixture({ foo: { 'foo.js': DECLARED_VM(`return readAgentState('foo', build(), options);`), 'foo-model.js': DECL_MODEL } });
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unresolved_read_return']);
});

test('collectAgentData: eine anlegende @agent-Aktion mit @returns {void} ist ein Befund', async () => {
  const vm = TAGGED_VM.replace(
    '       * @returns {boolean} whether it was accepted\n',
    '       * @returns {void}\n',
  ).replace('setProblem(text)', 'addProblem(text)');
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
  const { modules } = await collectAgentData(root);
  assert.ok(modules.foo.violations.includes('void_creating_action:addProblem'));
});

test('collectAgentData: address/adder zählen nicht als anlegend', async () => {
  const vm = TAGGED_VM.replace(
    '       * @returns {boolean} whether it was accepted\n',
    '       * @returns {void}\n',
  ).replace('setProblem(text)', 'address(text)');
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
  assert.ok(!(await collectAgentData(root)).modules.foo.violations.some((v) => v.startsWith('void_creating_action')));
});

test('Teil-Viewmodel: eine anlegende Aktion mit @returns {void} ist ein Befund mit Teil-Präfix', async () => {
  const body = DRAFT_VM.replace('setProblem(text)', 'addProblem(text)');
  const { modules } = await collectAgentData(subVmFixture(body));
  assert.ok(modules.foo.violations.includes('void_creating_action:draft.addProblem'), modules.foo.violations.join(', '));
});

test('collectAgentData: eine @agent-Aktion delete… ist ein Befund — das Verb heißt remove…', async () => {
  const vm = TAGGED_VM.replace('setProblem(text)', 'deleteProblem(text)');
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
  assert.ok((await collectAgentData(root)).modules.foo.violations.includes('delete_verb_action:deleteProblem'));
});

test('Teil-Viewmodel: eine Aktion delete… ist ein Befund mit Teil-Präfix', async () => {
  const body = DRAFT_VM.replace('setProblem(text)', 'deleteProblem(text)');
  const { modules } = await collectAgentData(subVmFixture(body));
  assert.ok(modules.foo.violations.includes('delete_verb_action:draft.deleteProblem'), modules.foo.violations.join(', '));
});

test('collectAgentData: deletedCount ist kein Löschverb', async () => {
  const vm = TAGGED_VM.replace('setProblem(text)', 'deletedCount(text)');
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
  assert.ok(!(await collectAgentData(root)).modules.foo.violations.some((v) => v.startsWith('delete_verb_action')));
});

test('void_creating_action: Promise<void>, undefined und Promise<undefined> zählen als nichts geliefert', async () => {
  for (const ret of ['Promise<void>', 'undefined', 'Promise<undefined>']) {
    const vm = TAGGED_VM
      .replace('       * @returns {boolean} whether it was accepted\n', `       * @returns {${ret}}\n`)
      .replace('setProblem(text)', 'createProblem(text)');
    const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
    assert.ok((await collectAgentData(root)).modules.foo.violations.includes('void_creating_action:createProblem'), ret);
  }
});

test('void_creating_action: eine Ausnahme aus CREATING_VOID_EXEMPT bleibt befundfrei', async () => {
  const vm = TAGGED_VM
    .replace('       * @returns {boolean} whether it was accepted\n', '       * @returns {void}\n')
    .replace("config: { id: 'foo' }", "config: { id: 'attribute-test' }")
    .replace('setProblem(text)', 'addRow(text)');
  const root = fixture({ 'attribute-test': { 'attribute-test.js': vm, 'foo-model.js': MODEL } });
  const entry = (await collectAgentData(root)).modules['attribute-test'];
  assert.ok(!entry.violations.some((v) => v.startsWith('void_creating_action')), entry.violations.join(', '));
});

test('void_creating_action: jede Ausnahme trifft im echten Baum noch eine void-Anlegeaktion', async () => {
  const appDir = join(import.meta.dirname, '..', '..');
  const { modules } = await collectAgentData(appDir);
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

test('module_state_option_source: eine Wertemenge aus einem veränderlichen Modul-let ist ein Befund', async () => {
  const root = fixture({ foo: { 'foo.js': vmWithKnownIdCheck('let _ids = [];', '_ids'), 'foo-model.js': MODEL } });
  assert.ok((await collectAgentData(root)).modules.foo.violations.includes('module_state_option_source:setProblem:text'));
});

test('module_state_option_source: auch über Methodenkette und lokalen Alias auf das let', async () => {
  const vm = vmWithKnownIdCheck('let _ids = [];', 'ids').replace('requireKnownId(\'text\'', "const ids = _ids.map(x => x.id);\n requireKnownId('text'");
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
  assert.ok((await collectAgentData(root)).modules.foo.violations.includes('module_state_option_source:setProblem:text'));
});

test('module_state_option_source: eine Modul-const bleibt befundfrei', async () => {
  const root = fixture({ foo: { 'foo.js': vmWithKnownIdCheck("const IDS = ['a', 'b'];", 'IDS'), 'foo-model.js': MODEL } });
  assert.ok(!(await collectAgentData(root)).modules.foo.violations.some((v) => v.startsWith('module_state_option_source')));
});

test('module_state_option_source: Parameter gleichen Namens wie ein Modul-let wird nicht gemeldet', async () => {
  const vm = vmWithKnownIdCheck('let ids = [];', 'ids').replace('setProblem(text)', 'setProblem(text, ids)');
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
  assert.ok(!(await collectAgentData(root)).modules.foo.violations.some((v) => v.startsWith('module_state_option_source')));
});

test('module_state_option_source: ein lokales let gleichen Namens wie ein Modul-let wird nicht gemeldet', async () => {
  const vm = vmWithKnownIdCheck('let ids = [];', 'ids').replace("requireKnownId('text'", "{ const { ids } = this.model; }\n let ids2 = 1; if (text) { var ids = ['a']; }\n requireKnownId('text'");
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } });
  assert.ok(!(await collectAgentData(root)).modules.foo.violations.some((v) => v.startsWith('module_state_option_source')));
});

test('module_state_option_source: das let einer Mixin-Datei wird dem Mixin-Mitglied zugerechnet', async () => {
  const mixin = `let _ids = [];\n` + MIXIN.replace('renameStep(name) { return true; }', "renameStep(name) { requireKnownId('name', name, _ids); return true; }");
  const root = fixture(
    { foo: { 'foo.js': vmWith('...mixConst,'), 'foo-model.js': MODEL } },
    { 'js/ui/mix.js': mixin },
  );
  assert.ok((await collectAgentData(root)).modules.foo.violations.some((v) => v.startsWith('module_state_option_source:renameStep:name')));
});

test('module_state_option_source: ein gleichnamiges let der Moduldatei wird dem Mixin nicht zugerechnet', async () => {
  const mixin = MIXIN.replace('renameStep(name) { return true; }', "renameStep(name) { requireKnownId('name', name, _ids); return true; }");
  const vm = vmWith('...mixConst,').replace('export default', 'let _ids = [];\nexport default');
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': MODEL } }, { 'js/ui/mix.js': mixin });
  assert.ok(!(await collectAgentData(root)).modules.foo.violations.some((v) => v.startsWith('module_state_option_source')));
});

test('module_state_option_source: statische Wrapper Object.keys/Array.from/Object.values werden aufgelöst', async () => {
  for (const source of ['Object.keys(_ids)', 'Array.from(_ids)', 'Object.values(_ids)']) {
    const root = fixture({ foo: { 'foo.js': vmWithKnownIdCheck('let _ids = [];', source), 'foo-model.js': MODEL } });
    assert.ok((await collectAgentData(root)).modules.foo.violations.includes('module_state_option_source:setProblem:text'), source);
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

async function reportedFor(html, vm = setterVm(), model = PROBLEM_MODEL) {
  const root = fixture({ foo: { 'foo.js': vm, 'foo-model.js': model, 'foo.html': html } });
  return (await collectAgentData(root)).modules.foo.reported;
}

test('setter_bypass_binding: x-model auf einem select umgeht den Setter', async () => {
  assert.deepEqual(await reportedFor('<select x-model="model.problem"></select>'), ['setter_bypass_binding:problem']);
});

test('setter_bypass_binding: Textfelder sind ausgenommen', async () => {
  assert.deepEqual(await reportedFor('<input type="text" x-model="model.problem">'), []);
  assert.deepEqual(await reportedFor('<input x-model="model.problem">'), []);
  assert.deepEqual(await reportedFor('<textarea x-model="model.problem"></textarea>'), []);
});

test('setter_bypass_binding: > in Alpine-Ausdrücken und Pfeilfunktionen verfehlt das Element nicht', async () => {
  const html = '<input type="checkbox" x-show="a > b" @click="items.forEach(i => i.on = true)" x-model="model.problem">';
  assert.deepEqual(await reportedFor(html), ['setter_bypass_binding:problem']);
  // Ein vorangehendes Element mit > im Ausdruck darf den Typ nicht verschleppen.
  const html2 = '<input type="checkbox" x-show="a > b"><input x-model="model.problem">';
  assert.deepEqual(await reportedFor(html2), []);
});

const NUMBER_VM = TAGGED_VM;
test('hardcoded_param_bounds: festes min/max neben onParamInput ist ein Befund', async () => {
  const root = async (html) => (await collectAgentData(fixture({ foo: {
    'foo.js': NUMBER_VM,
    'foo-model.js': PROBLEM_MODEL,
    'foo.html': html,
  } }))).modules.foo.reported;
  assert.deepEqual(await root('<input type="number" min="0" max="5" @change="onParamInput(\'k\', $event)">'), ['hardcoded_param_bounds:k']);
  assert.deepEqual(await root('<input type="number" :min="paramMin(\'k\')" :max="paramMax(\'k\')" @change="onParamInput(\'k\', $event)">'), []);
  assert.deepEqual(await root('<input type="number" x-show="a > b" min="0" @change="onParamInput(\'k\', $event)">'), ['hardcoded_param_bounds:k']);
});

test('hardcoded_param_bounds: dokumentierte Grenze — eigener Handler mit festem min/max wird NICHT gemeldet', async () => {
  const reported = (await collectAgentData(fixture({ foo: {
    'foo.js': TAGGED_VM,
    'foo-model.js': PROBLEM_MODEL,
    'foo.html': '<input type="number" min="1" max="10" @change="fooChanged($event)"><input type="number" :min="0" max="3" @change="setX(1)">',
  } }))).modules.foo.reported;
  assert.deepEqual(reported, []);
});

test('setter_bypass_binding: type= wird ohne Beachtung der Schreibweise gelesen, gebundenes :type zählt als Text', async () => {
  assert.deepEqual(await reportedFor('<input type="CHECKBOX" x-model="model.problem">'), ['setter_bypass_binding:problem']);
  assert.deepEqual(await reportedFor('<input :type="kind" x-model="model.problem">'), []);
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
async function writeGateRun({ vm, fields, methods = '', html, baseline }) {
  const files = {
    'foo.js': vm,
    'foo-model.js': `export class State {
  ${fields.join('\n  ')}
  ${methods}
  toJSON() { return { ${fields.map(f => /^\S+ (\S+) =|\n\s*([\w$]+) =/.exec(f)[2]).map(n => `${n}: this.${n}`).join(', ')} }; }
}`,
  };
  if (html) files['foo.html'] = html;
  const result = await collectAgentData(fixture({ foo: files }), baseline ? { baseline } : undefined);
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

test('Schreibweg: push aus einem Parameter deckt die Sammlung ab', async () => {
  const { written, reported } = await writeGateRun({
    vm: writeGateVm(agentMethod('pushItem(text)', 'this.model.items.push({ text });')),
    fields: [writeGateField('items', 'Array<object>')],
  });
  assert.deepEqual(written, ['items']);
  assert.deepEqual(reported, []);
});

test('Schreibweg: unshift und splice mit eingefügtem Wert decken ab, reines Entfernen nicht', async () => {
  const run = async (body) => (await writeGateRun({
    vm: writeGateVm(agentMethod('change(v)', body)),
    fields: [writeGateField('items', 'Array<object>')],
  })).written;
  assert.deepEqual(await run('this.model.items.unshift(v);'), ['items']);
  assert.deepEqual(await run('this.model.items.splice(0, 0, v);'), ['items']);
  assert.deepEqual(await run('this.model.items.splice(v, 1);'), []);
});

test('Schreibweg: ein konstanter push-Wert oder eine unbekannte Sammelmethode deckt NICHT ab', async () => {
  const run = async (signature, body) => await writeGateRun({
    vm: writeGateVm(agentMethod(signature, body)),
    fields: [writeGateField('items', 'Array<object>')],
  });
  const constant = await run('pushItem()', 'this.model.items.push({ text: "" });');
  assert.deepEqual(constant.reported, ['unreachable_write:items']);
  assert.deepEqual((await run('touch(v)', 'this.model.items.includes(v);')).reported, ['unreachable_write:items']);
});

test('Schreibweg: Elementzuweisung aus einem Parameter deckt die Sammlung ab', async () => {
  const run = async (body) => (await writeGateRun({
    vm: writeGateVm(agentMethod('setAt(i, v)', body)),
    fields: [writeGateField('items', 'Array<object>')],
  })).written;
  assert.deepEqual(await run('this.model.items[i] = v;'), ['items']);
  assert.deepEqual(await run('this.model.items[i + 1] = v;'), ['items']);
  assert.deepEqual(await run('this.model.items[i] = 1;'), []);
});

test('Schreibweg: ein Alias aus find deckt Sammlung und Elementfeld ab', async () => {
  const { written, reported } = await writeGateRun({
    vm: writeGateVm(agentMethod('setTitle(id, title)', 'const s = this.model.steps.find(x => x.id === id); s.title = title;')),
    fields: [writeGateField('steps', 'Array<object>')],
  });
  assert.deepEqual(written, ['steps', 'steps.title']);
  assert.deepEqual(reported, []);
});

test('Schreibweg: die weiteren Aliasformen filter()[0], [i] und die Sammlung selbst', async () => {
  const run = async (body) => (await writeGateRun({
    vm: writeGateVm(agentMethod('setTitle(i, title)', body)),
    fields: [writeGateField('steps', 'Array<object>')],
  })).written;
  assert.deepEqual(await run('const s = this.model.steps.filter(x => x.ok)[0]; s.title = title;'), ['steps', 'steps.title']);
  assert.deepEqual(await run('const s = this.model.steps[i]; s.title = title;'), ['steps', 'steps.title']);
  assert.deepEqual(await run('const all = this.model.steps; all.push(title);'), ['steps']);
  assert.deepEqual(await run('const all = this.model.steps; all[i] = title;'), ['steps']);
});

test('Schreibweg: ein Alias deckt NICHT ab bei Konstante, Überschattung oder unbekannter Herkunft', async () => {
  const run = async (body) => (await writeGateRun({
    vm: writeGateVm(agentMethod('setTitle(id, title)', body)),
    fields: [writeGateField('steps', 'Array<object>')],
  })).written;
  assert.deepEqual(await run('const s = this.model.steps.find(x => x.id === id); s.title = "fest";'), []);
  assert.deepEqual(await run('const s = lookup(id); s.title = title;'), []);
  assert.deepEqual(await run('const s = this.model.steps.map(x => x.a); s.title = title;'), []);
  // Der Closure-Parameter `s` ist nicht der Alias …
  assert.deepEqual(await run('const s = this.model.steps.find(x => x.id === id); others.forEach(s => { s.title = title; });'), []);
  // … die Blockbindung auch nicht …
  assert.deepEqual(await run('const s = this.model.steps[0]; if (id) { const s = other(); s.title = title; }'), []);
  // … und auch nicht die Schleifenvariable.
  assert.deepEqual(await run('const s = this.model.steps[0]; for (const s of others) { s.title = title; }'), []);
  // Innerhalb einer Closure bleibt der äußere Alias sichtbar.
  assert.deepEqual(await run('const s = this.model.steps[0]; later(() => { s.title = title; });'), ['steps', 'steps.title']);
  // Ein Alias gilt erst in seinem Block, nicht danach.
  assert.deepEqual(await run('if (id) { const s = this.model.steps[0]; } s.title = title;'), []);
});

test('Schreibweg: Sammlung und Alias eine Ebene tief in einer Model-Methode', async () => {
  const push = await writeGateRun({
    vm: writeGateVm(agentMethod('pushItem(text)', 'this.model.add(text);')),
    fields: [writeGateField('items', 'Array<object>')],
    methods: 'add(text) { this.items.push(text); }',
  });
  assert.deepEqual(push.written, ['items']);
  assert.deepEqual(push.reported, []);
  const alias = await writeGateRun({
    vm: writeGateVm(agentMethod('setTitle(id, title)', 'this.model.rename(id, title);')),
    fields: [writeGateField('steps', 'Array<object>')],
    methods: 'rename(id, title) { const s = this.steps.find(x => x.id === id); s.title = title; }',
  });
  assert.deepEqual(alias.written, ['steps', 'steps.title']);
  // Zwei Ebenen bleiben außen vor, ebenso ein konstantes Argument.
  const deep = await writeGateRun({
    vm: writeGateVm(agentMethod('pushItem(text)', 'this.model.add(text);')),
    fields: [writeGateField('items', 'Array<object>')],
    methods: 'add(text) { this._put(text); } _put(t) { this.items.push(t); }',
  });
  assert.deepEqual(deep.written, []);
  const constant = await writeGateRun({
    vm: writeGateVm(agentMethod('pushItem(text)', 'this.model.add("fest");')),
    fields: [writeGateField('items', 'Array<object>')],
    methods: 'add(text) { this.items.push(text); }',
  });
  assert.deepEqual(constant.written, []);
});

test('Auswahl: ein Lesefeld ohne Schreibweg ist ein Befund, auch ohne x-model', async () => {
  const { reported, entry } = await writeGateRun({ vm: writeGateVm(''), fields: [writeGateField('note')] });
  assert.ok(reported.includes('unreachable_write:note'), reported.join(', '));
  assert.equal(entry.available, false);
});

test('Auswahl: [via: …] am Model-Feld und VIEW_FIELDS nehmen das Feld aus', async () => {
  const via = await writeGateRun({
    vm: writeGateVm(agentMethod('foo(v)', 'this.model.other = v;')),
    fields: [writeGateField('note', 'string', '[via: foo] die Notiz'), writeGateField('other')],
  });
  assert.deepEqual(via.reported, []);
  assert.deepEqual(via.entry.fields.note.via, ['foo']);
  assert.equal(via.entry.fields.note.help, 'die Notiz');
  const view = await writeGateRun({
    vm: writeGateVm(''),
    fields: [writeGateField('note')],
    methods: "static VIEW_FIELDS = ['note'];",
  });
  assert.ok(!view.reported.includes('unreachable_write:note'), view.reported.join(', '));
});

test('Auswahl: ein Feld, von dem nur Unterpfade geschrieben werden, hat einen Schreibweg; eine x-model-Bindung auf das Ganze bleibt ein Befund', async () => {
  const run = async (html) => (await writeGateRun({
    vm: writeGateVm(agentMethod('setAlpha(v)', 'this.model.params.alpha = v;')),
    fields: [writeGateField('params', 'object')],
    html,
  })).reported;
  assert.deepEqual(await run(undefined), []);
  assert.deepEqual(await run('<input x-model="model.params">'), ['unreachable_write:params']);
});

test('Auswahl: `_`-Felder bleiben außen vor', async () => {
  const { reported } = await writeGateRun({
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

test('Auswahl: erklärte AgentRead-Felder ohne Setter sind kein Befund', async () => {
  const { reported } = await writeGateRun({ vm: declaredVm(''), fields: [writeGateField('other')] });
  assert.ok(!reported.some(c => c.startsWith('unreachable_write:')), reported.join(', '));
});

test('Vorlagenmethode: @noagent hinter @click, die ein Feld zuweist, ist ein Befund', async () => {
  const toggle = '/** @noagent */\n      toggle() { this.model.flag = !this.model.flag; },';
  const fields = [writeGateField('flag', 'boolean'), writeGateField('other')];
  const run = async (members, html) => (await writeGateRun({ vm: declaredVm(members), fields, html })).reported
    .filter(c => c.startsWith('unreachable_write:'));
  assert.deepEqual(await run(toggle, '<button @click="toggle()"></button>'), ['unreachable_write:flag']);
  // Ohne Klammer und über die lange Schreibweise genauso.
  assert.deepEqual(await run(toggle, '<button x-on:click.prevent="toggle"></button>'), ['unreachable_write:flag']);
  assert.deepEqual(await run(toggle, '<select @change="toggle($event)"></select>'), ['unreachable_write:flag']);
  // Elementzuweisung zählt für die Sammlung.
  assert.deepEqual(await run('/** @noagent */\n      toggle(i) { this.model.flag[i] = true; },', '<button @click="toggle(1)"></button>'), ['unreachable_write:flag']);
  // Nicht in der Vorlage: kein Befund.
  assert.deepEqual(await run(toggle, '<button @click="other()"></button>'), []);
  // Nur gelesen statt geschrieben: kein Befund.
  assert.deepEqual(await run('/** @noagent */\n      toggle() { return this.model.flag; },', '<button @click="toggle()"></button>'), []);
  // Eine @agent-Methode schreibt das Feld: kein Befund.
  assert.deepEqual(await run(`${toggle}\n      ${agentMethod('setFlag(v)', 'this.model.flag = v;')}`, '<button @click="toggle()"></button>'), []);
  // Eine @agent-Methode hinter der Vorlage ist selbst der Schreibweg, keine Lücke.
  assert.deepEqual(await run(agentMethod('setFlag(v)', 'this.model.flag = v;'), '<button @click="setFlag(1)"></button>'), []);
});

test('Baseline: ein Treffer landet in frozen statt reported, das Modul bleibt verfügbar', async () => {
  const baseline = new Set(['foo unreachable_write:note']);
  const { reported, frozen, entry } = await writeGateRun({ vm: writeGateVm(''), fields: [writeGateField('note')], baseline });
  assert.deepEqual(reported, []);
  assert.deepEqual(frozen, ['unreachable_write:note']);
  assert.equal(entry.available, true);
  assert.equal(entry.frozen, undefined, 'frozen gehört nicht in den Registry-Eintrag');
  // Eine Zeile eines anderen Moduls friert nichts ein.
  const other = await writeGateRun({ vm: writeGateVm(''), fields: [writeGateField('note')], baseline: new Set(['bar unreachable_write:note']) });
  assert.deepEqual(other.reported, ['unreachable_write:note']);
  assert.deepEqual(other.frozen, []);
});

test('Baseline: nur unreachable_write wird eingefroren, fremde Codes bleiben offen', async () => {
  const vm = writeGateVm('unmarkiert() {},');
  const probe = await writeGateRun({ vm, fields: [writeGateField('note')] });
  const foreign = probe.reported.find(c => c.startsWith('unmarked_method:'));
  assert.ok(foreign, `Fixture soll unmarked_method melden: ${probe.reported}`);
  const { reported, frozen } = await writeGateRun({
    vm, fields: [writeGateField('note')],
    baseline: new Set([`foo ${foreign}`, 'foo unreachable_write:note']),
  });
  assert.ok(reported.includes(foreign), 'der fremde Code bleibt offen');
  assert.deepEqual(frozen, ['unreachable_write:note']);
});

test('Baseline: frozen gelangt nicht in die erzeugte Registry', async () => {
  const root = fixture({ foo: { 'foo.js': writeGateVm(''), 'foo-model.js': `export class State {
  ${writeGateField('note')}
  toJSON() { return { note: this.note }; }
}` } });
  const data = await collectAgentData(root, { baseline: new Set(['foo unreachable_write:note']) });
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

test('Schreibweg: eine private Hilfe, die ein Element liefert, trägt die Spur eine Ebene weit', async () => {
  const { written, reported } = await writeGateRun({
    vm: writeGateVm(`${agentMethod('setText(id, text)', 'this._itemById(id).text = text;')}\n      ${ITEM_BY_ID}`),
    fields: [writeGateField('items', 'Array<object>')],
  });
  assert.deepEqual(written, ['items', 'items.text']);
  assert.deepEqual(reported, []);
});

test('Schreibweg: eine rekursive Model-Methode, die ein Element liefert, bindet den Alias', async () => {
  const { written, reported } = await writeGateRun({
    vm: writeGateVm(agentMethod('setAnswer(id, text)', 'const node = this.model.findNode(id); node.answer = String(text);')),
    fields: [writeGateField('nodes', 'Array<object>')],
    methods: FIND_NODE,
  });
  assert.deepEqual(written, ['nodes', 'nodes.answer']);
  assert.deepEqual(reported, []);
});

test('Schreibweg: dieselbe Form gilt in der delegierten Model-Methode', async () => {
  const { written } = await writeGateRun({
    vm: writeGateVm(agentMethod('setAnswer(id, text)', 'this.model.answer(id, text);')),
    fields: [writeGateField('nodes', 'Array<object>')],
    methods: `${FIND_NODE}
  answer(id, text) { const node = this.findNode(id); node.answer = text; }`,
  });
  assert.deepEqual(written, ['nodes', 'nodes.answer']);
});

test('Schreibweg: Hilfen ohne Element oder ohne Parameterwert decken NICHT ab', async () => {
  const run = async (setBody, helper) => (await writeGateRun({
    vm: writeGateVm(`${agentMethod('setText(id, text)', setBody)}\n      /** Hilfe. */\n      ${helper}`),
    fields: [writeGateField('items', 'Array<object>')],
  })).reported;
  const finding = ['unreachable_write:items'];
  const set = 'this._pick(id).text = text;';
  // Konstanter Wert: Das Element ist bekannt, der Wert nicht vom Agenten.
  assert.deepEqual(await run('this._pick(id).text = "";', '_pick(id) { return this.model.items.find(i => i.id === id); },'), finding);
  // Eine Kopie ist kein Element.
  assert.deepEqual(await run(set, '_pick(id) { return { ...this.model.items.find(i => i.id === id) }; },'), finding);
  assert.deepEqual(await run(set, '_pick(id) { return this.model.items.map(i => i)[id]; },'), finding);
  // Die Sammlung als Ganzes ist kein Element.
  assert.deepEqual(await run(set, '_pick(id) { return this.model.items; },'), finding);
  // Zwei Ebenen: Die Spur reicht genau eine weit.
  assert.deepEqual(await run(set, `_pick(id) { return this._pick2(id); },
      /** Hilfe. */
      _pick2(id) { return this.model.items.find(i => i.id === id); },`), finding);
  // Ein unbekannter Rückgabezweig schließt die ganze Hilfe.
  assert.deepEqual(await run(set, '_pick(id) { if (id) return this.fallback; return this.model.items.find(i => i.id === id); },'), finding);
  // Eine Hilfe ohne Element: nur `null`.
  assert.deepEqual(await run(set, '_pick(id) { return null; },'), finding);
  // Eine Hilfe außerhalb dieses Viewmodels.
  assert.deepEqual(await run('this.other._pick(id).text = text;', '_pick(id) { return this.model.items.find(i => i.id === id); },'), finding);
});

test('Schreibweg: zwei Sammlungen in einer Hilfe ergeben keine Spur', async () => {
  const { reported } = await writeGateRun({
    vm: writeGateVm(`${agentMethod('setText(id, text)', 'this._pick(id).text = text;')}
      /** Hilfe. */
      _pick(id) { if (id) return this.model.a.find(i => i.id === id); return this.model.b.find(i => i.id === id); },`),
    fields: [writeGateField('a', 'Array<object>'), writeGateField('b', 'Array<object>')],
  });
  assert.deepEqual(reported, ['unreachable_write:a', 'unreachable_write:b']);
});

test('Schreibweg: Eine Neubindung in der Hilfe nimmt dem Namen die Spur', async () => {
  const { reported } = await writeGateRun({
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
const pointerRun = async (signature, body, modelMethods = '') => (await writeGateRun({
  vm: writeGateVm(`/** @noagent */
      pick(id) { return this.model.steps.find(x => x.id === id); },
      ${agentMethod(signature, body)}`),
  fields: [writeGateField('steps', 'Array<object>')],
  methods: `findStep(id) { return this.steps.find(x => x.id === id); }
  ${modelMethods}`,
})).written;

test('Element-Zeiger: Umschalten aus dem Element selbst wählt keinen Wert, in jeder Lieferform', async () => {
  assert.deepEqual(await pointerRun('flip(i)', 'const s = this.model.steps[i]; s.done = !s.done;'), []);
  assert.deepEqual(await pointerRun('flip(i)', 'const list = this.model.steps; const s = list[i]; s.done = !s.done;'), []);
  assert.deepEqual(await pointerRun('flip(id)', 'const s = this.pick(id); s.done = !s.done;'), []);
  assert.deepEqual(await pointerRun('flip(id)', 'const s = this.model.findStep(id); s.done = !s.done;'), []);
  // Dieselbe Form über `.find` war schon vorher leer; beide Wege stimmen jetzt überein.
  assert.deepEqual(await pointerRun('flip(id)', 'const s = this.model.steps.find(x => x.id === id); s.done = !s.done;'), []);
});

test('Element-Zeiger: Entfernen und Selbstkopie sind kein Parameterwert', async () => {
  assert.deepEqual(await pointerRun('drop(i, k)', 'const s = this.model.steps[i]; s.kids = s.kids.filter(x => x !== k);'), []);
  assert.deepEqual(await pointerRun('copy(i)', 'const s = this.model.steps[i]; s.copy = s.title;'), []);
  assert.deepEqual(await pointerRun('copy(i)', 'const s = this.model.steps[i]; const t = s.title; s.copy = t;'), []);
  assert.deepEqual(await pointerRun('copy(i)', 'this.model.steps[i].copy = this.model.steps[i].title;'), []);
  assert.deepEqual(await pointerRun('trim(i)', 'const s = this.model.steps[0]; s.kids = s.kids.slice(i);'), []);
  assert.deepEqual(await pointerRun('dup(i)', 'const c = { ...this.model.steps[i] }; this.model.steps.push(c);'), []);
});

test('Element-Zeiger: das Durchreichen an eine Model-Methode bleibt ohne Parameterwert', async () => {
  const put = 'put(x) { this.steps.push(x); }';
  assert.deepEqual(await pointerRun('dup(i)', 'const s = this.model.steps[i]; this.model.put(s);', put), []);
  assert.deepEqual(await pointerRun('dup(i)', 'this.model.put(this.model.steps[i]);', put), []);
  assert.deepEqual(await pointerRun('dup(i)', 'const l = this.model.steps; this.model.put(l[i]);', put), []);
});

test('Element-Zeiger: Tausch und Verschieben ordnen nur um', async () => {
  assert.deepEqual(await pointerRun('swap(i, j)',
    'const a = this.model.steps[i]; this.model.steps[i] = this.model.steps[j]; this.model.steps[j] = a;'), []);
  assert.deepEqual(await pointerRun('swap(i, j)',
    'const l = this.model.steps; const a = l[i]; l[i] = l[j]; l[j] = a;'), []);
  assert.deepEqual(await pointerRun('move(i, j)',
    'const it = this.model.steps.splice(i, 1)[0]; this.model.steps.splice(j, 0, it);'), []);
});

test('Element-Zeiger: in der delegierten Model-Methode gilt dasselbe', async () => {
  const via = async (name, code) => await pointerRun(`${name}(i, j)`, `this.model.${name}(i, j);`, `${name}(i, j) { ${code} }`);
  assert.deepEqual(await via('flip', 'const s = this.steps[i]; s.done = !s.done;'), []);
  assert.deepEqual(await via('flip', 'const s = this.findStep(i); s.done = !s.done;'), []);
  assert.deepEqual(await via('cycle', "const C = ['a', 'b', 'c']; const s = this.findStep(i); const k = C.indexOf(s.v); s.v = C[(k + 1) % 3];"), []);
  assert.deepEqual(await via('drop', 'const s = this.findStep(i); s.kids = s.kids.filter(x => x !== j);'), []);
  assert.deepEqual(await via('swap', 'const a = this.steps[i]; this.steps[i] = this.steps[j]; this.steps[j] = a;'), []);
  assert.deepEqual(await via('move', 'const it = this.steps.splice(i, 1)[0]; this.steps.splice(j, 0, it);'), []);
});

test('Element-Zeiger: ein echter Parameterwert über den Zeiger deckt weiter ab', async () => {
  const both = ['steps', 'steps.title'];
  assert.deepEqual(await pointerRun('setTitle(id, title)', 'const s = this.model.steps.find(x => x.id === id); s.title = title;'), both);
  assert.deepEqual(await pointerRun('setTitle(id, data)', 'const s = this.model.steps.find(x => x.id === id); s.title = data.code;'), both);
  assert.deepEqual(await pointerRun('setTitle(i, title)', 'const s = this.model.steps[i]; s.title = title;'), both);
  assert.deepEqual(await pointerRun('setTitle(i, title)', 'const s = this.model.steps[i]; const t = title.trim(); s.title = t;'), both);
  assert.deepEqual(await pointerRun('setTitle(id, title)', 'const s = this.pick(id); s.title = title;'), both);
  assert.deepEqual(await pointerRun('setTitle(id, title)', 'const s = this.model.findStep(id); s.title = title;'), both);
  // Mischformen: Das Element liefert nur den Rest, der Wert kommt vom Parameter.
  assert.deepEqual(await pointerRun('setTitle(i, title)', 'const s = this.model.steps[i]; s.title = `${s.title} ${title}`;'), both);
  assert.deepEqual(await pointerRun('add(i, v)', 'const s = this.model.steps[i]; s.kids = [...s.kids, v];'), ['steps', 'steps.kids']);
  assert.deepEqual(await pointerRun('add(i, v)', 'const c = { ...this.model.steps[i], title: v }; this.model.steps[i] = c;'), ['steps']);
  // Eine Tabelle außerhalb des Models, gewählt per Parameter, bleibt ein Parameterwert.
  assert.deepEqual(await pointerRun('setKind(i, k)', "const C = ['a', 'b']; const s = this.model.steps[i]; s.kind = C[k];"), ['steps', 'steps.kind']);
  // Delegation mit Wert: Zeiger und Parameter nebeneinander.
  assert.deepEqual(await pointerRun('setTitle(id, title)', 'this.model.setTitle(id, title);',
    'setTitle(id, title) { const s = this.findStep(id); s.title = title; }'), both);
  assert.deepEqual(await pointerRun('setTitle(i, title)', 'const s = this.model.steps[i]; this.model.rename(s, title);',
    'rename(s, title) { s.title = title; this.steps.push(title); }'), ['steps']);
});

test('Vorlagenmethode: jede Ausdrucksform hinter dem Ereignis zählt', async () => {
  const toggle = '/** @noagent */\n      toggle() { this.model.flag = !this.model.flag; },';
  const fields = [writeGateField('flag', 'boolean'), writeGateField('other')];
  const run = async (html) => (await writeGateRun({ vm: declaredVm(toggle), fields, html })).reported
    .filter(c => c.startsWith('unreachable_write:'));
  const hit = ['unreachable_write:flag'];
  assert.deepEqual(await run('<button @click="$event.stopPropagation(); toggle()"></button>'), hit);
  assert.deepEqual(await run('<button @click="open && toggle()"></button>'), hit);
  assert.deepEqual(await run('<button @click="foo(); toggle()"></button>'), hit);
  assert.deepEqual(await run('<button @click="open ? toggle() : 0"></button>'), hit);
  assert.deepEqual(await run('<button x-on:click.stop="!open || toggle()"></button>'), hit);
  assert.deepEqual(await run('<button @click="\n  foo();\n  toggle();\n"></button>'), hit);
  assert.deepEqual(await run("<button @click='foo(); toggle()'></button>"), hit);
  // Die Grenze: ein längerer Name oder ein fremder Empfänger ist nicht die Methode.
  for (const expr of ['toggleAll()', 'untoggle()', '$toggle()', 'toggle$()', 'obj.toggle()', 'foo(); obj.toggle()']) {
    assert.deepEqual(await run(`<button @click="${expr}"></button>`), [], expr);
  }
  // Eine Bindung oder ein Text ist kein Ereignis.
  assert.deepEqual(await run('<button :class="toggle()">toggle()</button>'), []);
});

test('Vorlagenmethode: eine @noagent-Methode eines Teil-Viewmodels zählt unter ihrem Pfadnamen', async () => {
  const body = DRAFT_VM.replace('problemClass() { return {}; }', 'problemClass() { this.model.extra = 1; return {}; }');
  const reported = async (html) => (await collectAgentData(subVmFixture(body, { html }))).modules.foo.reported;
  assert.ok((await reported('<button @click="draft.problemClass()"></button>')).includes('unreachable_write:extra'));
  assert.ok((await reported('<button @click="foo(); draft.problemClass()"></button>')).includes('unreachable_write:extra'));
  // Der nackte Name ohne Empfänger ist eine andere Methode.
  assert.ok(!(await reported('<button @click="problemClass()"></button>')).includes('unreachable_write:extra'));
  assert.ok(!(await reported('<button @click="other.draft.problemClass()"></button>')).includes('unreachable_write:extra'));
});

test('Element-Zeiger: eine Pfad-Hilfe, die nur einen Model-Wert umkopiert, deckt NICHTS ab', async () => {
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
  const { modules } = await collectAgentData(root);
  assert.deepEqual(modules.foo.reported, ['unreachable_write:params.alpha', 'unreachable_write:params.beta']);
});

test('ein umgestelltes Modul ohne Schema-Export bricht den Lauf mit Dateiname ab', async () => {
  const root = fixture({}, {
    'js/modules/neu/domain/model.js': 'export const State = null;\n',
    'js/modules/neu/viewmodel/viewmodel.js': '',
  });
  await assert.rejects(collectAgentData(root, { baseline: new Set(), converted: ['neu'] }),
    /neu\/domain\/model\.js: erwartet genau einen Export mit Schema \(defineModel\), gefunden 0/);
});

test('domain/model.js allein macht kein Schema-Modul', async () => {
  const root = fixture({}, {
    'js/modules/neu/domain/model.js': 'export const State = null;\n',
    'js/modules/neu/viewmodel/viewmodel.js': '',
  });
  const { modules } = await collectAgentData(root, { baseline: new Set(), converted: [] });
  assert.equal(modules.neu, undefined);
});
