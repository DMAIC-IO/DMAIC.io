/**
 * JSON-Schemata der Modul-Dateien (tools/build/json-schemas.mjs, app/dev/schemas/).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FORMATS, validateValue, validateFile, schemaRef, checkTree } from './json-schemas.mjs';
import { HELP } from '../../js/core/help-registry.generated.js';
import { REFS } from '../../js/core/references-registry.generated.js';
import { APP_DIR } from './build.mjs';

/** Temp-App aus `{ pfad: inhalt }`; Objekte werden als JSON geschrieben. */
function appWith(files) {
  const root = mkdtempSync(join(tmpdir(), 'json-schemas-'));
  for (const [path, body] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, typeof body === 'string' ? body : JSON.stringify(body));
  }
  return root;
}

const UP5 = '../../../../../schemas';
const UI = { $schema: `${UP5}/module-ui.schema.json`, name: 'Neu', description: 'Kurz', whenToUse: 'Wann', col: 'Spalte', nested: { a: 'A', list: ['x', 1, true] } };
const CTX = {
  $schema: `${UP5}/module-context-help.schema.json`,
  fields: { title: { help: 'Titel.' } },
  actions: { add: { help: 'Fügt hinzu.', params: { text: 'Der Text.' } }, group: { move: { help: 'Verschiebt.' } } },
  types: { Params: { alpha: 'Alpha.', nested: { beta: 'Beta.' } } },
};
const HELPFILE = {
  $schema: `${UP5}/module-help.schema.json`,
  sections: {
    overview: { title: 'Überblick', blocks: [
      { type: 'paragraph', content: 'Text {{ref:melzer-2019}}.' },
      { type: 'definition', term: 'Cp', content: 'Fähigkeit.' },
      { type: 'list', items: ['a', 'b'] },
      { type: 'table', headers: ['A', 'B'], rows: [['1', '']] },
    ] },
  },
};
const REFSFILE = {
  $schema: `${UP5}/module-references.schema.json`,
  references: [
    { book: 'melzer-2019', note: { de: 'Kapitel 3', en: 'Chapter 3' } },
    { id: 'nelson-1984', type: 'article-journal', title: 'The Shewhart Control Chart', author: [{ family: 'Nelson', given: 'Lloyd S.' }],
      'container-title': 'Journal of Quality Technology', volume: '16', issue: '4', page: '237-239', issued: { 'date-parts': [[1984]] } },
    { id: 'nist', type: 'webpage', title: 'Handbook', author: [{ literal: 'NIST' }], URL: 'https://www.itl.nist.gov/' },
  ],
};

test('FORMATS nennt die A2-Formate mit Schema-Datei', () => {
  for (const f of ['module-ui', 'module-context-help', 'module-help', 'module-references', 'module-resources', 'catalog-texts']) {
    assert.equal(FORMATS[f].schema, `${f}.schema.json`);
  }
  assert.equal(FORMATS['module-resources'].glob, null);
});

test('module-ui: gültig; Pflichtschlüssel, verbotene Kontexthilfe und leere Strings werden gemeldet', () => {
  assert.deepEqual(validateValue(UI, 'module-ui'), { ok: true, errors: [] });
  const noWhen = { ...UI };
  delete noWhen.whenToUse;
  assert.equal(validateValue(noWhen, 'module-ui').ok, false);
  assert.equal(validateValue({ ...UI, actions: { add: { help: 'x' } } }, 'module-ui').ok, false);
  assert.equal(validateValue({ ...UI, col: '' }, 'module-ui').ok, false);
  assert.equal(validateValue({ ...UI, col: null }, 'module-ui').ok, false);
});

test('module-context-help: gültig; fremder Oberschlüssel, Feld ohne help, Nicht-String-Parameter ungültig', () => {
  assert.deepEqual(validateValue(CTX, 'module-context-help'), { ok: true, errors: [] });
  assert.equal(validateValue({ ...CTX, name: 'X' }, 'module-context-help').ok, false);
  assert.equal(validateValue({ ...CTX, fields: { title: { label: 'x' } } }, 'module-context-help').ok, false);
  assert.equal(validateValue({ ...CTX, actions: { add: { help: 'x', params: { text: 1 } } } }, 'module-context-help').ok, false);
  assert.equal(validateValue({ ...CTX, types: { Params: { alpha: '' } } }, 'module-context-help').ok, false);
});

