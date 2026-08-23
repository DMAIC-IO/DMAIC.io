import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findInlineSvg, findGlyphs, findGlyphsInJs, findGlyphsInHtml, findPseudoGlyphs } from './no-glyphs.mjs';

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

// ── Abschluss-Review 2026-08-22, Loch 1: HTML wird nie gescannt ──────────

test('findGlyphsInHtml meldet eine Glyphe im Textknoten (Loch 1)', () => {
  const hits = findGlyphsInHtml('<button @click.stop="deleteNode(n1)">✕</button>');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].glyph, '✕');
});

test('findGlyphsInHtml meldet eine Glyphe in einem nutzerseitigen Attribut, aber nicht in class/data-*', () => {
  assert.equal(findGlyphsInHtml('<span title="✎ Bearbeiten"></span>').length, 1);
  assert.deepEqual(findGlyphsInHtml('<span class="icon--✎" data-icon="action.edit"></span>'), []);
});

test('findGlyphsInHtml ignoriert HTML-Kommentare', () => {
  assert.deepEqual(findGlyphsInHtml('<!-- ehemals ✕ hier, jetzt icon(action.close) -->'), []);
});

// ── Loch 2: JS wird nie gescannt ──────────────────────────────────────────

test('findGlyphsInJs meldet eine aus einer Funktion zurückgegebene Glyphe (Loch 2)', () => {
  const hits = findGlyphsInJs("glyphX() { return '✕'; },");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].glyph, '✕');
});

test('findGlyphsInJs ignoriert einen Kommentar, der die entfernte Glyphe erklärt', () => {
  assert.deepEqual(findGlyphsInJs("// ✕ wurde durch icon('action.close') ersetzt"), []);
  assert.deepEqual(findGlyphsInJs("/* Früher stand hier '✕' als Text */"), []);
});

// ── Loch 3: Escape-Notation (CSS \\XXXX und JS \\uXXXX) ───────────────────

test('findPseudoGlyphs dekodiert CSS-Escapes (Loch 3)', () => {
  assert.equal(findPseudoGlyphs("content:'\\25B8';").length, 1);
  assert.equal(findPseudoGlyphs('content:"\\2713";').length, 1);
  assert.equal(findPseudoGlyphs('content:"\\2192";').length, 1);
});

test('findGlyphsInJs dekodiert JS-Unicode-Escapes (Loch 3, JS-Spiegelung)', () => {
  const hits = findGlyphsInJs("return this.open ? '\\u25BE' : '\\u25B8';");
  assert.equal(hits.length, 1);
});

// ── Loch 4: nur der erste Anführungsblock einer content-Deklaration ──────

test('findPseudoGlyphs liest jeden Anführungsblock einer content-Deklaration (Loch 4)', () => {
  const hits = findPseudoGlyphs('content:"a" "▸";');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].glyph, '▸');
});

// ── Loch 5: ein Leerzeichen hebelt die i18n-Randregel aus ────────────────

test('findGlyphs trimmt vor dem Randtest (Loch 5)', () => {
  assert.equal(findGlyphs('"a": "→ Worksheet"').length, 1);
  assert.equal(findGlyphs('"a": " → Worksheet"').length, 1);
  assert.equal(findGlyphs('"a": "Worksheet →"').length, 1);
  assert.equal(findGlyphs('"a": "Worksheet → "').length, 1);
});

test('findGlyphs lässt einen echten Fließtext-Pfeil weiter durch (kein Loch-5-Rückfall)', () => {
  assert.deepEqual(findGlyphs('"a": "Stat → Quality Tools"'), []);
});
