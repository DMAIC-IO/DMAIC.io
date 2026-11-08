/**
 * Typprüfung der umgestellten Module (tools/build/typecheck.mjs).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { typecheck, typecheckFiles, TYPED_CORE } from './typecheck.mjs';
import { renderModelTypes, renderWidgetProps, renderBindingCheck } from './model-types.mjs';
import { defineModel, defineWidget, command, text, index, list } from '../../js/core/model.js';
import { APP_DIR } from './build.mjs';

function appWith(files) {
  const root = mkdtempSync(join(tmpdir(), 'typecheck-'));
  for (const [path, body] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, body);
  }
  return root;
}

test('typecheckFiles: Kerndateien plus .js der umgestellten Module', () => {
  const root = appWith({
    'js/modules/neu/module.js': '', 'js/modules/neu/domain/model.js': '', 'js/modules/neu/resources/view.html': '',
    'js/modules/alt/alt.js': '',
  });
  const files = typecheckFiles(root, ['neu']).map((f) => f.slice(root.length + 1));
  assert.deepEqual(files, [...TYPED_CORE, 'js/modules/neu/domain/model.js', 'js/modules/neu/module.js']);
});

test('typecheck: Fehler in geprüfter Datei wird gemeldet, in importierter nicht', () => {
  const root = appWith({
    'lib.js': '/** @type {number} */\nexport const n = "kein Zahl";\n',
    'main.js': "import { n } from './lib.js';\n/** @type {string} */\nexport const s = 1;\nexport const m = n;\n",
  });
  const findings = typecheck([join(root, 'main.js')]);
  assert.equal(findings.length, 1, findings.join('\n'));
  assert.match(findings[0], /main\.js\(3,14\): TS2322: /);
});

test('typecheck: module.js wird gegen ModuleDescriptor geprüft', () => {
  const up = '@/'.replace('@/', '../../');
  const root = appWith({
    'js/modules/neu/viewmodel/viewmodel.js': 'export default {};\n',
    'js/modules/neu/module.js': `/** @type {import('${up}core/module-descriptor.js').ModuleDescriptor} */\nexport default { id: 'neu', version: 1, icon: 'i', load: () => import('./viewmodel/viewmodel.js') };\n`,
  });
  mkdirSync(join(root, 'js', 'core'), { recursive: true });
  copyFileSync(join(APP_DIR, 'js', 'core', 'module-descriptor.js'), join(root, 'js', 'core', 'module-descriptor.js'));
  const findings = typecheck([join(root, 'js', 'modules', 'neu', 'module.js')]);
  assert.equal(findings.length, 1, findings.join('\n'));
  assert.match(findings[0], /module\.js\(2,\d+\): TS2322: .*number.*string/);
});

test('echter Baum: Kerndateien ohne Befund', () => {
  assert.deepEqual(typecheck(TYPED_CORE.map((f) => join(APP_DIR, f))), []);
});

test('typecheck: run-Methode eines Kommandos darf this.<Feld> lesen', () => {
  const up = '@/'.replace('@/', '../../../');
  const root = appWith({
    'js/modules/neu/domain/model.js': `import { defineModel, command, text, boolean } from '${up}core/model.js';
export const State = defineModel({
  fields: { title: text() },
  commands: {
    rename: command({ params: { title: text() }, returns: boolean(), run({ title }) { this.title = title; return this.title === title; } }),
  },
});
`,
  });
  mkdirSync(join(root, 'js', 'core'), { recursive: true });
  for (const f of ['model.js', 'validate.js']) copyFileSync(join(APP_DIR, 'js', 'core', f), join(root, 'js', 'core', f));
  const findings = typecheck([join(root, 'js', 'modules', 'neu', 'domain', 'model.js')]);
  assert.deepEqual(findings, []);
});

test('typecheck: Diagnose ohne Datei (fehlende Lib) wird gemeldet', () => {
  const root = appWith({ 'main.js': 'export const a = 1;\n' });
  const findings = typecheck([join(root, 'main.js')], { lib: ['lib.gibtesnicht.d.ts'] });
  assert.ok(findings.some((f) => /^typecheck: TS\d+: /.test(f)), findings.join('\n'));
});