test('module-help: gültig; unbekannter Blocktyp, fehlender Titel, Zusatzschlüssel ungültig', () => {
  assert.deepEqual(validateValue(HELPFILE, 'module-help'), { ok: true, errors: [] });
  const sec = (blocks, extra = {}) => ({ sections: { a: { title: 'A', blocks, ...extra } } });
  assert.equal(validateValue(sec([{ type: 'quote', content: 'x' }]), 'module-help').ok, false);
  assert.equal(validateValue({ sections: { a: { blocks: [] } } }, 'module-help').ok, false);
  assert.equal(validateValue(sec([{ type: 'paragraph', content: 'x', extra: 1 }]), 'module-help').ok, false);
  assert.equal(validateValue(sec([{ type: 'list', items: [1] }]), 'module-help').ok, false);
  assert.equal(validateValue({ ...HELPFILE, moduleId: 'x' }, 'module-help').ok, false);
});

test('module-references: gültig; Buch plus id, CSL ohne author, fremder Typ ungültig', () => {
  assert.deepEqual(validateValue(REFSFILE, 'module-references'), { ok: true, errors: [] });
  const one = (e) => ({ references: [e] });
  assert.equal(validateValue(one({ book: 'melzer-2019', id: 'x' }), 'module-references').ok, false);
  assert.equal(validateValue(one({ id: 'x', type: 'book', title: 'T' }), 'module-references').ok, false);
  assert.equal(validateValue(one({ id: 'x', type: 'thesis', title: 'T', author: [{ literal: 'A' }] }), 'module-references').ok, false);
  assert.equal(validateValue(one({ book: 'melzer-2019', note: { de: 'nur de' } }), 'module-references').ok, false);
  assert.equal(validateValue([], 'module-references').ok, false, 'nacktes Array: Festlegung 1');
});

test('module-resources: gültig; ohne templates oder mit Zusatzschlüssel ungültig', () => {
  const ok = { neu: { templates: 'js/chunks/templates/neu-1.html', style: 'js/chunks/styles/neu-1.css', files: { 'i18n/ui.de.json': 'js/modules/neu/resources/i18n/ui.de.json?v=1' } } };
  assert.deepEqual(validateValue(ok, 'module-resources'), { ok: true, errors: [] });
  assert.deepEqual(validateValue({}, 'module-resources'), { ok: true, errors: [] });
  assert.equal(validateValue({ neu: { files: {} } }, 'module-resources').ok, false);
  assert.equal(validateValue({ neu: { templates: 't', files: {}, extra: 1 } }, 'module-resources').ok, false);
});

test('catalog-texts: gültig mit $schema; fehlendes whenToUse ungültig', () => {
  const ok = { $schema: '../../schemas/catalog-texts.schema.json', neu: { name: 'Neu', description: 'Kurz', whenToUse: 'Wann' } };
  assert.deepEqual(validateValue(ok, 'catalog-texts'), { ok: true, errors: [] });
  assert.deepEqual(validateValue({}, 'catalog-texts'), { ok: true, errors: [] });
  assert.equal(validateValue({ neu: { name: 'Neu', description: 'Kurz' } }, 'catalog-texts').ok, false);
});

test('Fehlermeldung nennt Pfad und ajv-Meldung', () => {
  const { errors } = validateValue({ neu: { files: {} } }, 'module-resources');
  assert.ok(errors.some((e) => e.startsWith('/neu ') && e.includes('templates')), errors.join('\n'));
});

test('schemaRef: relativer posix-Pfad zur Schema-Datei', () => {
  const root = '/app';
  assert.equal(schemaRef('/app/js/modules/neu/resources/i18n/ui.de.json', 'module-ui', root), `${UP5}/module-ui.schema.json`);
  assert.equal(schemaRef('/app/js/modules/catalog.de.json', 'catalog-texts', root), '../../schemas/catalog-texts.schema.json');
});

