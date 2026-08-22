import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findInlineSvg, findGlyphs, findPseudoGlyphs } from './no-glyphs.mjs';

test('findInlineSvg meldet ein gezeichnetes Icon', () => {
  const hits = findInlineSvg('<button><svg viewBox="0 0 24 24"><path d="M1 1"/></svg></button>');
  assert.equal(hits.length, 1);
});

test('findInlineSvg lässt Chart-Flächen und Markerdefinitionen durch', () => {
  assert.deepEqual(findInlineSvg('<svg data-ref="chart-svg"></svg>'), []);
  assert.deepEqual(findInlineSvg('<svg><defs><marker id="a"/></defs></svg>'), []);
});

test('findGlyphs meldet eine Icon-Glyphe, nicht aber Umlaute und Typografie', () => {
  assert.equal(findGlyphs('"stable": "● STABIL"').length, 1);
  assert.deepEqual(findGlyphs('"a": "Größe — für Ausführung …"'), []);
});

test('findGlyphs meldet einen Richtungspfeil am Zeilenanfang oder -ende', () => {
  assert.equal(findGlyphs('"back": "← Zurück"').length, 1);
  assert.equal(findGlyphs('"axis": "Temperatur →"').length, 1);
});

test('findGlyphs lässt einen Richtungspfeil mitten im Fließtext durch', () => {
  assert.deepEqual(findGlyphs('"path": "Stat → Quality Tools"'), []);
  assert.deepEqual(findGlyphs('"note": "Temperatur → Ausbeute beobachten"'), []);
});

test('findPseudoGlyphs meldet nur content mit Icon-Glyphe', () => {
  assert.equal(findPseudoGlyphs(".a::before { content: '▸'; }").length, 1);
  assert.deepEqual(findPseudoGlyphs('.a::before { content: "—"; }'), []);
  assert.deepEqual(findPseudoGlyphs('.a::before { content: ""; }'), []);
});