test('typecheck: this im view-Block ist über ViewFn getypt', () => {
  const tm = join(APP_DIR, 'js', 'core', 'template-module.js');
  const root = appWith({
    'vm.js': `/** @typedef {{ tab: 'a'|'b' }} Ui */
/** @typedef {{ title: string, rename(cmd: { title: string }): void }} M */
/** @type {import('${tm}').ViewFn<M, Ui>} */
export const view = (ctx) => ({
  ok() { this.model.rename({ title: this.state.tab }); return ctx.moduleId + this.t('x') + this.other(); },
  bad() { return this.state.nope; },
  badCmd() { this.model.rename({ title: 1 }); },
});
`,
  });
  const findings = typecheck([join(root, 'vm.js')]);
  assert.equal(findings.length, 2, findings.join('\n'));
  assert.match(findings[0], /vm\.js\(6,\d+\): TS2339: Property 'nope'/);
  assert.match(findings[1], /vm\.js\(7,\d+\): TS2322: /);
});

test('typecheck: fremder Schlüssel in der Rückgabe von current ist ein Befund', () => {
  const Doc = defineModel({
    fields: { items: list(text()) },
    commands: {
      setItem: command({ params: { idx: index('items', { existing: true }), text: text() }, current() { return {}; }, run() {} }),
    },
  });
  const dir = mkdtempSync(join(tmpdir(), 'typecheck-current-'));
  writeFileSync(join(dir, 'model.types.js'), renderModelTypes({ name: 'Doc', schema: Doc.schema }));
  const hooks = (body) => `export const hooks = {
  /** @type {import('./model.types.js').SetItemCurrent} */
  current({ idx }) { return ${body}; },
};
`;
  writeFileSync(join(dir, 'ok.js'), hooks('{ text: this.items[idx] }'));
  writeFileSync(join(dir, 'bad.js'), hooks('{ text: this.items[idx], bogus: 1 }'));
  assert.deepEqual(typecheck([join(dir, 'ok.js')]), []);
  const findings = typecheck([join(dir, 'bad.js')]);
  assert.equal(findings.length, 1);
  assert.match(String(findings[0]), /bogus/);
});

test('typecheck: this in exports ist über ExportsDef getypt, auch an einer Eigenschaft', () => {
  const tm = join(APP_DIR, 'js', 'core', 'template-module.js');
  const root = appWith({
    'vm.js': `/** @typedef {{ tab: 'a'|'b' }} Ui */
/** @typedef {{ title: string }} M */
export const def = {
  /** @type {import('${tm}').ExportsDef<M, Ui>} */
  exports: {
    table() { return [[this.model.title, this.state.tab, this.cssVars({ a: '--a' }).a]]; },
    tree() { return this.model.nope; },
  },
};
`,
  });
  const findings = typecheck([join(root, 'vm.js')]);
  assert.equal(findings.length, 1, findings.join('\n'));
  assert.match(findings[0], /vm\.js\(7,\d+\): TS2339: Property 'nope'/);
});

test('typecheck: this im Kachel-view ist über TileViewFn getypt', () => {
  const tt = join(APP_DIR, 'js', 'core', 'template-tile.js');
  const root = appWith({
    'tile.js': `/** @typedef {{ topN: number }} S */
/** @typedef {{ items: string[], hasContent(): boolean }} M */
/** @type {import('${tt}').TileViewFn<Readonly<M>, S>} */
export const view = (ctx) => ({
  get top() { return this.model.items.slice(0, this.settings.topN).length + this.t('x') + ctx.moduleId; },
  bad() { return this.settings.nope; },
});
`,
  });
  const findings = typecheck([join(root, 'tile.js')]);
  assert.equal(findings.length, 1, findings.join('\n'));
  assert.match(findings[0], /tile\.js\(6,\d+\): TS2339: Property 'nope'/);
});