test('validateFile: falscher oder fehlender $schema-Verweis und kaputtes JSON werden gemeldet', () => {
  const root = appWith({
    'js/modules/neu/resources/i18n/ui.de.json': UI,
    'js/modules/neu/resources/i18n/ui.en.json': { ...UI, $schema: '../module-ui.schema.json' },
    'js/modules/alt/resources/i18n/ui.de.json': { ...UI, $schema: undefined },
    'js/modules/kaputt/resources/i18n/ui.de.json': '{ nein',
  });
  const f = (rel) => join(root, ...rel.split('/'));
  assert.deepEqual(validateFile(f('js/modules/neu/resources/i18n/ui.de.json'), 'module-ui', { appDir: root }), { ok: true, errors: [] });
  const wrong = validateFile(f('js/modules/neu/resources/i18n/ui.en.json'), 'module-ui', { appDir: root });
  assert.ok(wrong.errors.some((e) => e.includes(`$schema muss "${UP5}/module-ui.schema.json" sein`)), wrong.errors.join('\n'));
  assert.equal(validateFile(f('js/modules/alt/resources/i18n/ui.de.json'), 'module-ui', { appDir: root }).ok, false);
  const broken = validateFile(f('js/modules/kaputt/resources/i18n/ui.de.json'), 'module-ui', { appDir: root });
  assert.ok(broken.errors[0].includes('kein gültiges JSON'), broken.errors.join('\n'));
});

test('checkTree sammelt Fehler aller Formate einer Temp-App', () => {
  const root = appWith({
    'js/modules/neu/resources/i18n/ui.de.json': UI,
    'js/modules/neu/resources/i18n/context-help.de.json': { ...CTX, fields: { title: {} } },
    'js/modules/neu/resources/i18n/help.de.json': HELPFILE,
    'js/modules/neu/resources/data/references.json': REFSFILE,
  });
  const errors = checkTree(root);
  assert.equal(errors.length > 0, true);
  assert.ok(errors.every((e) => e.includes('context-help.de.json')), errors.join('\n'));
});

// ─── Passform an den echten Inhalten der alten Form ─────────────────
// Die Schemata müssen die Inhalte tragen, die Teilprojekt E umzieht.

test('Passform: jede Kontexthilfe aus i18n/<lang>.json erfüllt module-context-help', () => {
  for (const lang of ['de', 'en']) {
    const modules = JSON.parse(readFileSync(join(APP_DIR, 'i18n', `${lang}.json`), 'utf8')).modules;
    for (const [id, m] of Object.entries(modules)) {
      const ctx = Object.fromEntries(['fields', 'actions', 'types'].filter((k) => m[k]).map((k) => [k, m[k]]));
      const { errors } = validateValue(ctx, 'module-context-help');
      assert.deepEqual(errors, [], `${lang} ${id}`);
    }
  }
});

test('Passform: UI-Texte jedes Moduls (ohne Kontexthilfe) erfüllen module-ui', () => {
  for (const lang of ['de', 'en']) {
    const modules = JSON.parse(readFileSync(join(APP_DIR, 'i18n', `${lang}.json`), 'utf8')).modules;
    for (const [id, m] of Object.entries(modules)) {
      if (id === 'shared') continue;
      const ui = { ...m };
      for (const k of ['fields', 'actions', 'types']) delete ui[k];
      const { errors } = validateValue(ui, 'module-ui');
      assert.deepEqual(errors, [], `${lang} ${id}`);
    }
  }
});

test('Passform: jedes Handbuch, je Sprache aufgeteilt, erfüllt module-help', () => {
  for (const [id, help] of Object.entries(HELP)) {
    for (const lang of ['de', 'en']) {
      const file = { sections: Object.fromEntries(Object.entries(help.sections).map(([k, v]) => [k, v[lang]])) };
      assert.deepEqual(validateValue(file, 'module-help').errors, [], `${lang} ${id}`);
    }
  }
});

test('Passform: jede Referenzliste erfüllt module-references', () => {
  for (const [id, list] of Object.entries(REFS)) {
    assert.deepEqual(validateValue({ references: list }, 'module-references').errors, [], id);
  }
});

test('echter Baum: jede Datei eines Formats ist gültig und verweist auf ihr Schema', () => {
  assert.deepEqual(checkTree(APP_DIR), []);
});

// ─── A3: Beispiel-Formate ──────────────────────────────────────────

const L = (de, en = de) => ({ de, en });
const PROJECT = { id: 'p1', type: 'project', title: L('P'), description: L('D'), source: 'Q', license: 'public-domain', file: 'projects/p1.json', format: 'json', tags: ['t'] };
const DATASET = { id: 'd1', type: 'dataset', title: L('D'), description: L('D'), source: 'Q', file: 'data/d1.csv', format: 'csv', tags: ['t'],
  columns: [{ name: 'Durchmesser', type: 'numeric', unit: 'mm' }], spec: { lsl: 9.8, usl: 10.2, target: 10 }, preview: { rows: 10 } };
