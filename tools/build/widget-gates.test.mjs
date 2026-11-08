import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkWidgetBindings, loadWidgetSchemas } from './widget-gates.mjs';
import { defineWidget, list, number, object, text, oneOf, columnRef, boolean } from '../../js/core/model.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const widgets = new Map([
  ['stats-table', defineWidget({ name: 'stats-table', props: { rows: list(object({ name: text() })), confLevel: number() } })],
  ['pick', defineWidget({ name: 'pick', value: oneOf(['a', 'b']) })],
  ['col', defineWidget({ name: 'col', value: columnRef(), forKind: 'columnRef' })],
]);
const schema = { fields: { confLevel: number(), mode: oneOf(['a', 'b']), flag: boolean(), ref: columnRef() }, view: { showStats: boolean() } };
const ctx = { widgets, schema, stateSchema: { fields: {} }, viewNames: new Set(['stats', 'helper']) };
const tpl = (html) => [{ path: 'resources/view.html', text: html }];

test('gültige Bindungen', () => {
  assert.deepEqual(checkWidgetBindings(tpl('<div x-widget="stats-table" x-widget-rows="stats" x-widget-conf-level="model.confLevel"></div>'), ctx), []);
  assert.deepEqual(checkWidgetBindings(tpl('<div x-widget="pick" x-widget-value="model.mode"></div>'), ctx), []);
  assert.deepEqual(checkWidgetBindings(tpl('<template x-for="row in items"><div x-widget="stats-table" x-widget-rows="row.rows" x-widget-conf-level="model.confLevel"></div></template>'), ctx), []);
});

test('unbekanntes Widget, unbekannte und fehlende Eingabe, Wert ohne value', () => {
  assert.deepEqual(checkWidgetBindings(tpl('<div x-widget="nope"></div>'), ctx), ['template: resources/view.html: x-widget="nope": unbekanntes Widget']);
  assert.deepEqual(checkWidgetBindings(tpl('<div x-widget="stats-table" x-widget-rows="stats" x-widget-conf-level="model.confLevel" x-widget-digits="stats"></div>'), ctx),
    ['template: resources/view.html: x-widget-digits="stats": stats-table hat keine Eingabe digits']);
  assert.deepEqual(checkWidgetBindings(tpl('<div x-widget="stats-table" x-widget-rows="stats"></div>'), ctx),
    ['template: resources/view.html: x-widget="stats-table": Pflicht-Eingabe x-widget-conf-level fehlt']);
  assert.deepEqual(checkWidgetBindings(tpl('<div x-widget="stats-table" x-widget-rows="stats" x-widget-conf-level="model.confLevel" x-widget-value="model.mode"></div>'), ctx),
    ['template: resources/view.html: x-widget-value="model.mode": stats-table hat keinen Wert']);
});

test('Feldart gegen Feldart', () => {
  assert.deepEqual(checkWidgetBindings(tpl('<div x-widget="pick" x-widget-value="model.flag"></div>'), ctx),
    ['template: resources/view.html: x-widget-value="model.flag": Feldart boolean passt nicht zu oneOf']);
  assert.deepEqual(checkWidgetBindings(tpl('<div x-widget="stats-table" x-widget-rows="stats" x-widget-conf-level="model.nope"></div>'), ctx),
    ['template: resources/view.html: x-widget-conf-level="model.nope": nope ist weder Feld noch Ansichtsfeld']);
  assert.deepEqual(checkWidgetBindings(tpl('<div x-widget="col" x-widget-value="model.ref"></div>'), ctx), []);
});

test('Getter-Pfad unbekannt', () => {
  assert.deepEqual(checkWidgetBindings(tpl('<div x-widget="stats-table" x-widget-rows="missing" x-widget-conf-level="model.confLevel"></div>'), ctx),
    ['template: resources/view.html: x-widget-rows="missing": missing ist weder Getter noch computed des view-Blocks']);
});

test('loadWidgetSchemas: ohne Ordner js/widgets leer', async () => {
  const w = await loadWidgetSchemas(mkdtempSync(join(tmpdir(), 'wg-')));
  assert.equal(w.size, 0);
});

test('collectBindings: nur Getter/computed der obersten Ebene, Zeile des Attributs', async () => {
  const { collectBindings } = await import('./widget-gates.mjs');
  const text = '<div>\n<div x-widget="w" x-widget-rows="stats" x-widget-config="model.cfg" x-widget-other="row.x"></div>\n</div>\n';
  const out = collectBindings([{ path: 'resources/view.html', text: text.replace('<div>\n', '<div x-for="row in rows">\n') }],
    { getters: ['rows'], computed: ['stats'], data: [] });
  assert.deepEqual(out, [{ widget: 'w', prop: 'rows', path: 'stats', computed: true, where: 'resources/view.html:2 x-widget-rows' }]);
});

test('x-for mit mehreren Aliassen: auch der Index ist bekannt', () => {
  assert.deepEqual(checkWidgetBindings(tpl('<template x-for="(row, i) in items"><div x-widget="stats-table" x-widget-rows="row.rows" x-widget-conf-level="i"></div></template>'), ctx), []);
});

test('Pfad tiefer als model.<feld>: Feld ohne Unterfelder, Objektfeld ohne den Schlüssel', () => {
  const deep = { ...ctx, schema: { ...schema, fields: { ...schema.fields, cfg: object({ level: number() }) } } };
  assert.deepEqual(checkWidgetBindings(tpl('<div x-widget="stats-table" x-widget-rows="stats" x-widget-conf-level="model.confLevel.x"></div>'), deep),
    ['template: resources/view.html: x-widget-conf-level="model.confLevel.x": number hat keine Unterfelder (x)']);
  assert.deepEqual(checkWidgetBindings(tpl('<div x-widget="stats-table" x-widget-rows="stats" x-widget-conf-level="model.cfg.nope"></div>'), deep),
    ['template: resources/view.html: x-widget-conf-level="model.cfg.nope": nope ist kein Feld von cfg']);
  assert.deepEqual(checkWidgetBindings(tpl('<div x-widget="stats-table" x-widget-rows="stats" x-widget-conf-level="model.cfg.level"></div>'), deep), []);
});

test('state.<feld> mit dem State-Schema geprüft', () => {
  const withState = { ...ctx, stateSchema: { fields: { level: number() } } };
  assert.deepEqual(checkWidgetBindings(tpl('<div x-widget="stats-table" x-widget-rows="stats" x-widget-conf-level="state.level"></div>'), withState), []);
  assert.deepEqual(checkWidgetBindings(tpl('<div x-widget="stats-table" x-widget-rows="stats" x-widget-conf-level="state.level"></div>'), ctx),
    ['template: resources/view.html: x-widget-conf-level="state.level": level ist weder Feld noch Ansichtsfeld']);
});
