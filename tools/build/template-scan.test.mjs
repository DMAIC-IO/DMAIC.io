/**
 * Gemeinsame Bausteine der Vorlagenscans (tools/build/template-scan.mjs).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bodyEnd, X_FOR, xForAliases } from './template-scan.mjs';

test('bodyEnd: Groß-/Kleinschreibung der Tags ist egal', () => {
  const html = '<DIV x-a><div></DIV></div>tail';
  assert.equal(bodyEnd(html, '<DIV x-a>'.length, 'DIV'), html.indexOf('</div>'));
  assert.equal(bodyEnd('<div x-a></DIV>', '<div x-a>'.length, 'div'), '<div x-a>'.length);
});

test('bodyEnd: Void-Element hat keinen Rumpf', () => {
  const html = '<INPUT x-async-task="compute"><button></button></div>';
  assert.equal(bodyEnd(html, '<INPUT x-async-task="compute">'.length, 'INPUT'), '<INPUT x-async-task="compute">'.length);
});

test('bodyEnd: selbstschließendes Element hat keinen Rumpf', () => {
  const html = '<x-y/><p></p></x-y>';
  assert.equal(bodyEnd(html, '<x-y/>'.length, 'x-y'), '<x-y/>'.length);
});

test('bodyEnd: selbstschließendes Kind zählt nicht als Tiefe', () => {
  const html = '<x-y a><x-y/></x-y>after';
  assert.equal(bodyEnd(html, '<x-y a>'.length, 'x-y'), html.indexOf('</x-y>'));
});

test('X_FOR: Kopf mit mehreren Aliassen', () => {
  const m = [...'<template x-for="(row, i) in rows"></template>'.matchAll(X_FOR)];
  assert.equal(m.length, 1);
  assert.deepEqual(xForAliases(m[0][1]), ['row', 'i']);
  assert.equal(m[0][2], 'rows');
  assert.deepEqual(xForAliases([...'<template x-for="item in model.items">'.matchAll(X_FOR)][0][1]), ['item']);
});