const GENERATOR = { id: 'g1', type: 'generator', title: L('G'), description: L('G'), source: 'Q', tags: ['t'],
  generator: { algorithm: 'normal', params: { n: 100 }, seed: 7 }, columns: [{ name: 'x', type: 'numeric' }] };
const SCENARIO = { id: 's1', type: 'scenario', title: L('S'), description: L('S'), cycle: 'dmaic', startPhase: 'define', tags: ['scenario'], items: ['p1', 'd1#histogram'] };

test('example-entry: die drei Typen gültig; modules, fremder Typ, fehlende Pflicht ungültig', () => {
  for (const e of [PROJECT, DATASET, GENERATOR]) assert.deepEqual(validateValue(e, 'example-entry').errors, [], e.id);
  assert.equal(validateValue({ ...PROJECT, modules: ['sipoc'] }, 'example-entry').ok, false, 'modules gehört nicht in die Modul-Datei');
  assert.equal(validateValue({ ...PROJECT, type: 'scenario' }, 'example-entry').ok, false);
  assert.equal(validateValue({ ...PROJECT, format: 'csv' }, 'example-entry').ok, false);
  const noSource = { ...PROJECT };
  delete noSource.source;
  assert.equal(validateValue(noSource, 'example-entry').ok, false);
  assert.equal(validateValue({ ...GENERATOR, file: 'x' }, 'example-entry').ok, false);
  assert.equal(validateValue({ ...DATASET, title: { de: 'nur de' } }, 'example-entry').ok, false);
});

test('module-examples: { $schema, examples } gültig; nacktes Array und modules ungültig', () => {
  assert.deepEqual(validateValue({ $schema: 'x', examples: [PROJECT, DATASET, GENERATOR] }, 'module-examples').errors, []);
  assert.equal(validateValue([PROJECT], 'module-examples').ok, false);
  assert.equal(validateValue({ examples: [{ ...PROJECT, modules: ['a'] }] }, 'module-examples').ok, false);
});

test('examples-index: Einträge brauchen modules; Szenarien gehören nicht hinein', () => {
  const ok = { $schema: 'x', version: '1.0', examples: [{ ...PROJECT, modules: ['sipoc'] }, { ...DATASET, modules: ['process-capability', 'histogram'] }] };
  assert.deepEqual(validateValue(ok, 'examples-index').errors, []);
  assert.equal(validateValue({ version: '1.0', examples: [PROJECT] }, 'examples-index').ok, false);
  assert.equal(validateValue({ version: '1.0', examples: [SCENARIO] }, 'examples-index').ok, false);
  assert.equal(validateValue({ version: '1.0', examples: [{ ...PROJECT, modules: [] }] }, 'examples-index').ok, false);
});

test('scenarios: gültig mit optionalem projectName; Item-Muster und Pflichtfelder', () => {
  assert.deepEqual(validateValue({ $schema: 'x', scenarios: [SCENARIO, { ...SCENARIO, id: 's2', projectName: L('Pr') }] }, 'scenarios').errors, []);
  assert.equal(validateValue({ scenarios: [{ ...SCENARIO, items: ['p1#'] }] }, 'scenarios').ok, false);
  assert.equal(validateValue({ scenarios: [{ ...SCENARIO, items: ['P1'] }] }, 'scenarios').ok, false);
  const noCycle = { ...SCENARIO };
  delete noCycle.cycle;
  assert.equal(validateValue({ scenarios: [noCycle] }, 'scenarios').ok, false);
  assert.equal(validateValue({ scenarios: [{ ...SCENARIO, type: 'project' }] }, 'scenarios').ok, false);
});

test('Passform: examples/index.json erfüllt examples-index, shared/scenarios.json erfüllt scenarios', () => {
  const index = JSON.parse(readFileSync(join(APP_DIR, 'examples', 'index.json'), 'utf8'));
  const { scenarios } = JSON.parse(readFileSync(join(APP_DIR, 'examples', 'shared', 'scenarios.json'), 'utf8'));
  assert.deepEqual(validateValue({ version: index.version, examples: index.examples }, 'examples-index').errors, []);
  assert.deepEqual(validateValue({ scenarios }, 'scenarios').errors, []);
  assert.equal(scenarios.length, 12);
});