/** Temporärer App-Baum: Modul mit view-Getter `rows`, Widget `w` mit `rows: string[]`, Prüfdatei. */
function bindingApp(getter) {
  const tm = join(APP_DIR, 'js', 'core', 'template-module.js');
  const w = defineWidget({ name: 'w', props: { rows: list(text()) } });
  const check = renderBindingCheck({ vmImport: './viewmodel.js', bindings: [
    { widget: 'w', prop: 'rows', path: 'rows', computed: false, where: 'resources/view.html:1 x-widget-rows' },
  ] });
  return appWith({
    'js/widgets/widget-props.types.js': renderWidgetProps(new Map([['w', w]])),
    'js/modules/m/viewmodel/viewmodel.js': `import { createModule } from '${tm}';\nexport default createModule({ view() { return { get rows() { ${getter} } }; } });\n`,
    'js/modules/m/viewmodel/view.bindings.js': check,
  });
}

test('typecheck: Getter-Bindung mit falschem Typ meldet die Zeile der Zuweisung', () => {
  const root = bindingApp("return 'x';");
  const file = join(root, 'js/modules/m/viewmodel/view.bindings.js');
  const findings = typecheck([file]);
  assert.equal(findings.length, 1, findings.join('\n'));
  assert.match(findings[0], /view\.bindings\.js\(4,\d+\): TS2322: .*Type 'string' is not assignable to type 'string\[\]'/);
});

/** Temporärer App-Baum: Modul mit `asyncTasks` aus `tasksSrc`, Prüfdatei mit Behälter `compute`. */
function taskBindingApp(tasksSrc) {
  const tm = join(APP_DIR, 'js', 'core', 'template-module.js');
  const at = join(APP_DIR, 'js', 'core', 'async-task.js');
  const check = renderBindingCheck({ vmImport: './viewmodel.js', bindings: [
    { kind: 'asyncTask', name: 'compute', where: 'resources/view.html:1 x-async-task' },
  ] }).replace('../../../core/async-task.js', at);
  return appWith({
    'js/modules/m/viewmodel/viewmodel.js': `import { createModule } from '${tm}';\nimport { asyncTask } from '${at}';\n`
      + `export default createModule({ view() { return {}; }, asyncTasks: { ${tasksSrc} } });\n`,
    'js/modules/m/viewmodel/view.bindings.js': check,
  });
}

test('typecheck: x-async-task auf einen Task, den das Viewmodel nicht hat, meldet die Zeile', () => {
  const root = taskBindingApp('preview: asyncTask({ auto: true, async run() {} })');
  const findings = typecheck([join(root, 'js/modules/m/viewmodel/view.bindings.js')]);
  assert.equal(findings.length, 1, findings.join('\n'));
  assert.match(findings[0], /view\.bindings\.js\(3,\d+\): TS2339: Property 'compute' does not exist/);
});

test('typecheck: x-async-task in einem Modul ganz ohne asyncTasks meldet die Zeile', () => {
  const dir = taskBindingApp('');
  const vm = join(dir, 'js/modules/m/viewmodel/viewmodel.js');
  const tm = join(APP_DIR, 'js', 'core', 'template-module.js');
  writeFileSync(vm, `import { createModule } from '${tm}';\nexport default createModule({ view() { return {}; } });\n`);
  const findings = typecheck([join(dir, 'js/modules/m/viewmodel/view.bindings.js')]);
  assert.equal(findings.length, 1, findings.join('\n'));
  assert.match(findings[0], /view\.bindings\.js\(3,\d+\): TS2339: Property 'compute' does not exist/);
});

test('typecheck: x-async-task auf einen deklarierten Task ist ohne Befund', () => {
  const root = taskBindingApp('compute: asyncTask({ async run() {} })');
  const findings = typecheck([join(root, 'js/modules/m/viewmodel/view.bindings.js')]);
  assert.equal(findings.length, 0, findings.join('\n'));
});

