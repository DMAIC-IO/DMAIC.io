/**
 * Typprüfung der umgestellten Module (tools/build/typecheck.mjs).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { typecheck, typecheckFiles, TYPED_CORE } from './typecheck.mjs';
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
