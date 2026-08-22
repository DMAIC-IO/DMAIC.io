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

test('findInlineSvg meldet ein data-ref-Element, das trotzdem selbst zeichnet', () => {
  const hits = findInlineSvg('<svg data-ref="anything"><path d="M1 1 L2 2 L3 3"/></svg>');
  assert.equal(hits.length, 1);
});

test('findInlineSvg meldet ein defs-Element, das daneben selbst zeichnet', () => {
  const hits = findInlineSvg('<svg><defs><marker id="a"/></defs><path d="M1 1 L9 9 L2 8"/></svg>');
  assert.equal(hits.length, 1);
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

test('findPseudoGlyphs prüft jede content-Deklaration einer minifizierten Zeile, nicht nur die erste', () => {
  const line = '.a::before{content:"—"}.b::before{content:"—"}.c::before{content:"▸"}.d::before{content:"—"}';
  const hits = findPseudoGlyphs(line);
  assert.equal(hits.length, 1);
  assert.match(hits[0].text, /▸/);
});