test('renderBindingCheck: nur Task-Bindungen ohne WidgetProps, gemischt mit beiden Köpfen', () => {
  const only = renderBindingCheck({ vmImport: './viewmodel.js', bindings: [{ kind: 'asyncTask', name: 'compute', where: 'resources/view.html:1 x-async-task' }] });
  assert.doesNotMatch(only, /WidgetProps/);
  assert.match(only, /const tasks = /);
  assert.match(only, /export const b0 = tasks\.compute; \/\/ resources\/view\.html:1 x-async-task/);
  const mixed = renderBindingCheck({ vmImport: './viewmodel.js', bindings: [
    { widget: 'w', prop: 'rows', path: 'rows', computed: false, where: 'resources/view.html:1 x-widget-rows' },
    { kind: 'asyncTask', name: 'compute', where: 'resources/view.html:2 x-async-task' },
  ] });
  assert.match(mixed, /WidgetProps\['w'\]\['rows'\]\} \*\/ export const b0 = vm\.rows;/);
  assert.match(mixed, /export const b1 = tasks\.compute;/);
});

test('typecheck: Getter-Bindung mit passendem Typ ist ohne Befund', () => {
  const root = bindingApp("return ['x'];");
  const findings = typecheck([join(root, 'js/modules/m/viewmodel/view.bindings.js')]);
  assert.equal(findings.length, 0, findings.join('\n'));
});

/** Temporärer App-Baum für eine Bindung (Modul, Kachel oder computed) mit frei wählbarem Quelltext der Hauptdatei. */
function strictApp({ file, source, binding }) {
  const w = defineWidget({ name: 'w', props: { rows: list(text()) } });
  const check = renderBindingCheck({ vmImport: './' + file.split('/').pop(), bindings: [
    { widget: 'w', prop: 'rows', where: 'resources/view.html:1 x-widget-rows', ...binding },
  ] });
  const dir = file.split('/').slice(0, -1).join('/');
  return appWith({
    'js/widgets/widget-props.types.js': renderWidgetProps(new Map([['w', w]])),
    [`js/modules/m/${file}`]: source,
    [`js/modules/m/${dir}/x.bindings.js`]: check,
  });
}
const strictFile = (root, dir) => join(root, `js/modules/m/${dir}/x.bindings.js`);

test('typecheck: Getter, der null für eine Pflicht-Eingabe liefert, ist ein Befund', () => {
  const tm = join(APP_DIR, 'js', 'core', 'template-module.js');
  const root = strictApp({
    file: 'viewmodel/viewmodel.js',
    source: `import { createModule } from '${tm}';\nexport default createModule({ view() { return { get cfg() { return null; } }; } });\n`,
    binding: { prop: 'rows', path: 'cfg', computed: false },
  });
  const findings = typecheck([strictFile(root, 'viewmodel')]);
  assert.equal(findings.length, 1, findings.join('\n'));
  assert.match(findings[0], /x\.bindings\.js\(\d+,\d+\): TS2322: .*null.*not assignable/);
});

test('typecheck: Kachel-Getter, der null für eine Pflicht-Eingabe liefert, ist ein Befund', () => {
  const tt = join(APP_DIR, 'js', 'core', 'template-tile.js');
  const root = strictApp({
    file: 'tile/tile.js',
    source: `import { createTile } from '${tt}';\nexport default createTile({ descriptor: { id: 'm' }, Model: {}, view() { return { get cfg() { return null; } }; } });\n`,
    binding: { prop: 'rows', path: 'cfg', computed: false },
  });
  const findings = typecheck([strictFile(root, 'tile')]);
  assert.equal(findings.length, 1, findings.join('\n'));
  assert.match(findings[0], /x\.bindings\.js\(\d+,\d+\): TS2322: .*null.*not assignable/);
});

test('typecheck: computed, das null für eine Pflicht-Eingabe liefert, ist ein Befund', () => {
  const tm = join(APP_DIR, 'js', 'core', 'template-module.js');
  const root = strictApp({
    file: 'viewmodel/viewmodel.js',
    source: `import { createModule } from '${tm}';\nexport default createModule({ view() { return { computed: { cfg() { return null; } } }; } });\n`,
    binding: { prop: 'rows', path: 'cfg', computed: true },
  });
  const findings = typecheck([strictFile(root, 'viewmodel')]);
  assert.equal(findings.length, 1, findings.join('\n'));
  assert.match(findings[0], /x\.bindings\.js\(\d+,\d+\): TS2322: .*null.*not assignable/);
});
