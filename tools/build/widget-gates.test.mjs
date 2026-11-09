import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkWidgetBindings, loadWidgetSchemas } from './widget-gates.mjs';
import { defineWidget, list, map, number, object, text, oneOf, columnRef, boolean } from '../../js/core/model.js';
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

test('Zeichenkettenliterale nur für text/oneOf', () => {
  const lw = new Map([['lit', defineWidget({ name: 'lit', props: { m: oneOf(['a', 'b']), n: number(), t: text() } })]]);
  const lctx = { ...ctx, widgets: lw };
  const run = (m, n, t) => checkWidgetBindings(tpl(`<div x-widget="lit" x-widget-m="${m}" x-widget-n="${n}" x-widget-t="${t}"></div>`), lctx);
  assert.deepEqual(run("'a'", 'model.confLevel', "'x'"), []);
  const c = run("'c'", 'model.confLevel', "'x'");
  assert.equal(c.length, 1);
  assert.match(c[0], /oneOf/);
  const num = run("'a'", "'1'", "'x'");
  assert.equal(num.length, 1);
  assert.match(num[0], /text\/oneOf/);
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

test('Klammerschritte: Map-Eintrag und Listeneintrag werden aufgelöst', () => {
  const edits = object({ title: text() });
  const ws = new Map([['ed', defineWidget({ name: 'ed', value: edits })]]);
  const sch = (v) => ({ fields: { items: list(edits) }, view: { stripEdits: map(number({ integer: true, min: 0 }), v) } });
  const html = (p) => tpl(`<template x-for="(s, i) in strips" :key="s.key"><div x-widget="ed" x-widget-value="${p}"></div></template>`);
  const c = (v) => ({ widgets: ws, schema: sch(v), stateSchema: { fields: {} }, viewNames: new Set(['strips']) });
  assert.deepEqual(checkWidgetBindings(html('model.stripEdits[i]'), c(edits)), []);
  assert.deepEqual(checkWidgetBindings(html('model.items[i]'), c(edits)), []);
  const bad = checkWidgetBindings(html('model.stripEdits[i]'), c(text()));
  assert.equal(bad.length, 1);
  assert.match(bad[0], /Feldart/);
  const nope = checkWidgetBindings(html('model.nope[i]'), c(edits));
  assert.equal(nope.length, 1);
  assert.match(nope[0], /weder Feld noch Ansichtsfeld/);
});
